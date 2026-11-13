/**
 * Private Gutenberg fast track, one vetted source per Cloudflare cron tick.
 * Keep source bytes and covers; reuse existing idempotent Seeparah importer,
 * source checks and publish gate. No mass scraping of Gutenberg's main site.
 */
import { createHash } from "node:crypto";
import { formatAuthorName } from "@/lib/author-name";

const MIRROR = "https://gutenberg.pglaf.org";
// Preserve longer complete originals instead of rejecting them at 4 MB.
const MAX_TEXT = 12 * 1024 * 1024;
/** One-time pilot identities checked against their individual Gutenberg
 * catalog pages plus historical publication records. A fallback is allowed
 * ONLY for these entries when hosted Gutendex metadata times out, and their
 * exact Gutenberg source is still mandatory before publication. */
const VETTED_PILOT: Record<number, {
  title: string; author: string; deathYear: number; year: number;
}> = {
  55: { title: "The Wonderful Wizard of Oz", author: "Baum, L. Frank", deathYear: 1919, year: 1900 },
  74: { title: "The Adventures of Tom Sawyer", author: "Twain, Mark", deathYear: 1910, year: 1876 },
  15: { title: "Moby Dick; Or, The Whale", author: "Melville, Herman", deathYear: 1891, year: 1851 },
  345: { title: "Dracula", author: "Stoker, Bram", deathYear: 1912, year: 1897 },
  1342: { title: "Pride and Prejudice", author: "Austen, Jane", deathYear: 1817, year: 1813 },
  98: { title: "A Tale of Two Cities", author: "Dickens, Charles", deathYear: 1870, year: 1859 },
  1400: { title: "Great Expectations", author: "Dickens, Charles", deathYear: 1870, year: 1861 },
  23: { title: "Narrative of the Life of Frederick Douglass, an American Slave", author: "Douglass, Frederick", deathYear: 1895, year: 1845 },
  41: { title: "The Legend of Sleepy Hollow", author: "Irving, Washington", deathYear: 1859, year: 1820 },
  158: { title: "Emma", author: "Austen, Jane", deathYear: 1817, year: 1815 },
  174: { title: "The Picture of Dorian Gray", author: "Wilde, Oscar", deathYear: 1900, year: 1890 },
};

export function curatedPilotMetadata(id: number, year: number): Catalog {
  const selected = VETTED_PILOT[id];
  if (!selected || year !== selected.year)
    throw new Error("Catalog API unavailable; no independent rights-cleared pilot identity");
  return {
    id, title: selected.title, media_type: "Text",
    copyright: false, languages: ["en"],
    authors: [{ name: selected.author, death_year: selected.deathYear }],
    editors: [], translators: [],
    // These are *candidate* locations; downloaded bytes still must pass
    // Gutenberg source signatures, length, UTF-8 and source SHA256 checks.
    formats: {
      "text/plain; charset=utf-8": MIRROR + "/cache/epub/" + id + "/pg" + id + ".txt",
      "image/jpeg": MIRROR + "/cache/epub/" + id + "/pg" + id + ".cover.medium.jpg",
    },
    subjects: ["English literature"], summaries: [],
  };
}
type Catalog = {
  id: number; title: string; media_type: string; copyright: boolean | null;
  languages: string[]; authors: Array<{name: string;death_year: number|null}>;
  translators?: Array<{name:string}>;editors?: Array<{name:string}>;
  formats: Record<string,string>;summaries?:string[];subjects?:string[];
};
type Job = {
  id:number;gutenberg_id:number;original_publication_year:number|null;attempts:number;
  metadata?: Record<string,unknown>|null;
};

/** Strict fallback for the owner's manually selected, source-checked batch.
 * Other queue jobs and arbitrary IDs must never be treated as verified.
 * This is only metadata provenance, not approval to skip source/rights checks.
 */
export function vettedBatchMetadata(job: Job & {original_publication_year:number}): Catalog {
  const meta = job.metadata;
  const batch = meta?.["batchId"];
  const title = meta?.["title"];
  const author = meta?.["author"];
  const deathYear = meta?.["authorDeathYear"];
  const source = meta?.["metadataSource"];
  const firstPublication = meta?.["originalPublicationYear"];
  if (typeof batch !== "string" ||
      !/^PG-20\d\d-\d\d-\d\d-B50-\d\d$/.test(batch) ||
      source !== "Gutenberg catalogue page reviewed" ||
      firstPublication !== job.original_publication_year ||
      !Number.isSafeInteger(job.gutenberg_id) ||
      job.gutenberg_id < 1 || job.gutenberg_id > 9_999_999 ||
      typeof title !== "string" || title.trim().length < 3 ||
      title.length > 200 || typeof author !== "string" ||
      author.trim().length < 3 || author.length > 120 ||
      typeof deathYear !== "number" ||
      !Number.isInteger(deathYear) || deathYear < 1400 ||
      deathYear > 1925 || job.original_publication_year < 1400 ||
      job.original_publication_year > 1900) {
    throw new Error("No separately reviewed Gutenberg batch identity for this source");
  }
  const id = job.gutenberg_id;
  return {
    id, title: title.trim(), media_type: "Text", copyright: false,
    languages: ["en"], authors: [{ name: author.trim(), death_year: deathYear }],
    translators: [], editors: [],
    formats: {
      "text/plain; charset=utf-8": MIRROR + "/cache/epub/" + id + "/pg" + id + ".txt",
      "image/jpeg": MIRROR + "/cache/epub/" + id + "/pg" + id + ".cover.medium.jpg",
    },
    subjects: ["English literature"], summaries: [],
  };
}

