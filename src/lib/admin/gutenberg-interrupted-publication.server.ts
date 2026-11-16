/**
 * Recover one interrupted Gutenberg publication from independently persisted
 * source and stored-reader evidence. Never invent rights, chapters or text.
 * This runs separately from the slow network importer (bounded 1/tick).
 */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const RECOVERY_CHECKPOINT_KIND = "verified-source-roundtrip-v1";

const digest = (input: string | Uint8Array): string =>
  createHash("sha256").update(input).digest("hex");
const canonicalDigest = (text: string): string =>
  digest(text.normalize("NFC").replace(/\s+/gu, ""));

type BookForRecovery = {
  id: string; status: string; content_classification: string;
  access_type: string; source_scan_id: string;
  source_language: string; source_version: number;
  source_url: string; source_file_path: string;
  source_file_sha256: string; total_chunks: number;
  rights_status: string; edition_review_status: string;
  structure_review_status: string; cleanup_review_status: string;
};
type JobForRecovery = {
  id: number; book_id: string; gutenberg_id: number;
  source_sha256: string; metadata: Record<string,any>;
  updated_at: string;
};
type ChunkForRecovery = { chunk_index: number; content: string };

export function verifyInterruptedPublicationSource(input: {
  job: JobForRecovery; book: BookForRecovery; raw: Uint8Array;
  body: string; chunks: ChunkForRecovery[];
}): string[] {
  const { job, book, raw, body, chunks } = input;
  const errors: string[] = [];
  const cp = job.metadata?.['prePublicationCheckpoint'];
  const source = job.metadata?.['sourceIntegrity'];
  const readBack = job.metadata?.['storedChunkIntegrity'];
  const rights = job.metadata?.['publicationReadiness'];
  const id = job.gutenberg_id;
  if (cp?.kind !== RECOVERY_CHECKPOINT_KIND ||
      cp.bookId !== book.id || cp.sourceVersion !== book.source_version ||
      cp.sourceLanguage !== book.source_language ||
      cp.chunkCount !== book.total_chunks || cp.sha256 !== book.source_file_sha256 ||
      cp.canonicalSha256 !== source?.canonicalSha256)
    errors.push("Missing or mismatched immutable checkpoint");
  if (job.book_id !== book.id || book.source_scan_id !== "gutenberg:" + id ||
      book.source_url !== "https://www.gutenberg.org/ebooks/" + id ||
      book.content_classification !== "general" || book.access_type !== "free" ||
      !Number.isSafeInteger(id) || id < 1)
    errors.push("Not the identified free Gutenberg edition");
  const archive = book.source_file_path || "";
  if (!archive.startsWith("gutenberg-sources/gutenberg/" + id + "/pg" + id + "-") ||
      !archive.endsWith(".txt") ||
      !archive.includes(book.source_file_sha256.slice(0,12)))
    errors.push("Source archive key differs from verified Gutenberg checksum");
  if (!/^[0-9a-f]{64}$/u.test(book.source_file_sha256) ||
      job.source_sha256 !== book.source_file_sha256 ||
      digest(raw) !== book.source_file_sha256)
    errors.push("Archived source bytes do not match original SHA-256");
  if (!source?.ok || !readBack?.ok || rights?.allowed !== true)
    errors.push("Original full text/readback/rights publication proof incomplete");
  if (![book.rights_status,book.edition_review_status,
        book.structure_review_status,book.cleanup_review_status]
      .every(status=>status==="approved") ||
      !["approved","published"].includes(book.status))
    errors.push("Rights or quality review is not approved");
  if (!Array.isArray(chunks) || chunks.length !== book.total_chunks ||
      chunks.some((c,i)=>c.chunk_index!==i || !c.content.trim()))
    errors.push("Stored source has missing, unordered or blank chunks");
  const sourceDigest = canonicalDigest(body);
  const readerDigest = canonicalDigest(chunks.map(c=>c.content).join("\n\n"));
  if (sourceDigest !== source?.canonicalSha256 ||
      sourceDigest !== readBack?.canonicalSha256 ||
      sourceDigest !== cp?.canonicalSha256 || readerDigest !== sourceDigest ||
      digest(body) !== source?.sourceBodySha256)
    errors.push("Current reader content does not match archived original character-for-character");
  return errors;
}

