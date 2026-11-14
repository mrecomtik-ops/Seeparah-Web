/**
 * Seeparah unattended Gutenberg acquisition.
 *
 * - Official Project Gutenberg weekly CSV feed (not crawling www.gutenberg.org).
 * - Stable identity and historical author death year for metadata candidates.
 * - Bounded batches, inventory-backed refill, and a PostgreSQL coordinator;
 *   only historic candidates from any official source language enter publication QA.
 * - The full 78k+ multilingual catalogue remains separate for rights review.
 * - Source rights/date verification remains in gutenberg-fast-import.server.
 * - Failures/review records are NOT counted as successful publication.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeGutenbergLanguageCodes } from "@/lib/gutenberg-language";

export type GutenbergCatalogCandidate = {
  gutenberg_id:number;
  title:string;
  author:string;
  author_death_year:number;
  original_publication_year:null;
  catalog_issued:string|null;
  subjects:string;
  priority:number;
  catalog_url:string;
};

const OFFICIAL_FEED="https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
const FEED_MIRRORS=[
  "https://gutenberg.pglaf.org/cache/epub/feeds/pg_catalog.csv",
  "https://mirror.cs.odu.edu/gutenberg-epub/feeds/pg_catalog.csv",
];
const MAX_FEED_BYTES=32*1024*1024;

/** RFC4180 CSV fields, including escaped quotes, multiline quoted fields and CRLF.
 * No CSV parser dependency, and no unbounded row accumulation. */
export function* csvRows(csv:string):Generator<string[]> {
  let row:string[]=[];
  let field="";
  let inQuotes=false;
  for(let i=0;i<csv.length;i++){
    const ch=csv[i]!;
    if(inQuotes){
      if(ch==='"'&&csv[i+1]==='"'){field+='"';i++;}
      else if(ch==='"')inQuotes=false;
      else field+=ch;
    }else if(ch==='"'){
      inQuotes=true;
    }else if(ch===","){
      row.push(field);field="";
    }else if(ch==="\n"){
      row.push(field.replace(/\r$/,""));field="";
      yield row;row=[];
    }else{
      field+=ch;
    }
  }
  if(inQuotes)throw new Error("Gutenberg CSV was truncated inside a quoted field");
  if(field.length||row.length){row.push(field.replace(/\r$/,""));yield row;}
}

function normalize(value:string){
  return value.replace(/\s+/g," ").trim();
}
function parseAuthor(authorsRaw:string):{author:string;death:number}|null{
  const raw=normalize(authorsRaw);
  if(raw.includes(";")||/\[(?:Editor|Translator|Illustrator|Compiler)\]/i.test(raw))return null;
  const m=raw.match(/^(.*?),\s*(?:\d{4}|[^\d]{0,60}?\d{4})-(\d{4})$/);
  if(!m)return null;
  const death=Number(m[2]);
  const author=normalize(raw.replace(/,\s*\d{4}-\d{4}$/,""));
  // Intake candidates who died after 1900 for editorial RIGHTS review only.
  // The fast importer must never auto-publish them on an inferred US-only licence.
  if(!Number.isInteger(death)||death<1450||death>1930||
     author.length<5||author.length>180)return null;
  return {author,death};
}

/** Preselect old original-language books, not US-only rights-cleared claims.
 * The main importer verifies dates and the actual source independently.
 */