/** Pure official weekly CSV fallback, not a fictitious Gutenberg copyright
 * assertion. Publication additionally requires independent Open Library
 * first-publication evidence and the actual primary source rights checks.
 */
export function officialCatalogMetadata(job:Job):Catalog{
  const m=job.metadata;
  const batch=m?.["batchId"];
  const title=m?.["title"];
  const author=m?.["author"];
  const death=m?.["authorDeathYear"];
  if(m?.["autopilot"]!==true ||typeof batch!=="string" ||
     !/^PG-AUTO-\d{4,}$/.test(batch) ||
     m?.["metadataSource"]!=="Project Gutenberg official weekly CSV" ||
     m?.["catalogUrl"]!=="https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv" ||
     typeof title!=="string"||title.length<8||title.length>250||
     typeof author!=="string"||author.length<3||author.length>200||
     typeof death!=="number"||!Number.isInteger(death)||death<1400||death>1930||
     !Number.isSafeInteger(job.gutenberg_id)||job.gutenberg_id<1 ||
     job.gutenberg_id>9_999_999) {
    throw new Error("Unverified Gutenberg official CSV batch identity");
  }
  const id=job.gutenberg_id;
  return {
    id,title,media_type:"Text",copyright:null,
    languages:["en"],authors:[{name:author,death_year:death}],
    translators:[],editors:[],
    formats:{
      "text/plain; charset=utf-8":MIRROR+"/cache/epub/"+id+"/pg"+id+".txt",
      "image/jpeg":MIRROR+"/cache/epub/"+id+"/pg"+id+".cover.medium.jpg",
    },subjects:typeof m?.["subjects"]==="string"?[m["subjects"]]:[],
    summaries:[],
  };
}

/** Keep persistent batch provenance even after a queue job finishes. */
export function mergeImportJobMetadata(
  original: Record<string,unknown>|null|undefined,
  result: Record<string,unknown>|null|undefined,
): Record<string,unknown> {
  return {...(original??{}),...(result??{})};
}

type Result = {
  status:"published"|"in_review"|"skipped";bookId:string|null;
  sha256?:string;metadata?:Record<string,unknown>;message?:string;
};
export function verifyGutenbergCandidate(
  b:Catalog,id:number,year:number|null,origin="Gutendex",
) {
  // Metadata eligibility is NOT a publication licence. Review all rights
  // and territories before approving a newer work.
  const candidateEligible=b.copyright===false ||
    (origin==="official Gutenberg weekly CSV" && b.copyright===null &&
     b.authors?.length===1 && typeof b.authors[0]?.death_year==="number" &&
     b.authors[0].death_year<=1930 && (year===null||year<=1930));
  if (b.id!==id || !candidateEligible || b.media_type!=="Text" ||
      !b.title?.trim() || b.languages?.length!==1 || b.languages[0]!=="en")
    throw new Error("Catalog is not an unrestricted English original work");
  if (b.authors?.length!==1 || !b.authors[0]?.name ||
      typeof b.authors[0].death_year!=="number" ||
      b.authors[0].death_year>1930 ||
      b.authors[0].death_year<1400 ||
      (year!==null&&(year>1930 || year<1400)))
    throw new Error("Author lifespan or original publication date needs separate rights review");
  if ((b.translators?.length??0)>0 || (b.editors?.length??0)>0)
    throw new Error("Named editor or translator needs separate rights clearance");
  if (!Object.keys(b.formats??{}).some(k=>k.startsWith("text/plain")))
    throw new Error("No original plain-text edition available");
  return {author:b.authors[0].name,deathYear:b.authors[0].death_year};
}
export function extractGutenbergBody(raw:string):string {
  const start = /^\s*\*{3}\s*START OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\r\n]*\*{3}[^\S\r\n]*$/im;
  const end = /^\s*\*{3}\s*END OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\r\n]*\*{3}[^\S\r\n]*$/im;
  const a=start.exec(raw);
  if(!a) throw new Error("Explicit Gutenberg START boundary missing");
  const tail=raw.slice(a.index+a[0].length);
  const b=end.exec(tail);
  if(!b) throw new Error("Explicit Gutenberg END boundary missing");
  const body=tail.slice(0,b.index).replace(/^\s*\r?\n/,"").replace(/\s+$/,"");
  // Gutenberg includes poems, short stories, letters and pamphlets. A short
  // complete source is still a valid work when both Gutenberg boundaries
  // and its exact bytes are preserved. Reject only empty/placeholder bodies.
  if(body.length<180 || body.split(/\s+/u).length<20)
    throw new Error("Source body is empty or too small to be a readable work");
  return body;
}
async function getBytes(url:string,max:number) {
  const r=await fetch(url,{
    headers:{Accept:"*/*","User-Agent":"Seeparah-Catalog/1.0 (+https://seeparah.com)"},
    signal:AbortSignal.timeout(13000)
  });
  if(!r.ok)throw new Error("Gutenberg mirror HTTP "+r.status);
  if(Number(r.headers.get("content-length")||"0")>max)throw new Error("Source exceeds import size");
  if(!r.body)throw new Error("Mirror response empty");
  const reader=r.body.getReader();
  const chunks:Uint8Array[]=[];let bytes=0;
  try {
    for(;;){
      const part=await reader.read();
      if(part.done)break;
      if(!part.value)continue;
      bytes+=part.value.length;
      if(bytes>max)throw new Error("Source exceeds import size");
      chunks.push(part.value);
    }
  } finally {reader.releaseLock();}
  const all=new Uint8Array(bytes);let offset=0;
  for(const piece of chunks){all.set(piece,offset);offset+=piece.length;}
  return all;
}
/** Prefer the Gutenberg-operated high-speed mirror, then the ODU mirror
 * listed by Project Gutenberg. This deliberately does not harvest the
 * www.gutenberg.org human-facing site. */