export async function recoverOneInterruptedGutenbergPublication(): Promise<void> {
  const db = supabaseAdmin as any;
  const cutoff = new Date(Date.now() - 3*60_000).toISOString();
  const {data:job,error:lookupError}=await db.from("gutenberg_import_jobs")
    .select("id,gutenberg_id,book_id,source_sha256,metadata,updated_at")
    .eq("status","processing")
    .contains("metadata",{prePublicationCheckpoint:{kind:RECOVERY_CHECKPOINT_KIND}})
    .lt("updated_at",cutoff).order("updated_at").limit(1).maybeSingle();
  if(lookupError)throw new Error("Stalled Gutenberg checkpoint lookup: "+lookupError.message);
  if(!job)return;
  const now=new Date().toISOString();
  const {data:claimed,error:claimError}=await db.from("gutenberg_import_jobs")
    .update({updated_at:now,
      metadata:{...job.metadata,checkpointRecoveryLease:now}})
    .eq("id",job.id).eq("status","processing").eq("updated_at",job.updated_at)
    .select("id").maybeSingle();
  if(claimError)throw new Error("Recovery lease failed: "+claimError.message);
  if(!claimed)return;

  const metadata={...job.metadata,checkpointRecoveryLease:now};
  const hold=async(reason:string)=>{
    await db.from("gutenberg_import_jobs").update({
      status:"in_review",book_id:job.book_id,
      metadata:{...metadata,checkpointRecoveryHold:reason.slice(0,650)},
      last_error:"Recovery held: "+reason.slice(0,500),
      updated_at:new Date().toISOString(),
    }).eq("id",job.id).eq("status","processing");
    console.warn("[gutenberg-recovery] source held",job.gutenberg_id,reason);
  };

  const {data:book,error:bookError}=await db.from("books").select("*")
    .eq("id",job.book_id).maybeSingle();
  if(bookError||!book){await hold("Verified partial edition is unavailable");return;}
  if(!["approved","published"].includes(book.status)){
    await hold("Edition must complete its existing rights and quality reviews");return;
  }
  const sourcePath=String(book.source_file_path??"");
  if(!sourcePath.startsWith("gutenberg-sources/gutenberg/"+job.gutenberg_id+"/")){
    await hold("Original source archive identity differs");return;
  }
  const {data:archive,error:archiveError}=await supabaseAdmin.storage
    .from("gutenberg-sources").download(sourcePath.slice("gutenberg-sources/".length));
  if(archiveError||!archive){
    // Transient storage errors remain retryable; do not mislabel rights status.
    console.error("[gutenberg-recovery] archive fetch transient failure",job.gutenberg_id,
      archiveError?.message??"empty object");
    return;
  }
  if(archive.size>12*1024*1024){await hold("Source exceeds guarded original size");return;}
  const raw=new Uint8Array(await archive.arrayBuffer());
  const { extractGutenbergBody } = await import("@/lib/admin/gutenberg-fast-import.server");
  let body:string;
  try { body=extractGutenbergBody(new TextDecoder("utf-8",{fatal:true}).decode(raw)); }
  catch(error){await hold("Archived source boundaries/encoding are invalid");return;}

  const chunks:ChunkForRecovery[]=[];
  for(let offset=0;offset<8000;offset+=250){
    const {data:page,error}=await db.from("book_chunks")
      .select("chunk_index,content").eq("book_id",book.id)
      .eq("language",book.source_language).eq("source_version",book.source_version)
      .order("chunk_index",{ascending:true}).range(offset,offset+249);
    if(error)throw new Error("Stored reading chunk readback failed: "+error.message);
    chunks.push(...(page??[]));
    if((page??[]).length<250)break;
  }
  const reasons=verifyInterruptedPublicationSource({job:{...job,metadata},book,raw,body,chunks});
  if(reasons.length){await hold(reasons.join("; "));return;}
  const {evaluatePublishGate}=await import("@/lib/admin/catalog.server");
  const gate=await evaluatePublishGate(book.id);
  if(!gate.canPublish){await hold(gate.reasons.join("; "));return;}
  if(book.status==="approved"){
    const {data:published,error}=await db.from("books").update({status:"published"})
      .eq("id",book.id).eq("status","approved").select("id").maybeSingle();
    if(error){await hold("Database publication gate: "+error.message);return;}
    if(!published)return; // Another admin or worker changed the state.
  }
  const {error:finalError}=await db.from("gutenberg_import_jobs").update({
    status:"published",book_id:book.id,source_sha256:book.source_file_sha256,
    metadata:{...metadata,publishedWithEvidence:true,
      publicationMode:"source-as-is",
      interruptedPublicationRecovery:{
        kind:RECOVERY_CHECKPOINT_KIND,
        sourceCanonicalSha256:job.metadata?.['sourceIntegrity']?.canonicalSha256,
        resumedAt:new Date().toISOString(),realTimeGateChecked:true,
        currentArchiveAndReaderReverified:true,
      }},
    last_error:null,updated_at:new Date().toISOString(),
  }).eq("id",job.id).eq("status","processing");
  if(finalError)throw new Error("Published book final job checkpoint failed: "+finalError.message);
  console.log("[gutenberg-recovery] completed verified source",job.gutenberg_id);
}