export function selectGutenbergCandidates(
  csv:string, maximum=4800, offset=0,
):GutenbergCatalogCandidate[]{
  const iter=csvRows(csv);
  const first=iter.next();
  if(first.done)throw new Error("Empty Gutenberg CSV");
  const fields=first.value;
  const required=["Text#","Type","Issued","Title","Language","Authors","Subjects"];
  const positions=required.map(name=>fields.indexOf(name));
  if(positions.some(i=>i<0))throw new Error("Unrecognized Gutenberg catalog headers");
  const records:GutenbergCatalogCandidate[]=[];
  const seen=new Set<number>();
  for(const row of iter){
    const [idx,type,issued,titleRaw,lang,authorRaw,subjectsRaw]=positions.map(i=>row[i]??"");
    if(type!=="Text"||!normalizeGutenbergLanguageCodes((lang??"").split(/[;,]/gu)).length)continue;
    const id=Number(idx);
    if(!Number.isSafeInteger(id)||id<1||id>9_999_999||seen.has(id))continue;
    const author=parseAuthor(authorRaw!);
    if(!author)continue;
    const title=normalize(titleRaw!);
    // A short name ("Emma") or a source volume is still a legitimate
    // Project Gutenberg eBook. Let source rights and integrity checks
    // decide publication, never arbitrary title wording.
    if(title.length<1||title.length>300)continue;
    const subject=normalize(subjectsRaw??"").slice(0,1200);
    // Strongly prefer complete narrative works and established literary fiction.
    const priority=normalizeGutenbergLanguageCodes((lang??"").split(/[;,]/gu)).some(code=>code!=="en")?-1:
      /fiction|novel|adventure|stories/i.test(subject)?0:
      /history|biograph|essay|literature/i.test(subject)?1:2;
    const catalogIssued=/^\d{4}-\d{2}-\d{2}$/.test(issued!)
      ?issued!:null;
    seen.add(id);
    records.push({
      gutenberg_id:id,title,author:author.author,
      author_death_year:author.death,original_publication_year:null,
      catalog_issued:catalogIssued,subjects:subject,priority,
      catalog_url:OFFICIAL_FEED,
    });
    // Keep the memory/network batch bounded. The feed is ID ordered, with
    // ample early classics; a future refresh can extend beyond this window.
    // Catalog is large but finite. Keep scanning past previously loaded
    // segments so unattended refill never repeats only the first 4,800 works.
  }
  const selected=records.sort((a,b)=>
    a.priority-b.priority || a.gutenberg_id-b.gutenberg_id).slice(offset,offset+maximum);
  if(selected.length<1)throw new Error("Official Gutenberg candidate catalog has been exhausted");
  return selected;
}

/** Select from the already-synchronized official multilingual inventory.
 * Candidates may use any verified original language; author death by 1900
 * and exact source/edition rights remain mandatory for auto-publication.
 * No first-publication date is inferred from Gutenberg's upload date.
 */
export function candidateFromFullInventory(row:{
  gutenberg_id:number;source_type:string;title:string;author_raw:string;
  language_codes:string[];catalog_issued:string|null;subjects:string|null;
}):GutenbergCatalogCandidate|null{
  if(row.source_type!=="Text" ||
     !normalizeGutenbergLanguageCodes(row.language_codes).length)return null;
  const author=parseAuthor(row.author_raw);
  if(!author || author.death>1900)return null;
  const title=normalize(row.title);
  if(title.length<1 || title.length>300)return null;
  const subject=normalize(row.subjects??"").slice(0,1200);
  const priority=normalizeGutenbergLanguageCodes(row.language_codes).some(code=>code!=="en")?-1:
    /fiction|novel|adventure|stories/i.test(subject)?0:
    /history|biograph|essay|literature/i.test(subject)?1:2;
  return {
    gutenberg_id:row.gutenberg_id,title,author:author.author,
    author_death_year:author.death,original_publication_year:null,
    catalog_issued:row.catalog_issued,subjects:subject,priority,
    catalog_url:OFFICIAL_FEED,
  };
}

export async function downloadCatalog():Promise<string>{
  const failures:string[]=[];
  for(const url of FEED_MIRRORS){
    try {
      const r=await fetch(url,{
        headers:{"Accept":"text/csv","User-Agent":"Seeparah-Metadata-Import/1.0 (+https://seeparah.com)"},
        signal:AbortSignal.timeout(30000),
      });
      if(!r.ok)throw new Error("HTTP "+r.status);
      if(Number(r.headers.get("content-length")||"0")>MAX_FEED_BYTES)
        throw new Error("CSV size limit exceeded");
      if(!r.body)throw new Error("Empty Gutenberg CSV response");
      const reader=r.body.getReader();
      let length=0;
      const decoder=new TextDecoder("utf-8",{fatal:true});
      let result="";
      try{
        for(;;){
          const chunk=await reader.read();
          if(chunk.done)break;
          if(!chunk.value)continue;
          length+=chunk.value.byteLength;
          if(length>MAX_FEED_BYTES)throw new Error("Gutenberg CSV exceeds 32 MB limit");
          result+=decoder.decode(chunk.value,{stream:true});
        }
        result+=decoder.decode();
      }finally{reader.releaseLock();}
      if(!result.startsWith("Text#,Type,Issued,Title,Language,Authors"))
        throw new Error("CSV header/encoding mismatch");
      return result;
    }catch(e){
      failures.push(new URL(url).hostname+": "+(e instanceof Error?e.message:String(e)));
    }
  }
  throw new Error("Official Gutenberg mirror CSV unavailable: "+failures.join("; "));
}