async function getGutenbergAsset(id:number,name:string,max:number){
  const endpoints=[
    MIRROR+"/cache/epub/"+id+"/"+name,
    "https://mirror.cs.odu.edu/gutenberg-epub/"+id+"/"+name,
  ];
  const failures:string[]=[];
  for(const address of endpoints){
    try { return await getBytes(address,max); }
    catch(error){
      const cause=error instanceof Error?error.message:String(error);
      failures.push(new URL(address).hostname+": "+cause);
    }
  }
  throw new Error("Both authorized Gutenberg mirrors unavailable: "+failures.join(" | "));
}
function duplicate(value: unknown){
  if (!value || typeof value !== "object") return false;
  const e = value as { message?: string | undefined; statusCode?: string | number | undefined };
  return /already exists|Duplicate|409/i.test(e.message ?? "") || String(e.statusCode) === "409";
}
function description(b:Catalog,author:string,_year:number|null){
  const summary=(b.summaries??[]).find(s=>s.length>=60&&s.length<5000);
  if(summary)return summary.trim().slice(0,2400);
  // Never claim a verified first-print year or complete edition in the
  // public description solely because an unreliable catalog lookup said so.
  return b.title+" by "+formatAuthorName(author)+
    ". Source-based English-language text from the specified Project Gutenberg edition. "+
    "The full manuscript is archived with its source checksum; readers can consult "+
    "the original's preserved chapters, contents and bibliographic attribution.";
}
export async function processGutenbergImportQueueOnce():Promise<void>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  // One operational pause must halt both auto-discovered and manually queued
  // Gutenberg imports. Never consume jobs while provenance QA is paused.
  const {data:settings,error:settingsError}=await db.from("gutenberg_autopilot_settings")
    .select("enabled").eq("id",1).maybeSingle();
  if(settingsError || settings?.enabled !== true)return;
  const {data:queued,error:readError}=await db.from("gutenberg_import_jobs")
    .select("id,gutenberg_id,original_publication_year,attempts,metadata")
    .eq("status","queued").order("id").limit(1).maybeSingle();
  if(readError){console.error("[Gutenberg] queue read error",readError.message);return;}
  if(!queued)return;
  const job=queued as Job;
  const {data:locked,error:lockError}=await db.from("gutenberg_import_jobs").update({
    status:"processing",attempts:job.attempts+1,updated_at:new Date().toISOString()
  }).eq("id",job.id).eq("status","queued").select("id").maybeSingle();
  if(lockError||!locked)return;
  try{
    const result=await importGutenbergSource(job);
    const {error:updateError}=await db.from("gutenberg_import_jobs").update({
      status:result.status,book_id:result.bookId,
      source_sha256:result.sha256??null,
      metadata:mergeImportJobMetadata(job.metadata,result.metadata),
      last_error:result.message??null,updated_at:new Date().toISOString()
    }).eq("id",job.id);
    if(updateError)throw updateError;
    console.log("[Gutenberg] source",job.gutenberg_id,result.status);
  }catch(error){
    const msg=error instanceof Error?error.message:String(error);
    await db.from("gutenberg_import_jobs").update({
      status:"failed",last_error:msg.slice(0,900),updated_at:new Date().toISOString()
    }).eq("id",job.id);
    console.error("[Gutenberg] import error",job.gutenberg_id,msg);
  }
}
/** Identical literary works can arrive from different Gutenberg eBook IDs.
 * Compare normalized title and original-author identity, not exact bytes
 * or raw punctuation; never collapse distinct editions without review. */
/** Recognize physical CHAPTER headings in verified Gutenberg source text.
 * A chapter existing in raw source but absent from stored structure is a
 * publication blocker, not a cosmetic navigation bug. */
export function countSourceChapterHeadings(text: string): number {
  return [...text.matchAll(/^[ \t]*CHAPTER[ \t]+(?:[IVXLCDM]+|\d+)(?=[ \t.:\n]|$)/gim)].length;
}

/** The Gutenberg plain text can contain *two* lists of CHAPTER headings:
 * a printed CONTENTS table and the real body. Previously both lists were
 * counted, producing false "74 source chapters / 37 reader chapters" holds.
 *
 * Exclude a printed contents list only with positive evidence:
 * - an explicit early CONTENTS heading;
 * - equal-sized, identically numbered, ordered contents and body headings;
 * - all physical body chapter markers matched by parsed chapter navigation.
 * If any of this evidence is missing, return the raw source count and send
 * the edition to review rather than conceal a missing actual chapter.
 */
