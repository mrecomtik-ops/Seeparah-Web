/**
 * Seeparah unattended Gutenberg acquisition.
 *
 * - Official Project Gutenberg weekly CSV feed (not crawling www.gutenberg.org).
 * - Stable identity and historical author death year for metadata candidates.
 * - 100 at a time; the private PostgreSQL RPC opens a new batch only when the
 *   previous has no queued/processing jobs and published catalogue < 1000.
 * - Source rights/date verification remains in gutenberg-fast-import.server.
 * - Failures/review records are NOT counted as successful publication.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    if(type!=="Text"||lang!=="en")continue;
    const id=Number(idx);
    if(!Number.isSafeInteger(id)||id<1||id>9_999_999||seen.has(id))continue;
    const author=parseAuthor(authorRaw!);
    if(!author)continue;
    const title=normalize(titleRaw!);
    if(title.length<8||title.length>225||
       /(?:\bvol(?:ume)?s?\.?\s*[ivx\d]|\bpart\s+[ivx\d]+\s+of\s+\d|complete works|selections from|collection of letters)/i.test(title))continue;
    const subject=normalize(subjectsRaw??"").slice(0,1200);
    // Strongly prefer complete narrative works and established literary fiction.
    const priority=/fiction|novel|adventure|stories/i.test(subject)?0:
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

async function downloadCatalog():Promise<string>{
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
  return /(?:timed? ?out|timeout|operation was aborted|mirror.*unavailable|fetch failed|econnreset|http 50[234]|http 429|lookup returned (?:429|50[234])|temporary network|rate limit)/i.test(message);
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

  const retryBefore=new Date(Date.now()-20*60_000).toISOString();
  const {data:retryable,error:retryError}=await client.from("gutenberg_import_jobs")
    .select("id,attempts,last_error")
    .eq("status","failed").is("book_id",null)
    .contains("metadata",{autopilot:true})
    .lt("attempts",3).lt("updated_at",retryBefore)
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

  const {data:plan,error:planError}=await client.rpc("gutenberg_autopilot_prepare_batch");
  if(planError){
    console.error("[gutenberg-autopilot] batch preparation failed",planError.message);return;
  }
  if(plan?.status!=="needs_catalog"){
    if(plan?.status==="batch_started"||plan?.status==="complete")
      console.log("[gutenberg-autopilot] state",JSON.stringify(plan));
    return;
  }

  // Re-query the settings; write "checked" BEFORE the network request.
  // A temporary feed outage should not hammer the authorized mirrors each tick.
  const checked=settings.catalog_checked_at
    ?new Date(settings.catalog_checked_at).getTime():0;
  if(checked && Date.now()-checked<2*60*60*1000)return;
  await client.from("gutenberg_autopilot_settings")
    .update({catalog_checked_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    .eq("id",1);
  try {
    const offset=Number(settings.catalog_offset||0);
    const candidates=selectGutenbergCandidates(await downloadCatalog(),4800,offset);
    for(let i=0;i<candidates.length;i+=250){
      const chunk=candidates.slice(i,i+250);
      const {error}=await client.from("gutenberg_catalog_candidates")
        .upsert(chunk,{onConflict:"gutenberg_id",ignoreDuplicates:true});
      if(error)throw new Error("Catalog insert failed: "+error.message);
    }
    const {error:doneError}=await client.from("gutenberg_autopilot_settings")
      .update({
        catalog_loaded_at:new Date().toISOString(),catalog_offset:offset+candidates.length,
        last_error:null,
        updated_at:new Date().toISOString(),
      }).eq("id",1);
    if(doneError)throw new Error(doneError.message);
    const next=await client.rpc("gutenberg_autopilot_prepare_batch");
    if(next.error)throw new Error(next.error.message);
    console.log("[gutenberg-autopilot] official catalog seeded",
      candidates.length,JSON.stringify(next.data));
  }catch(e){
    const reason=e instanceof Error?e.message:String(e);
    await client.from("gutenberg_autopilot_settings").update({
      last_error:reason.slice(0,1000),updated_at:new Date().toISOString(),
    }).eq("id",1);
    console.error("[gutenberg-autopilot] feed not available",reason);
  }
}