type SupabaseAdminDb={
  from(table:string):any;
  rpc(name:string,args?:Record<string,never>):Promise<{data:any;error:{message:string}|null}>;
};
function db():SupabaseAdminDb{
  return supabaseAdmin as unknown as SupabaseAdminDb;
}
/** Retry at most twice for clearly transient network problems; permanent
 * rights, provenance and structural failures never retry without review. */
export function isTransientGutenbergFailure(message:string):boolean{
  // 404 and format/size errors are permanent, NOT transient. This prevents
  // repeatedly fetching absent source files and overwhelming Gutenberg.
  if(/(?:HTTP 404|source exceeds import size|body is too short|copyright|rights|permission)/i.test(message))
    return false;
  return /(?:timed? ?out|timeout|operation was aborted|fetch failed|econnreset|HTTP (?:429|5\d\d)|lookup returned (?:429|5\d\d)|temporary network|rate limit)/i.test(message);
}
/** Legacy pre-v4 jobs incorrectly treated a missing first-print year as a
 * fatal import failure before the manuscript could be checked. The current
 * importer can safely retain a NULL year and hold the edition for review.
 * Exactly one old, unimported official-catalog job is eligible per recovery
 * cycle. No year, rights approval, or published status is inferred. */
export function canRecheckLegacyHistoricalYearJob(job:{
  attempts:number;book_id:string|null;original_publication_year:number|null;
  last_error:string|null;metadata:Record<string,unknown>|null;
}):boolean{
  const m=job.metadata;
  return job.attempts===1 && job.book_id===null &&
    job.original_publication_year===null &&
    job.last_error==="Independent historical first publication year unavailable" &&
    m?.["autopilot"]===true &&
    m?.["metadataSource"]==="Project Gutenberg official weekly CSV" &&
    m?.["catalogUrl"]==="https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv" &&
    typeof m?.["batchId"]==="string" && /^PG-AUTO-\d{4,}$/.test(m["batchId"] as string) &&
    typeof m?.["title"]==="string" && (m["title"] as string).trim().length>=2 &&
    typeof m?.["author"]==="string" && (m["author"] as string).length>=3 &&
    Number.isInteger(m?.["authorDeathYear"]) &&
    (m?.["legacyYearRecheckVersion"]===undefined);
}

/** The regular refill keeps ten jobs queued. Recover one legacy job on
 * each minute tick at most, with a hard queue-depth cap of eleven; this
 * clears the 447 safe-to-recheck legacy records without a manual restart.
 * Their provenance and rights are re-evaluated from scratch. */
export function legacyDateRecoveryDue(utcMinute:number,queued:number):boolean{
  return Number.isInteger(utcMinute)&&utcMinute>=0&&utcMinute<60&&
    Number.isInteger(queued)&&queued>=0&&queued<=10;
}
async function requeueOneLegacyHistoricalYearJob(client:SupabaseAdminDb):Promise<void>{
  // One dated metadata recheck per scheduled tick; queue remains <=11.
  const utcMinute=new Date().getUTCMinutes();
  const {count,error:countError}=await client.from("gutenberg_import_jobs")
    .select("id",{count:"exact",head:true}).eq("status","queued");
  if(countError || !legacyDateRecoveryDue(utcMinute,count??-1)){
    if(countError)console.error("[gutenberg-autopilot] legacy queue depth",countError.message);
    return;
  }
  const {data:olderJobs,error:readError}=await client.from("gutenberg_import_jobs")
    .select("id,attempts,book_id,original_publication_year,last_error,metadata")
    .eq("status","failed")
    .eq("last_error","Independent historical first publication year unavailable")
    .eq("attempts",1).is("book_id",null)
    .contains("metadata",{autopilot:true,metadataSource:"Project Gutenberg official weekly CSV"})
    .order("id",{ascending:true}).limit(20);
  if(readError){
    console.error("[gutenberg-autopilot] legacy date review read",readError.message);
    return;
  }
  const job=(olderJobs??[]).find((candidate:any)=>canRecheckLegacyHistoricalYearJob(candidate));
  if(!job)return;
  const {error:updateError}=await client.from("gutenberg_import_jobs").update({
    status:"queued",last_error:null,
    metadata:{...job.metadata,legacyYearRecheckVersion:"gutenberg-v4-safe-metadata-review"},
    updated_at:new Date().toISOString(),
  }).eq("id",job.id).eq("status","failed")
    .eq("last_error","Independent historical first publication year unavailable");
  if(updateError)console.error("[gutenberg-autopilot] legacy job requeue",updateError.message);
  else console.log("[gutenberg-autopilot] requeued one old date-unverified job for full v4 checks",job.id);
}