export function auditGutenbergSourceChapterMarkers(
  manuscript:string,
  parsedChapters:readonly {title:string}[],
):{rawChapterMarkers:number;bodyChapterMarkers:number;printedContentsEntries:number}{
  const matches=[...manuscript.matchAll(/^[ \t]*CHAPTER[ \t]+(?:[IVXLCDM]+|\d+)(?=[ \t.:\n]|$)/gim)];
  const rawChapterMarkers=matches.length;
  const unchanged={rawChapterMarkers,bodyChapterMarkers:rawChapterMarkers,printedContentsEntries:0};
  const n=parsedChapters.length;
  if(n<3||rawChapterMarkers!==2*n)return unchanged;
  const contents=/^[ \t]*(?:TABLE[ \t]+OF[ \t]+)?CONTENTS[ \t]*\.?[ \t]*$/im.exec(manuscript);
  if(!contents||contents.index>Math.min(20000,Math.floor(manuscript.length/4)))return unchanged;
  const listed=matches.slice(0,n);
  const body=matches.slice(n);
  const firstListed=listed[0];
  const lastListed=listed[n-1];
  const firstBody=body[0];
  if(!firstListed||!lastListed||!firstBody)return unchanged;
  const firstListOffset=firstListed.index??0;
  const lastListOffset=lastListed.index??0;
  const bodyOffset=firstBody.index??0;
  if(firstListOffset<=contents.index ||
     lastListOffset-firstListOffset>Math.max(3000,n*140) ||
     bodyOffset-lastListOffset<150)return unchanged;
  const marker=(text:string):string|null=>
    /^\s*CHAPTER\s+([IVXLCDM]+|\d+)(?=[\s.:]|$)/iu.exec(text)?.[1]?.toUpperCase()??null;
  if(!body.every((entry,i)=>{
    const identity=marker(entry[0]);
    return identity!==null &&
      identity===marker(listed[i]?.[0]??"") &&
      identity===marker(parsedChapters[i]?.title??"");
  }))return unchanged;
  return {rawChapterMarkers,bodyChapterMarkers:n,printedContentsEntries:n};
}

export function likelyDuplicateGutenbergWork(
  incomingTitle: string, incomingAuthor: string,
  known: { title: string; author: string },
): boolean {
  const norm = (value: string) => value.normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    .replace(/\s+/g, " ");
  const { formatAuthorName } = requireAuthorNameForComparison();
  const authorFamily = (name: string) =>
    norm(formatAuthorName(name)).split(" ").at(-1) ?? "";
  return norm(incomingTitle).length >= 6 &&
    norm(incomingTitle) === norm(known.title) &&
    authorFamily(incomingAuthor).length >= 3 &&
    authorFamily(incomingAuthor) === authorFamily(known.author);
}

function requireAuthorNameForComparison() {
  // This local synchronous implementation mirrors the public display
  // normalizer for the stable original-creator surname only.
  const formatAuthorName = (value: string) => {
    const primary = value.split(";")[0]?.trim() ?? value.trim();
    const fragments = primary.split(",").map((item) => item.trim());
    if (fragments.length < 2) return primary;
    return `${fragments.slice(1).join(" ")} ${fragments[0]}`;
  };
  return { formatAuthorName };
}

/** Gutendex includes a source-specific US copyright flag that the official
 * weekly CSV does not. Attempt its exact-item endpoint, then the documented
 * ids-filter endpoint under a strict network budget. Both responses are
 * matched to the requested Gutenberg number; no fallback may invent rights. */
export async function fetchVerifiedGutendexCatalog(
  id:number,
  fetchFn:typeof fetch=fetch,
):Promise<Catalog>{
  if(!Number.isSafeInteger(id)||id<1||id>9_999_999)
    throw new Error("Invalid Gutenberg metadata ID");
  const options=[
    {url:"https://gutendex.com/books/"+id+"/",list:false,timeout:8500},
    {url:"https://gutendex.com/books/?ids="+id,list:true,timeout:4500},
  ];
  const failures:string[]=[];
  for(const option of options){
    try{
      const response=await fetchFn(option.url,{
        headers:{
          Accept:"application/json",
          "User-Agent":"Seeparah-Edition-Metadata/1.0 (+https://seeparah.com)",
        },
        signal:AbortSignal.timeout(option.timeout),
      });
      if(!response.ok)throw new Error("HTTP "+response.status);
      const payload:unknown=await response.json();
      const candidate=option.list
        ? (payload && typeof payload==="object" && "results" in payload &&
            Array.isArray(payload.results) && payload.results.length===1
            ?payload.results[0]:null)
        :payload;
      if(!candidate||typeof candidate!=="object"||
         (candidate as Catalog).id!==id ||
         typeof (candidate as Catalog).title!=="string"||
         !Array.isArray((candidate as Catalog).authors) ||
         !Array.isArray((candidate as Catalog).languages) ||
         typeof (candidate as Catalog).formats!=="object" ||
         (candidate as Catalog).formats===null)
        throw new Error("Unverified Gutendex ID or malformed metadata");
      // The only permissible source of a positive copyright flag is the
      // verified service response itself. UNKNOWN remains unknown.
      const rights=(candidate as Catalog).copyright;
      if(rights!==true && rights!==false && rights!==null)
        throw new Error("Gutendex copyright field is absent or malformed");
      return candidate as Catalog;
    }catch(error){
      failures.push((option.list?"list":"item")+":"+
        (error instanceof Error?error.message:String(error)).slice(0,130));
    }
  }
  throw new Error("Gutendex catalog unavailable: "+failures.join(" | ").slice(0,310));
}

