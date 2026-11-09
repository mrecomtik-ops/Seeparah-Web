/**
 * Private Gutenberg fast track, one vetted source per Cloudflare cron tick.
 * Keep source bytes and covers; reuse existing idempotent Seeparah importer,
 * source checks and publish gate. No mass scraping of Gutenberg's main site.
 */
import { createHash } from "node:crypto";

const MIRROR = "https://gutenberg.pglaf.org";
const MAX_TEXT = 4 * 1024 * 1024;
type Catalog = {
  id: number; title: string; media_type: string; copyright: boolean | null;
  languages: string[]; authors: Array<{name: string;death_year: number|null}>;
  translators?: Array<{name:string}>;editors?: Array<{name:string}>;
  formats: Record<string,string>;summaries?:string[];subjects?:string[];
};
type Job = {id:number;gutenberg_id:number;original_publication_year:number;attempts:number};
type Result = {
  status:"published"|"in_review"|"skipped";bookId:string|null;
  sha256?:string;metadata?:Record<string,unknown>;message?:string;
};
export function verifyGutenbergCandidate(b: Catalog, id:number, year:number) {
  if (b.id!==id || b.copyright!==false || b.media_type!=="Text" ||
      !b.title?.trim() || b.languages?.length!==1 || b.languages[0]!=="en")
    throw new Error("Catalog is not an unrestricted English original work");
  if (b.authors?.length!==1 || !b.authors[0]?.name ||
      typeof b.authors[0].death_year!=="number" ||
      b.authors[0].death_year>1925 ||
      b.authors[0].death_year<1400 ||
      year>1900 || year<1400)
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
    signal:AbortSignal.timeout(25000)
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
function duplicate(value: unknown){
  if (!value || typeof value !== "object") return false;
  const e = value as { message?: string | undefined; statusCode?: string | number | undefined };
  return /already exists|Duplicate|409/i.test(e.message ?? "") || String(e.statusCode) === "409";
}
function description(b:Catalog,author:string,year:number){
  const summary=(b.summaries??[]).find(s=>s.length>=60&&s.length<5000);
  if(summary)return summary.trim().slice(0,2400);
  return b.title+" by "+author+", first published in "+year+
    ". This sourced English-language reading edition presents the full original work. "+
    "Source subject classifications: "+(b.subjects??[]).slice(0,3).join(", ")+".";
}
export async function processGutenbergImportQueueOnce():Promise<void>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const {data:queued,error:readError}=await db.from("gutenberg_import_jobs")
    .select("id,gutenberg_id,original_publication_year,attempts")
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
      source_sha256:result.sha256??null,metadata:result.metadata??null,
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
export async function importGutenbergSource(job:Job):Promise<Result>{
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

  const response=await fetch("https://gutendex.com/books/"+id+"/",{
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw new Error("Gutendex HTTP "+response.status);
  const catalog=await response.json() as Catalog;
  const {author,deathYear}=verifyGutenbergCandidate(catalog,id,job.original_publication_year);

  const original=await getBytes(MIRROR+"/cache/epub/"+id+"/pg"+id+".txt",MAX_TEXT);
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
    const jpeg=await getBytes(MIRROR+"/cache/epub/"+id+"/pg"+id+".cover.medium.jpg",1024*1024);
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
  const desc=description(catalog,author,job.original_publication_year);
  const {adminCreateBook,scanBookRightsSignals,evaluatePublishGate}=
    await import("@/lib/admin/catalog.server");
  const uploaded=await adminCreateBook({
    title:catalog.title,author,sourceLanguage:"English",
    description:desc,genre:"Literature",categories:["Fiction"],
    coverUrl,sourceUrl:url,sourceEditionId:"gutenberg:"+id,
    rightsBasis:"Original work by "+author+" (died "+deathYear+
      "), first published "+job.original_publication_year+
      ". Gutenberg records no US copyright restriction. Automated checks: single original English-language author, no named editor or translator; original source archived.",
    rightsEvidenceUrl:url,
    attribution:"Original text and cover sourced from Project Gutenberg eBook "+id+
      " for free reading. See the original at "+url+". Seeparah is independent of Project Gutenberg.",
    permittedTerritories:[],translationPermission:false,
    importKey:"gutenberg-fast:"+id+":en",manuscriptText:manuscript
  },"system-fast-import");
  if(!uploaded.created)
    return {status:"skipped",bookId:uploaded.bookId,sha256,message:uploaded.reason ?? "Identical source already imported"};

  const bookId=uploaded.bookId;
  const {error:metadataError}=await db.from("books").update({
    edition_title:catalog.title+" — Seeparah Reading Edition",
    edition_year:2026,publisher:"Seeparah",
    original_publication_year:job.original_publication_year,
    source_scan_id:"gutenberg:"+id,
    source_file_sha256:sha256,source_file_path:"gutenberg-sources/"+sourceKey,
    source_revision:"Original Gutenberg mirror SHA-256 "+sha256,
    authenticity_notes:"Gutendex copyright=false. Author death year "+deathYear+
      "; no translators or editors listed. Full original text retained as "+sourceKey,
    review_notes:"Imported by automated Gutenberg fast-track; subject to source audit."
  }).eq("id",bookId);
  if(metadataError)throw new Error(metadataError.message);
  const auditMeta:Record<string,unknown>={
    title:catalog.title,author,deathYear,year:job.original_publication_year,
    sourceUrl:url,coverUrl,sha256,review:"automated"
  };
  if(!coverUrl||uploaded.warnings.length||uploaded.chapterCount<2||desc.length<60)
    return {status:"in_review",bookId,sha256,metadata:auditMeta,
      message:"Cover, source structure or descriptive metadata needs review"};
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
      "; original publication "+job.original_publication_year+
      "; Gutenberg catalog unrestricted; no modern contributors; UTF-8 source "+
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