/** An interrupted Worker is recoverable only if no edition was inserted.
 * Never auto-retry a partial book or an unrelated/rights-held failure. */
export function canRetryInterruptedGutenbergJob(job:{
  status:string;gutenberg_id:number;attempts:number;book_id:string|null;
  last_error:string|null;metadata:Record<string,unknown>|null;
}):boolean{
  return job.status==="failed" && Number.isSafeInteger(job.gutenberg_id) &&
    job.gutenberg_id>0 && job.attempts>=1 && job.attempts<3 &&
    job.book_id===null && job.metadata?.["autopilot"]===true &&
    job.last_error==="Import interrupted after 30 minutes; no automatic partial-write retry";
}

async function recoverInterruptedImports(client:SupabaseAdminDb):Promise<void>{
  const staleBefore=new Date(Date.now()-30*60_000).toISOString();
  const {error:staleError}=await client.from("gutenberg_import_jobs").update({
    status:"failed",last_error:"Import interrupted after 30 minutes; no automatic partial-write retry",
    updated_at:new Date().toISOString(),
  }).eq("status","processing")
    .contains("metadata",{autopilot:true})
    .lt("updated_at",staleBefore);
  if(staleError)console.error("[gutenberg-autopilot] stale job recovery",staleError.message);

  // A failed tick can leave the job without a book_id even if the first
  // createBook already wrote a draft. Resolve that state by import_key before
  // any retry. An existing book is held for reconciliation, NEVER recreated
  // or automatically approved by this recovery path.
  const {data:interrupted,error:interruptedError}=await client.from("gutenberg_import_jobs")
    .select("id,status,gutenberg_id,attempts,book_id,last_error,metadata")
    .eq("status","failed")
    .eq("last_error","Import interrupted after 30 minutes; no automatic partial-write retry")
    .contains("metadata",{autopilot:true}).is("book_id",null)
    .lt("attempts",3).order("updated_at",{ascending:true}).limit(3);
  if(interruptedError){
    console.error("[gutenberg-autopilot] interrupted retry lookup",interruptedError.message);
  } else for(const job of interrupted??[]){
    if(!canRetryInterruptedGutenbergJob(job))continue;
    const {data:existing,error:existingError}=await client.from("books")
      .select("id,status")
      .eq("import_key","gutenberg-fast:"+job.gutenberg_id+":en")
      .limit(1).maybeSingle();
    if(existingError){
      console.error("[gutenberg-autopilot] partial book lookup",existingError.message);
      continue;
    }
    if(existing){
      const {error:holdError}=await client.from("gutenberg_import_jobs").update({
        status:"in_review",book_id:existing.id,
        last_error:"Interrupted import has an existing "+existing.status+
          " edition; reconcile source and approvals before continuing",
        updated_at:new Date().toISOString(),
      }).eq("id",job.id).eq("status","failed")
        .eq("last_error",job.last_error);
      if(holdError)console.error("[gutenberg-autopilot] partial edition hold",holdError.message);
      continue;
    }
    const {error:requeueError}=await client.from("gutenberg_import_jobs").update({
      status:"queued",last_error:null,
      metadata:{...job.metadata,interruptionRetryVersion:"gutenberg-v5-checked-no-book"},
      updated_at:new Date().toISOString(),
    }).eq("id",job.id).eq("status","failed")
      .eq("last_error",job.last_error).is("book_id",null);
    if(requeueError)console.error("[gutenberg-autopilot] interrupted requeue",requeueError.message);
    else console.log("[gutenberg-autopilot] requeued interrupted source",job.gutenberg_id);
  }

  const retryBefore=new Date(Date.now()-20*60_000).toISOString();
  const {data:retryable,error:retryError}=await client.from("gutenberg_import_jobs")
    .select("id,attempts,last_error")
    .eq("status","failed").is("book_id",null)
    .contains("metadata",{autopilot:true})
    .lt("attempts",3).lt("updated_at",retryBefore)
    // The oldest 650 failed jobs have permanent unverified dates; selecting
    // the first 10 forever hides actual HTTP 521/timeout transient failures.
    .or("last_error.ilike.%timeout%,last_error.ilike.%timed out%,last_error.ilike.%aborted%,last_error.ilike.%fetch failed%,last_error.ilike.%HTTP 5%,last_error.ilike.%lookup returned 5%,last_error.ilike.%rate limit%,last_error.ilike.%HTTP 429%")
    .order("id").limit(10);
  if(retryError){
    console.error("[gutenberg-autopilot] retry query unavailable",retryError.message);
    return;
  }
  for(const job of retryable??[]){
    if(!isTransientGutenbergFailure(job.last_error??""))continue;
    await client.from("gutenberg_import_jobs").update({
      status:"queued",last_error:null,updated_at:new Date().toISOString(),
    }).eq("id",job.id).eq("status","failed");
  }
}
export async function runGutenbergAutopilotOnce():Promise<void>{
  const client=db();
  const {data:settings,error:settingsError}=await client.from("gutenberg_autopilot_settings")
    .select("enabled,target_published,batch_size,catalog_checked_at,catalog_loaded_at,catalog_offset")
    .eq("id",1).maybeSingle();
  if(settingsError){
    console.error("[gutenberg-autopilot] settings error",settingsError.message);return;
  }
  if(!settings?.enabled)return;
  await recoverInterruptedImports(client);
  await requeueOneLegacyHistoricalYearJob(client);

  const {data:plan,error:planError}=await client.rpc("gutenberg_autopilot_prepare_batch");
  if(planError){
    console.error("[gutenberg-autopilot] batch preparation failed",planError.message);return;
  }
  if(plan?.status==="complete"||plan?.status==="paused")return;
  if(plan?.status!=="needs_catalog"&&plan?.status!=="running"&&
     plan?.status!=="batch_started")return;
  // Scan the whole official multilingual inventory in bounded slices even
  // when an English queue is running. Otherwise minority languages starve.

  // Full official CSV was synchronized separately into private Supabase
  // inventory (78k+). Refill the rights-eligible pool from that immutable
  // checkpoint; never redownload the giant CSV per import batch.
  const offset=Number(settings.catalog_offset||0);
  const {data:inventory,error:inventoryError}=await client
    .from("gutenberg_catalog_inventory")
    .select("gutenberg_id,source_type,title,author_raw,language_codes,catalog_issued,subjects")
    .order("gutenberg_id",{ascending:true}).range(offset,offset+499);
  if(inventoryError){
    console.error("[gutenberg-autopilot] private inventory unavailable",inventoryError.message);
    return;
  }
  if(!inventory?.length){
    if(plan?.status==="needs_catalog")
      console.log("[gutenberg-autopilot] official inventory exhausted",offset);
    return;
  }
  const candidates=inventory.map((item:any)=>candidateFromFullInventory(item))
    .filter((item:GutenbergCatalogCandidate|null):item is GutenbergCatalogCandidate=>item!==null);
  for(let i=0;i<candidates.length;i+=200){
    const {error}=await client.from("gutenberg_catalog_candidates")
      .upsert(candidates.slice(i,i+200),{onConflict:"gutenberg_id",ignoreDuplicates:true});
    if(error){
      console.error("[gutenberg-autopilot] eligible candidate upsert",error.message);return;
    }
  }
  const {error:cursorError}=await client.from("gutenberg_autopilot_settings")
    .update({
      catalog_offset:offset+inventory.length,
      catalog_checked_at:new Date().toISOString(),
      catalog_loaded_at:new Date().toISOString(),
      last_error:null,updated_at:new Date().toISOString(),
    }).eq("id",1).eq("enabled",true);
  if(cursorError){console.error("[gutenberg-autopilot] inventory cursor",cursorError.message);return;}
  const next=await client.rpc("gutenberg_autopilot_prepare_batch");
  if(next.error)console.error("[gutenberg-autopilot] queue refill",next.error.message);
  else console.log("[gutenberg-autopilot] inventory",JSON.stringify({
    examined:inventory.length,rightsCandidates:candidates.length,cursor:offset+inventory.length,
    plan:next.data,
  }));
}
