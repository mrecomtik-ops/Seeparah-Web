import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { verifyInterruptedPublicationSource as verify, canAutoReviewStagedGutenbergSource,
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

describe("As-is source recovery reviews only untouched, independently evidenced originals", () => {
 const candidateBook={...book,status:"in_review",reviewed_by:null,reviewed_at:null,
  review_notes:"Imported by automated Gutenberg fast-track; subject to source audit.",
  rights_status:"pending",edition_review_status:"pending",structure_review_status:"changes_requested",
  cleanup_review_status:"pending",rights_evidence_url:"https://www.gutenberg.org/ebooks/1234",
  rights_basis:"Original work from verified public domain Gutenberg edition",
  description:"Original print-publication year has not been independently corroborated. This is the source-text edition. Missing contents may occur."};
 const candidateJob={...job,metadata:{...job.metadata,pipelineVersion:"gutenberg-v6-all-source-languages",
  sourceLanguage:"English",catalogOrigin:"official Gutenberg weekly CSV + exact-ID RDF",
  verifiedSourceLanguages:["en"],deathYear:1850,year:null,
  officialRdfEvidence:{gutenbergId:1234,usCopyright:false,rights:"Public domain in the USA."},
  historicalRightsSignals:{unresolved:false,historicalCount:0},
  publicationReadiness:{allowed:true,reasons:[],qualityWarnings:["No verified cover"]}}};
 const valid={job:candidateJob,book:candidateBook,sourceHeader:"Project Gutenberg original 1880",
  hasCurrentRightsSignals:false};
 it("accepts documented source-only review while retaining exact source verification",()=>{
  expect(canAutoReviewStagedGutenbergSource(valid)).toBe(true);
  expect(verify({...valid,raw,body,chunks,stagedForAutoReview:true})).toEqual([]);
  expect(verify({job:candidateJob,book:candidateBook,raw,body,chunks})).not.toEqual([]);
 });
 it("holds human-reviewed, rights-risk, different identity, or untranslated contributor cases",()=>{
  expect(canAutoReviewStagedGutenbergSource({...valid,book:{...candidateBook,reviewed_at:"2026-01-01"}})).toBe(false);
  expect(canAutoReviewStagedGutenbergSource({...valid,hasCurrentRightsSignals:true})).toBe(false);
  expect(canAutoReviewStagedGutenbergSource({...valid,job:{...candidateJob,metadata:{...candidateJob.metadata,deathYear:1950}}})).toBe(false);
  expect(canAutoReviewStagedGutenbergSource({...valid,job:{...candidateJob,metadata:{...candidateJob.metadata,verifiedSourceLanguages:["en","fr"]}}})).toBe(false);
  expect(canAutoReviewStagedGutenbergSource({...valid,sourceHeader:"All rights reserved 2020"})).toBe(false);
  expect(canAutoReviewStagedGutenbergSource({...valid,book:{...candidateBook,source_scan_id:"gutenberg:2345"}})).toBe(true);
  // Identity inconsistency is rejected by the separate source verifier,
  // even when documentary review eligibility itself is true.
  expect(verify({job:candidateJob,book:{...candidateBook,source_scan_id:"gutenberg:2345"},raw,body,chunks,stagedForAutoReview:true})).not.toEqual([]);
 });
});
