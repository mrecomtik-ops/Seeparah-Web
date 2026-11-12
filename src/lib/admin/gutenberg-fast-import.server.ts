/**
 * Private Gutenberg fast track, one vetted source per Cloudflare cron tick.
 * Keep source bytes and covers; reuse existing idempotent Seeparah importer,
 * source checks and publish gate. No mass scraping of Gutenberg's main site.
 */
import { createHash } from "node:crypto";
import { formatAuthorName } from "@/lib/author-name";

const MIRROR = "https://gutenberg.pglaf.org";
const MAX_TEXT = 4 * 1024 * 1024;
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
  b:Catalog,id:number,year:number,origin="Gutendex",
) {
  // Metadata eligibility is NOT a publication licence. Review all rights
  // and territories before approving a newer work.
  const candidateEligible=b.copyright===false ||
    (origin==="official Gutenberg weekly CSV" && b.copyright===null &&
     b.authors?.length===1 && typeof b.authors[0]?.death_year==="number" &&
     b.authors[0].death_year<=1930 && year<=1930);
  if (b.id!==id || !candidateEligible || b.media_type!=="Text" ||
      !b.title?.trim() || b.languages?.length!==1 || b.languages[0]!=="en")
    throw new Error("Catalog is not an unrestricted English original work");
  if (b.authors?.length!==1 || !b.authors[0]?.name ||
      typeof b.authors[0].death_year!=="number" ||
      b.authors[0].death_year>1930 ||
      b.authors[0].death_year<1400 ||
      year>1930 || year<1400)
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
  if(body.length<18000 || body.split(/\s+/u).length<3000)
    throw new Error("Body is too short for a complete long-form book");
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
function description(b:Catalog,author:string,year:number){
  const summary=(b.summaries??[]).find(s=>s.length>=60&&s.length<5000);
  if(summary)return summary.trim().slice(0,2400);
  // Never claim a verified first-print year or complete edition in the
  // public description solely because an unreliable catalog lookup said so.
  return b.title+" by "+formatAuthorName(author)+". This source-based English-language edition "+
    "is undergoing bibliographic and structure verification.";
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

export async function importGutenbergSource(job:Job):Promise<Result>{
  const {independentFirstPublicationYear} =
    await import("@/lib/admin/gutenberg-publication-year.server");
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
  try {
    const response=await fetch("https://gutendex.com/books/"+id+"/",{
      headers:{Accept:"application/json"},signal:AbortSignal.timeout(6000)
    });
    if(response.status===404||response.status===400)
      throw new Error("Permanent Gutenberg catalog mismatch: "+response.status);
    if(!response.ok)throw new Error("Gutendex HTTP "+response.status);
    catalog=await response.json() as Catalog;
  } catch(error) {
    if(error instanceof Error && error.message.startsWith("Permanent Gutenberg catalog mismatch"))
      throw error;
    console.warn("[Gutenberg] metadata API unavailable; checking independently reviewed source",
      id,error instanceof Error?error.message:String(error));
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
  let yearEvidence=typeof job.metadata?.["publicationYearEvidence"]==="string"
    ?job.metadata["publicationYearEvidence"]:null;
  if(originalYear===null){
    const authorDeath=catalog.authors?.[0]?.death_year;
    if(typeof authorDeath!=="number")
      throw new Error("Original author death year unavailable");
    const independently=await independentFirstPublicationYear(
      catalog.title,catalog.authors[0]!.name,authorDeath);
    originalYear=independently.year;
    yearEvidence=independently.evidenceUrl;
    const {error:yearError}=await db.from("gutenberg_import_jobs").update({
      original_publication_year:originalYear,
      metadata:mergeImportJobMetadata(job.metadata,{
        originalPublicationYear:originalYear,
        publicationYearEvidence:yearEvidence,
      }),updated_at:new Date().toISOString(),
    }).eq("id",job.id);
    if(yearError)throw new Error("Could not record independent publication date: "+yearError.message);
    job.original_publication_year=originalYear;
    job.metadata=mergeImportJobMetadata(job.metadata,{
      originalPublicationYear:originalYear,publicationYearEvidence:yearEvidence,
    });
  }
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
  const original=await getGutenbergAsset(id,"pg"+id+".txt",MAX_TEXT);
  const rawText=new TextDecoder("utf-8",{fatal:true}).decode(original);
  const manuscript=extractGutenbergBody(rawText);
  const sha256=createHash("sha256").update(original).digest("hex");
  const sourceKey="gutenberg/"+id+"/pg"+id+"-"+sha256.slice(0,12)+".txt";
  const rawUpload=await supabaseAdmin.storage.from("gutenberg-sources").upload(
    sourceKey,original,{contentType:"text/plain",upsert:false});
  if(rawUpload.error&&!duplicate(rawUpload.error))
    throw new Error("Source archive upload failed: "+rawUpload.error.message);

  let coverUrl:string|null=null;
  try{
    const jpeg=await getGutenbergAsset(id,"pg"+id+".cover.medium.jpg",1024*1024);
    if(jpeg.length>2000 && jpeg[0]===255 && jpeg[1]===216 && jpeg[2]===255 &&
       typeof catalog.formats?.["image/jpeg"]==="string"){
      const path="gutenberg/"+id+"/cover-medium.jpg";
      const uploaded=await supabaseAdmin.storage.from("book-covers").upload(
        path,jpeg,{contentType:"image/jpeg",upsert:false,cacheControl:"31536000"});
      if(uploaded.error&&!duplicate(uploaded.error))throw uploaded.error;
      coverUrl=supabaseAdmin.storage.from("book-covers").getPublicUrl(path).data.publicUrl;
    }
  }catch(error){
    console.warn("[Gutenberg] cover requires review",id,error instanceof Error?error.message:String(error));
  }
  const { parseManuscript } = await import("@/lib/manuscript");
  const { auditGutenbergSource, auditGutenbergStoredChunks } =
    await import("@/lib/admin/gutenberg-integrity-gate");
  const parsedManuscript = parseManuscript(manuscript);
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
  const sourceChapterCount = countSourceChapterHeadings(manuscript);
  const parsedChapters = parsedManuscript.structure
    .filter((node) => node.nodeType === "chapter").length;
  const missingChapterNavigation = sourceChapterCount >= 2 &&
    parsedChapters < sourceChapterCount;

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
      "), first published "+originalYear+
      ". Source metadata "+catalogOrigin+
      (catalog.copyright===false?" reports no US restriction.":" requires independent territory rights verification.")+
      " First-print year from "+(yearEvidence??"individually checked batch record")+
      "; full source archived. No named editor or translator recorded.",
    rightsEvidenceUrl:url,
    attribution:"Original text and cover sourced from Project Gutenberg eBook "+id+
      " for free reading. See the original at "+url+". Seeparah is independent of Project Gutenberg.",
    permittedTerritories:[],translationPermission:false,
    importKey:"gutenberg-fast:"+id+":en",manuscriptText:manuscript
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
    title:catalog.title,author,deathYear,year:originalYear,
    sourceUrl:url,coverUrl,sha256,review:"automated",catalogOrigin,yearEvidence,
    subjects:subjectHeadings.slice(0,1500),assignedCategories,
    sourceIntegrity:originalTextAudit,
    storedChunkIntegrity:storedAudit,
    originalSourceArchive:sourceKey,
    sourceChapterMarkers:sourceChapterCount,
    sourceStructureChapterCount:parsedChapters,
  };
  if (missingChapterNavigation) {
    return { status: "in_review", bookId, sha256, metadata: auditMeta,
      message: "Source chapter headings (" + sourceChapterCount +
        ") exceed imported chapter navigation (" + parsedChapters + "); structural audit required" };
  }
  if(job.metadata?.["autopilot"]===true || deathYear>1900 || originalYear>1900) {
    // Post-1900 originals, even when Gutenberg flags them US-unrestricted,
    // always require a separate territory-by-territory rights review.
    // Open Library's first_publish_year can be a placeholder (e.g. 1800).
    // A single catalog is NOT sufficient evidence to auto-approve a work.
    // Preserve the archived text and cover as private in_review until
    // an independent date and complete chapter sequence are verified.
    return {status:"in_review",bookId,sha256,metadata:auditMeta,
      message:"Independent first-print year and full chapter sequence require review"};
  }
  // Provenance is not equivalent to approval: title-page imprint and
  // Open Library guesses have produced historically false 1800/1656 dates.
  // At least two independent references must be attached before even a
  // manually queued historical edition can enter automatic publication.
  const sources=Array.isArray(job.metadata?.["independentPublicationSources"])
    ?job.metadata!["independentPublicationSources"] as unknown[]:[];
  const independentHosts=new Set(sources.flatMap((value)=>{
    if(typeof value!=="string")return [];
    try{
      const url=new URL(value);
      return url.protocol==="https:" && !/^(?:www\\.)?gutenberg\\.org$/iu.test(url.hostname)
        ?[url.hostname.replace(/^www\\./u,"").toLowerCase()]:[];
    }catch{return [];}
  }));
  if(independentHosts.size<2){
    return {status:"in_review",bookId,sha256,metadata:auditMeta,
      message:"Historical first-print year needs two independently documented source references"};
  }
  // Gutenberg's generated medium thumbnail is authentic to its source
  // listing but is not evidence of a high-resolution, edition-matched cover.
  const coverNeedsQualityReview=!!coverUrl && /\/cover-medium\\.jpg(?:\\?|$)/iu.test(coverUrl);
  if(!coverUrl||coverNeedsQualityReview||uploaded.warnings.length||
     uploaded.chapterCount<2||desc.length<60){
    return {status:"in_review",bookId,sha256,metadata:auditMeta,
      message:"Source-matched high-resolution cover, chapter structure or description requires review"};
  }
  const rightsSignals=await scanBookRightsSignals(bookId);
  if(rightsSignals.length)
    return {status:"in_review",bookId,sha256,metadata:auditMeta,
      message:"Manuscript contains rights/revision signals requiring review"};

  // This is an explicit, narrowly scoped automated pilot authorized by owner.
  // It never marks a human as reviewer. Existing Postgres trigger is final gate.
  const {error:reviewError}=await db.from("books").update({
    rights_status:"approved",edition_review_status:"approved",
    structure_review_status:"approved",cleanup_review_status:"approved",
    status:"approved",reviewed_at:new Date().toISOString(),
    review_notes:"AUTOMATED classical-work verification: author died "+deathYear+
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
  return {status:"published",bookId,sha256,metadata:auditMeta};
}