export async function importGutenbergSource(job:Job):Promise<Result>{
  const {corroborateGutenbergFirstPublication} =
    await import("@/lib/admin/gutenberg-two-source-bibliography.server");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const id=job.gutenberg_id;
  if(!Number.isSafeInteger(id)||id<1||id>9999999)throw new Error("Invalid Gutenberg ID");
  const url="https://www.gutenberg.org/ebooks/"+id;
  const {data:old,error:duplicateError}=await db.from("books")
    .select("id,status").eq("source_scan_id","gutenberg:"+id).limit(1).maybeSingle();
  if(duplicateError)throw new Error(duplicateError.message);
  if(old)return {status:"skipped",bookId:old.id,message:"Existing edition "+old.status};
  const {data:oldUrl,error:urlError}=await db.from("books").select("id,status")
    .eq("source_url",url).limit(1).maybeSingle();
  if(urlError)throw new Error(urlError.message);
  if(oldUrl)return {status:"skipped",bookId:oldUrl.id,message:"Existing Gutenberg source URL"};

  // Gutendex outages must not prevent the author's already-reviewed batch
  // from progressing. Only pre-reviewed metadata may serve as fallback:
  // no arbitrary IDs, unpublished years, or modern contributors. All source
  // text, provenance, cover and existing publication gates still apply.
  let catalog: Catalog;
  let catalogOrigin = "Gutendex";
  let catalogFetchIssue:string|null=null;
  try {
    catalog=await fetchVerifiedGutendexCatalog(id);
  } catch(error) {
    catalogFetchIssue=(error instanceof Error?error.message:String(error)).slice(0,380);
    console.warn("[Gutenberg] metadata API unavailable; checking independently reviewed source",
      id,catalogFetchIssue);
    try {
      catalog=curatedPilotMetadata(id,job.original_publication_year as number);
      catalogOrigin="curated pilot";
    } catch {
      try {
        catalog=vettedBatchMetadata(job as Job & {original_publication_year:number});
        catalogOrigin="owner-reviewed 50-book batch";
      } catch {
        catalog=officialCatalogMetadata(job);
        catalogOrigin="official Gutenberg weekly CSV";
      }
    }
  }
  // When Gutendex times out, the official weekly CSV cannot establish
  // copyright status. Consult the official per-ebook RDF record from the
  // same ID's Gutenberg content mirror rather than assuming every file is
  // unrestricted. Missing/malformed RDF keeps rights UNKNOWN.
  let officialRdfEvidence:Record<string,unknown>|null=null;
  if(catalog.copyright===null){
    try{
      const {parseGutenbergRdfUsRights}=await import("@/lib/admin/gutenberg-rdf-rights.server");
      const rdfBytes=await getGutenbergAsset(id,"pg"+id+".rdf",768*1024);
      const rdfText=new TextDecoder("utf-8",{fatal:true}).decode(rdfBytes);
      const verifiedRights=parseGutenbergRdfUsRights(rdfText,id);
      if(verifiedRights){
        catalog={...catalog,copyright:verifiedRights.copyright};
        catalogOrigin="official Gutenberg weekly CSV + exact-ID RDF";
        officialRdfEvidence={
          source:"official Gutenberg per-ebook RDF",gutenbergId:id,
          rights:verifiedRights.rights,usCopyright:verifiedRights.copyright,
        };
      }
    }catch(error){
      console.warn("[Gutenberg] exact-ID RDF unavailable",id,
        error instanceof Error?error.message:String(error));
    }
  }
  const expected=job.metadata?.["autopilot"]===true;
  if(expected){
    // Match Gutenberg's actual title/author against the independent official
    // feed whenever the Gutendex API responds.
    const fromCsv=officialCatalogMetadata(job);
    const normalized=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,"");
    if(normalized(catalog.title).slice(0,32)!==
       normalized(fromCsv.title).slice(0,32))
      throw new Error("Gutendex / official Gutenberg CSV title mismatch");
    if(normalized(catalog.authors?.[0]?.name??"").slice(0,20)!==
       normalized(fromCsv.authors[0]?.name??"").slice(0,20))
      throw new Error("Gutendex / official Gutenberg CSV author mismatch");
  }
  // Avoid republishing one literary work under a second Gutenberg ID.
  // A possible source-edition conflict remains in review for a librarian,
  // instead of deleting or silently suppressing an existing approved edition.
  const baseToken = catalog.title.toLowerCase().replace(/[^a-z0-9]+/g," ")
    .split(" ").find(t=>t.length>=4 && !["the","with","from","about","volume","book"].includes(t));
  if(baseToken){
    const {data:similar,error:similarError}=await db.from("books")
      .select("id,title,author,status").ilike("title","%"+baseToken+"%")
      .in("status",["published","approved","in_review"]).limit(250);
    if(similarError)throw new Error("Duplicate edition lookup failed: "+similarError.message);
    const duplicateWork=(similar??[]).find((entry:{id:string;title:string;author:string})=>
      likelyDuplicateGutenbergWork(catalog.title,catalog.authors?.[0]?.name??"",entry));
    if(duplicateWork){
      return {status:"in_review",bookId:null,
        message:"Potential alternate Gutenberg edition of existing book "+duplicateWork.id+
          "; requires manual source and edition reconciliation"};
    }
  }
  let originalYear=job.original_publication_year;
  const authorDeath=catalog.authors?.[0]?.death_year;
  if(typeof authorDeath!=="number")throw new Error("Original author death year unavailable");
  // Open Library alone is not enough. A conflicting/missing Wikidata P577
  // puts the source into review rather than causing another 1800-date error.
  const verifiedBibliography=await corroborateGutenbergFirstPublication(
    catalog.title,catalog.authors[0]!.name,authorDeath);
  const yearVerified=Boolean(verifiedBibliography &&
    (originalYear===null||originalYear===verifiedBibliography.year));
  if(originalYear===null && verifiedBibliography){
    originalYear=verifiedBibliography.year;
    const {error:yearError}=await db.from("gutenberg_import_jobs").update({
      original_publication_year:originalYear,
      metadata:mergeImportJobMetadata(job.metadata,{
        originalPublicationYear:originalYear,
        verifiedPublicationEvidence:verifiedBibliography.sources,
        publicationYearEvidence:verifiedBibliography.sources[0]!.url,
      }),updated_at:new Date().toISOString(),
    }).eq("id",job.id);
    if(yearError)throw new Error("Could not save corroborated publication year: "+yearError.message);
    job.original_publication_year=originalYear;
  }
  const yearEvidence=yearVerified?verifiedBibliography!.sources[0]!.url:null;
  const {author,deathYear}=verifyGutenbergCandidate(
    catalog,id,originalYear,catalogOrigin);

  // Never start importing new files once the published catalogue reaches its
  // requested stopping target; the queue is paused, not deleted.
  if(expected){
    const {data:cfg}=await db.from("gutenberg_autopilot_settings")
      .select("enabled,target_published").eq("id",1).maybeSingle();
    if(!cfg?.enabled)return {status:"skipped",bookId:null,message:"Autopilot paused"};
    const {count, error:countError}=await db.from("books")
      .select("id",{count:"exact",head:true}).eq("status","published");
    if(countError)throw new Error(countError.message);
    if((count??0)>=cfg.target_published)
      return {status:"skipped",bookId:null,message:"Target of "+cfg.target_published+" published titles reached"};
  }
  // Gutenberg mirror filenames differ by upload generation and locale.
  // Every fallback remains inside the SAME verified Gutenberg ID directory.
  let original:Uint8Array|null=null;
  let sourceFile="";
  const fileErrors:string[]=[];
  for(const name of ["pg"+id+".txt","pg"+id+".txt.utf8",
                     "pg"+id+"-0.txt",id+"-0.txt"]){
    try{original=await getGutenbergAsset(id,name,MAX_TEXT);sourceFile=name;break;}
    catch(e){fileErrors.push(name+": "+(e instanceof Error?e.message:String(e)));}
  }
  if(!original)throw new Error("No complete Gutenberg plain-text source for eBook "+
    id+"; review EPUB/HTML source formats. "+fileErrors.join(" | ").slice(0,600));
  const rawText=new TextDecoder("utf-8",{fatal:true}).decode(original);
  const manuscript=extractGutenbergBody(rawText);
  const sha256=createHash("sha256").update(original).digest("hex");
  const sourceKey="gutenberg/"+id+"/pg"+id+"-"+sha256.slice(0,12)+".txt";
  const rawUpload=await supabaseAdmin.storage.from("gutenberg-sources").upload(
    sourceKey,original,{contentType:"text/plain",upsert:false});
  if(rawUpload.error&&!duplicate(rawUpload.error))
    throw new Error("Source archive upload failed: "+rawUpload.error.message);

  const {jpegDimensions,adequateBookCover,auditPersistedGutenbergToc,safeClassicAutoPublish}=
    await import("@/lib/admin/gutenberg-publication-qa.server");
  let coverUrl:string|null=null;
  let verifiedCover=false;
  let coverProvenance:Record<string,unknown>={status:"missing_or_unverified"};
  // The first filename is Gutenberg's higher-resolution generated cover; the
  // thumbnail is only accepted when its actual pixel dimensions are adequate.
  // Keep the artwork of the exact Gutenberg edition, never a random title match.
  for(const name of ["cover.jpg","pg"+id+".cover.medium.jpg"]){
    try{
      const jpeg=await getGutenbergAsset(id,name,3*1024*1024);
      const dimensions=jpegDimensions(jpeg);
      if(!adequateBookCover(dimensions))continue;
      const coverHash=createHash("sha256").update(jpeg).digest("hex");
      const path="gutenberg/"+id+"/cover-"+coverHash.slice(0,16)+".jpg";
      const uploaded=await supabaseAdmin.storage.from("book-covers").upload(
        path,jpeg,{contentType:"image/jpeg",upsert:false,cacheControl:"31536000"});
      if(uploaded.error&&!duplicate(uploaded.error))throw uploaded.error;
      coverUrl=supabaseAdmin.storage.from("book-covers").getPublicUrl(path).data.publicUrl;
      verifiedCover=true;
      coverProvenance={gutenbergId:id,filename:name,dimensions,
        sha256:coverHash,storagePath:path,verifiedSourceMirror:true};
      break;
    }catch(error){
      console.warn("[Gutenberg] cover candidate unavailable",id,name,
        error instanceof Error?error.message:String(error));
    }
  }
  const { parseManuscript } = await import("@/lib/manuscript");
  const { auditGutenbergSource, auditGutenbergStoredChunks } =
    await import("@/lib/admin/gutenberg-integrity-gate");
  // Gutenberg plain-text files contain author-supplied lineation and
  // intentional end-of-line hyphens. Do not silently strip those characters
  // in the hard-wrap reflow heuristic: the exact source must survive into
  // stored reader chunks. Browser book mode may visually wrap these lines.
  const parsedManuscript = parseManuscript(manuscript,{preserveLineation:true});
  const originalTextAudit = auditGutenbergSource(manuscript, parsedManuscript);
  if (!originalTextAudit.ok) {
    // Keep the exact mirrored bytes in the immutable source archive, but do
    // NOT create a book whose text parser has lost or altered characters.
    return {
      status: "in_review", bookId: null, sha256,
      metadata: { contentIntegrity: originalTextAudit, sourceArchive: sourceKey },
      message: "Source parsing is not lossless: " + originalTextAudit.errors.join("; ").slice(0,700),
    };
  }
  const parsedChapterNodes = parsedManuscript.structure
    .filter((node) => node.nodeType === "chapter");
  const parsedChapters = parsedChapterNodes.length;
  const sourceHeadingAudit = auditGutenbergSourceChapterMarkers(manuscript,parsedChapterNodes);
  const sourceChapterCount = sourceHeadingAudit.rawChapterMarkers;
  const missingChapterNavigation = sourceHeadingAudit.bodyChapterMarkers >= 2 &&
    parsedChapters < sourceHeadingAudit.bodyChapterMarkers;

  const desc=description(catalog,author,originalYear);
  // Use actual Project Gutenberg catalogue subject headings rather than
  // labelling every imported book as generic Literature. The same private
  // classification function backfilled all existing Gutenberg editions.
  const subjectHeadings=[
    ...(Array.isArray(catalog.subjects)
      ?catalog.subjects.filter((subject):subject is string=>typeof subject==="string")
      :[]),
    ...(typeof job.metadata?.["subjects"]==="string"
      ?[job.metadata["subjects"] as string]:[]),
  ].filter(Boolean).join("; ");
  const {data:classifiedCategories,error:topicError}=await db.rpc(
    "seeparah_classify_book_topics",{
      p_title:catalog.title,
      p_subjects:subjectHeadings,
      p_existing:[],
    });
  if(topicError)throw new Error("Gutenberg category assignment failed: "+topicError.message);
  if(!Array.isArray(classifiedCategories) || !classifiedCategories.length ||
     !classifiedCategories.every((item:unknown)=>typeof item==="string"))
    throw new Error("Gutenberg category assignment returned an invalid category list");
  const assignedCategories=classifiedCategories as string[];
  const {adminCreateBook,scanBookRightsSignals,evaluatePublishGate}=
    await import("@/lib/admin/catalog.server");
  const uploaded=await adminCreateBook({
    title:catalog.title,author,sourceLanguage:"English",
    description:desc,genre:"Literature",categories:assignedCategories,
    coverUrl,sourceUrl:url,sourceEditionId:"gutenberg:"+id,
    rightsBasis:"Original work by "+author+" (died "+deathYear+
      "). "+(yearVerified&&originalYear!==null
        ?"Independently corroborated first publication "+originalYear+". "
        :"Original publication date still pending independent verification. ")+
      "Source identity from "+catalogOrigin+
      (catalog.copyright===false?" reports no US restriction.":" requires separate rights verification.")+
      " Manuscript downloaded from an authorized Gutenberg mirror, "+
      "hash-archived, and subject to independent international rights checks.",
    rightsEvidenceUrl:url,
    attribution:"Original text and cover sourced from Project Gutenberg eBook "+id+
      " for free reading. See the original at "+url+". Seeparah is independent of Project Gutenberg.",
    permittedTerritories:[],translationPermission:false,
    importKey:"gutenberg-fast:"+id+":en",manuscriptText:manuscript,
    preserveLineation:true
  },"system-fast-import");
  if(!uploaded.created)
    return {status:"skipped",bookId:uploaded.bookId,sha256,message:uploaded.reason ?? "Identical source already imported"};

  const bookId=uploaded.bookId;
  // Verify actual persistent reader chunks. Successful createBook calls are
  // not sufficient evidence that the whole original text made it into DB.
  const {data:versionRow,error:versionError}=await db.from("books")
    .select("source_version").eq("id",bookId).single();
  if(versionError)throw new Error("Book source-version verification failed: "+versionError.message);
  const storedChunks:Array<{chunk_index:number;content:string}>=[];
  let storedReadError:string|null=null;
  for(let offset=0;offset<8000;offset+=250){
    const {data:page,error}=await db.from("book_chunks")
      .select("chunk_index,content").eq("book_id",bookId)
      .eq("language","English")
      .eq("source_version",versionRow.source_version)
      .order("chunk_index",{ascending:true}).range(offset,offset+249);
    if(error){storedReadError=error.message;break;}
    storedChunks.push(...(page??[]));
    if((page??[]).length<250)break;
    if(offset===7750)storedReadError="Reader chunk count exceeded the guarded 8000-chunk maximum";
  }
  const storedAudit=storedReadError ? {
    ok:false,errors:["Source stored-chunk read-back failed: "+storedReadError],
    canonicalSha256:"",
  } : auditGutenbergStoredChunks(manuscript,parsedManuscript,storedChunks);
  if(!storedAudit.ok) {
    return {
      status:"in_review",bookId,sha256,
      metadata:{contentIntegrity:originalTextAudit,readBack:storedAudit,sourceArchive:sourceKey},
      message:"Stored source is incomplete or changed: "+storedAudit.errors.join("; ").slice(0,700),
    };
  }
  const persistedToc:Array<{node_key:string;parent_node_key:string|null;node_type:string;
    title:string;ordinal:number;start_chunk_index:number;end_chunk_index:number}>=[];
  let tocReadError:string|null=null;
  for(let offset=0;offset<5000;offset+=250){
    const {data:page,error}=await db.from("book_structure_nodes")
      .select("node_key,parent_node_key,node_type,title,ordinal,start_chunk_index,end_chunk_index")
      .eq("book_id",bookId).eq("language","English")
      .eq("source_version",versionRow.source_version)
      .order("ordinal",{ascending:true}).range(offset,offset+249);
    if(error){tocReadError=error.message;break;}
    persistedToc.push(...(page??[]));
    if((page??[]).length<250)break;
    if(offset===4750)tocReadError="TOC exceeded guarded 5000-node maximum";
  }
  const tocAudit=tocReadError ? {ok:false,errors:[tocReadError],chapterCount:0,tocCount:0}
    : auditPersistedGutenbergToc(parsedManuscript,persistedToc);
  if(!tocAudit.ok){
    return {status:"in_review",bookId,sha256,
      metadata:{sourceIntegrity:originalTextAudit,storedIntegrity:storedAudit,
        tocAudit,coverProvenance,sourceArchive:sourceKey},
      message:"Stored TOC cannot be trusted: "+tocAudit.errors.join("; ").slice(0,700)};
  }
  const {error:metadataError}=await db.from("books").update({
    edition_title:catalog.title+" — Seeparah Reading Edition",
    edition_year:2026,publisher:"Seeparah",
    original_publication_year:originalYear,
    source_scan_id:"gutenberg:"+id,
    source_file_sha256:sha256,source_file_path:"gutenberg-sources/"+sourceKey,
    source_revision:"Original Gutenberg mirror SHA-256 "+sha256,
    authenticity_notes:"Metadata from "+catalogOrigin+". Original English source verified and archived. Author death year "+deathYear+
      "; no translators or editors listed. Full original text retained as "+sourceKey,
    review_notes:"Imported by automated Gutenberg fast-track; subject to source audit."
  }).eq("id",bookId);
  if(metadataError)throw new Error(metadataError.message);
  const auditMeta:Record<string,unknown>={
    pipelineVersion:"gutenberg-v4-lossless-toc-cover",
    title:catalog.title,author,deathYear,year:originalYear,
    sourceUrl:url,coverUrl,sha256,review:"automated",catalogOrigin,catalogFetchIssue,officialRdfEvidence,yearEvidence,
    verifiedBibliography:yearVerified?verifiedBibliography:null,
    coverProvenance,sourceFile,tocAudit,
    subjects:subjectHeadings.slice(0,1500),assignedCategories,
    sourceIntegrity:originalTextAudit,
    storedChunkIntegrity:storedAudit,
    originalSourceArchive:sourceKey,
    sourceChapterMarkers:sourceChapterCount,
    sourceBodyChapterMarkers:sourceHeadingAudit.bodyChapterMarkers,
    excludedPrintedContentsEntries:sourceHeadingAudit.printedContentsEntries,
    sourceStructureChapterCount:parsedChapters,
  };
  if (missingChapterNavigation) {
    return { status: "in_review", bookId, sha256, metadata: auditMeta,
      message: "Source body chapter headings (" + sourceHeadingAudit.bodyChapterMarkers +
        ") exceed imported chapter navigation (" + parsedChapters + "); structural audit required" };
  }
  const rightsSignals=await scanBookRightsSignals(bookId);
  // Check the original PG header as well as stored text: stripping Gutenberg's
  // wrapper must never conceal a contributor's copyright/permission warning.
  const sourceRightsRisk=/(?:copyright\s*(?:©|\(c\))?\s*(?:19[3-9]\d|20\d\d)|all rights reserved|used by (?:special )?permission|license granted solely)/iu.test(rawText);
  const mayPublish=safeClassicAutoPublish({
    gutenbergCopyright:catalog.copyright,
    authorDeathYear:deathYear,firstPublishedYear:originalYear,
    hasModernContributors:(catalog.translators?.length??0)>0||
      (catalog.editors?.length??0)>0,
    // Plain text cannot preserve illustrations that belong to the edition.
    hasUnrenderedIllustrations:/\[(?:illustration|plate|figure)(?:\s*[:\]])/iu.test(manuscript),
    independentBibliographyCount:yearVerified?verifiedBibliography!.sources.length:0,
    hasTextRightsSignals:rightsSignals.length>0||sourceRightsRisk,
    verifiedCover,sourceIntegrity:originalTextAudit.ok,
    storedIntegrity:storedAudit.ok,tocIntegrity:tocAudit.ok,
    warnings:uploaded.warnings.length,
  });
  if(!mayPublish.allowed){
    return {status:"in_review",bookId,sha256,
      metadata:{...auditMeta,publicationReadiness:mayPublish},
      message:"Automated publication requires review: "+
        mayPublish.reasons.join("; ").slice(0,700)};
  }

  // This is an explicit, narrowly scoped automated pilot authorized by owner.
  // It never marks a human as reviewer. Existing Postgres trigger is final gate.
  const {error:reviewError}=await db.from("books").update({
    rights_status:"approved",edition_review_status:"approved",
    structure_review_status:"approved",cleanup_review_status:"approved",
    status:"approved",reviewed_at:new Date().toISOString(),
    review_notes:"AUTOMATED classical-work verification (not human-reviewed): author died "+deathYear+
      "; original publication "+originalYear+
      "; bibliographic evidence "+(yearEvidence??"curated batch record")+
      "; source provenance "+catalogOrigin+"; no named modern contributors; UTF-8 source "+
      "SHA-256 "+sha256+"; complete boundaries, source cover and chapter structure."
  }).eq("id",bookId);
  if(reviewError)return {status:"in_review",bookId,sha256,metadata:auditMeta,
    message:reviewError.message};
  const gate=await evaluatePublishGate(bookId);
  if(!gate.canPublish){
    await db.from("books").update({
      status:"in_review",rights_status:"pending",edition_review_status:"pending",
      structure_review_status:"pending",cleanup_review_status:"pending"
    }).eq("id",bookId);
    return {status:"in_review",bookId,sha256,metadata:auditMeta,
      message:gate.reasons.join("; ").slice(0,800)};
  }
  const {error:publicationError}=await db.from("books").update({
    status:"published"
  }).eq("id",bookId).eq("status","approved");
  if(publicationError)return {status:"in_review",bookId,sha256,metadata:auditMeta,
    message:publicationError.message};
  return {status:"published",bookId,sha256,
    metadata:{...auditMeta,publicationReadiness:mayPublish,publishedWithEvidence:true}};
}
