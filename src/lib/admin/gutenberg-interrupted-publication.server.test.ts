import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { verifyInterruptedPublicationSource as verify,
  RECOVERY_CHECKPOINT_KIND } from "./gutenberg-interrupted-publication.server";

const hash=(x:string|Uint8Array)=>createHash("sha256").update(x).digest("hex");
const canonical=(x:string)=>hash(x.normalize("NFC").replace(/\s+/gu,""));
const body="First original chapter.\n\nSecond full original paragraph.";
const raw=new TextEncoder().encode("*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\n\n"+
  body+"\n\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***");
const rawSha=hash(raw), canonicalSha=canonical(body);
const book={
  id:"book-1",status:"approved",content_classification:"general",access_type:"free",
  source_scan_id:"gutenberg:1234",source_language:"English",source_version:1,
  source_url:"https://www.gutenberg.org/ebooks/1234",
  source_file_path:"gutenberg-sources/gutenberg/1234/pg1234-"+rawSha.slice(0,12)+".txt",
  source_file_sha256:rawSha,total_chunks:2,
  rights_status:"approved",edition_review_status:"approved",
  structure_review_status:"approved",cleanup_review_status:"approved",
};
const job={
  id:1,book_id:book.id,gutenberg_id:1234,source_sha256:rawSha,updated_at:new Date().toISOString(),
  metadata:{
    prePublicationCheckpoint:{kind:RECOVERY_CHECKPOINT_KIND,bookId:book.id,
      sourceVersion:1,sourceLanguage:"English",chunkCount:2,
      sha256:rawSha,canonicalSha256:canonicalSha},
    sourceIntegrity:{ok:true,canonicalSha256:canonicalSha,sourceBodySha256:hash(body)},
    storedChunkIntegrity:{ok:true,canonicalSha256:canonicalSha},
    publicationReadiness:{allowed:true},
  },
};
const chunks=[
  {chunk_index:0,content:"First original chapter."},
  {chunk_index:1,content:"Second full original paragraph."},
];
describe("Interrupted Gutenberg publication recovery is source-exact and rights-gated",()=>{
 it("accepts unchanged real archived bytes and current stored text",()=>{
   expect(verify({job,book,raw,body,chunks})).toEqual([]);
 });
 it("refuses any missing chunk or changed original content",()=>{
   expect(verify({job,book,raw,body,chunks:chunks.slice(1)})).not.toEqual([]);
   expect(verify({job,book,raw,body,chunks:[chunks[0]!,{chunk_index:1,content:"Changed"}]})).not.toEqual([]);
   expect(verify({job,book,raw:new TextEncoder().encode("fake"),body,chunks})).not.toEqual([]);
 });
 it("never bypasses rights, edition identity or publication proof",()=>{
   expect(verify({job,book:{...book,rights_status:"pending"},raw,body,chunks})).not.toEqual([]);
   expect(verify({job,book:{...book,source_scan_id:"gutenberg:2345"},raw,body,chunks})).not.toEqual([]);
   expect(verify({job:{...job,metadata:{...job.metadata,publicationReadiness:{allowed:false}}},book,raw,body,chunks})).not.toEqual([]);
 });
 it("rejects an edition after a source-version change",()=>{
   expect(verify({job,book:{...book,source_version:2},raw,body,chunks})).not.toEqual([]);
 });
});
