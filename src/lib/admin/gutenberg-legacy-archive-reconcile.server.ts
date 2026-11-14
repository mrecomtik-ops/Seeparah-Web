/**
 * Preservation-first Gutenberg legacy archive reconciliation.
 *
 * The 2026-11-14 source audit found 132 current authoritative Gutenberg
 * eBooks but 131 did NOT match their published reader text. Preserve the
 * source bytes as independently labeled CANDIDATES, not a forged original
 * of the already-published edition.
 * Only canonical text identity with the live reader permits attaching a
 * newly downloaded exact-hash archive to the existing published book.
 *
 * No book text, approval flag, source version or user annotation is changed.
 */
import {createHash} from "node:crypto";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {getGutenbergAsset,extractGutenbergBody} from "@/lib/admin/gutenberg-fast-import.server";
const MAX_BYTES=12*1024*1024;
const digest=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
export const canonicalOriginal=(text:string)=>text.normalize("NFC").replace(/\s+/gu,"");
type Audit={
  book_id:string;gutenberg_id:number;prior_recorded_source_sha256:string|null;
  current_official_raw_sha256:string;current_official_body_sha256:string;
  stored_reader_body_sha256:string;current_official_chars:number;stored_reader_chars:number;
  exact_reader_source_match:boolean;archive_state:string;
};
type Book={
  id:string;status:string;source_version:number;source_language:string;
  source_file_path:string|null;source_file_sha256:string|null;
  source_scan_id:string;total_chunks:number;original_publication_year:number|null;
  description:string;rights_status:string;edition_review_status:string;
  structure_review_status:string;cleanup_review_status:string;
};
export function verifyLegacySourceBytes(gutenbergId:number,source:Uint8Array,expected:string){
  if(!Number.isSafeInteger(gutenbergId)||gutenbergId<1||gutenbergId>9999999||
     !/^[a-f0-9]{64}$/.test(expected)||source.length<180||source.length>MAX_BYTES)return null;
  const actual=digest(source);
  if(actual!==expected)return null;
  extractGutenbergBody(new TextDecoder("utf-8",{fatal:true}).decode(source));
  return {sha256:actual,key:"gutenberg/"+gutenbergId+"/pg"+gutenbergId+
    "-"+actual.slice(0,12)+".txt"};
}
export function verifyCurrentSourceAgainstAudit(bytes:Uint8Array,audit:Audit){
  if(!Number.isSafeInteger(audit.gutenberg_id)||
     !/^[a-f0-9]{64}$/.test(audit.current_official_raw_sha256)||
     bytes.length<180||bytes.length>MAX_BYTES||
     digest(bytes)!==audit.current_official_raw_sha256)return null;
  const raw=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  const body=extractGutenbergBody(raw);
  const chars=canonicalOriginal(body);
  if(chars.length!==audit.current_official_chars||
     digest(chars)!==audit.current_official_body_sha256)return null;
  return {rawSha:digest(bytes),bodySha:digest(chars),canonicalBody:chars};
}
async function validateLiveReader(db:any,book:Book,canonicalBody:string):Promise<boolean>{
  const chunks:string[]=[];let next=0;
  for(;;){
    const q=await db.from("book_chunks").select("chunk_index,content,status")
      .eq("book_id",book.id).eq("language",book.source_language)
      .eq("source_version",book.source_version)
      .order("chunk_index").range(next,next+499);
    if(q.error)throw Error("Reader proof query failed: "+q.error.message);
    const rows=(q.data??[]) as {chunk_index:number;content:string;status:string}[];
    for(const row of rows){
      if(row.status!=="published"||row.chunk_index!==next+chunks.length ||
         !row.content?.trim())return false;
      chunks.push(row.content);
    }
    next+=rows.length;
    if(rows.length<500)break;
    if(chunks.length>20000)throw Error("Reader proof exceeds safe bounds");
  }
  return chunks.length===book.total_chunks &&
    canonicalOriginal(chunks.join("\n\n"))===canonicalBody;
}
async function storeExactOriginal(key:string,bytes:Uint8Array,sha:string){
  const bucket=supabaseAdmin.storage.from("gutenberg-sources");
  const attempt=await bucket.upload(key,bytes,{contentType:"text/plain",upsert:false});
  if(attempt.error){
    const file=await bucket.download(key);
    if(file.error||!file.data)throw Error("Cannot verify already stored candidate");
    const old=new Uint8Array(await file.data.arrayBuffer());
    if(digest(old)!==sha)throw Error("Immutable archive collision");
  }
}
async function reconcile(row:Audit):Promise<void>{
  const db=supabaseAdmin as any;
  const id=row.gutenberg_id;
  if(!Number.isSafeInteger(id)||id<=0||id>9999999)return;
  const {data:book,error}=await db.from("books")
    .select("id,status,source_scan_id,source_file_path,source_file_sha256,source_version,source_language,total_chunks,original_publication_year,description,rights_status,edition_review_status,structure_review_status,cleanup_review_status")
    .eq("id",row.book_id).maybeSingle();
  if(error||!book||book.status!=="published"||book.source_file_path!==null ||
     book.source_scan_id!=="gutenberg:"+id){
    await db.from("gutenberg_legacy_source_comparison")
      .update({archive_state:"error",archive_error:"Source work changed or is no longer an eligible published missing-archive book",archive_attempted_at:new Date().toISOString()})
      .eq("book_id",row.book_id).eq("archive_state","pending");
    return;
  }
  let archiveState:"archived_verified"|"staged_mismatch"|"unavailable"|"error"="unavailable";
  let errorDetail="";
  let storedPath:string|null=null;
  try{
    const source=await getGutenbergAsset(id,"pg"+id+".txt",MAX_BYTES);
    const proof=verifyCurrentSourceAgainstAudit(source,row);
    if(!proof)throw Error("Authorized mirror text no longer matches independently audited current Gutenberg raw SHA and body");
    const sameSource=row.exact_reader_source_match &&
      row.stored_reader_body_sha256===row.current_official_body_sha256 &&
      await validateLiveReader(db,book as Book,proof.canonicalBody);
    const key=sameSource
      ?"gutenberg/"+id+"/pg"+id+"-"+proof.rawSha.slice(0,12)+".txt"
      :"gutenberg/reconciliation-candidates/"+id+"/pg"+id+"-"+proof.rawSha.slice(0,12)+".txt";
    await storeExactOriginal(key,source,proof.rawSha);
    storedPath="gutenberg-sources/"+key;
    if(sameSource){
      // The automated publish guard still applies. Do not attempt to replace
      // an unverified first-publication date just to satisfy this update.
      const b=book as Book;
      const allApproved=["rights_status","edition_review_status","structure_review_status","cleanup_review_status"]
        .every(k=>(b as unknown as Record<string,unknown>)[k]==="approved");
      if(!allApproved || (b.original_publication_year===null &&
         !b.description.includes("Original print-publication year has not been independently corroborated."))){
        archiveState="staged_mismatch";
        errorDetail="Book metadata requires separate review before source-path upgrade";
      }else{
        let upd=db.from("books").update({
          source_file_sha256:proof.rawSha,source_file_path:storedPath,
        }).eq("id",b.id).eq("status","published")
        .eq("source_version",b.source_version).eq("source_scan_id","gutenberg:"+id)
        .is("source_file_path",null);
        upd=b.source_file_sha256===null?upd.is("source_file_sha256",null):upd.eq("source_file_sha256",b.source_file_sha256);
        const result=await upd.select("id,status").maybeSingle();
        if(result.error)throw Error("Source provenance CAS failed: "+result.error.message);
        if(result.data?.status==="published")archiveState="archived_verified";
        else{
          archiveState="error";errorDetail="Source book changed during verification";
        }
      }
    }else{
      archiveState="staged_mismatch";
      errorDetail="Current Gutenberg source is archived separately; published reader differs and has not been altered";
    }
  }catch(e){
    archiveState="error";errorDetail=e instanceof Error?e.message:String(e);
  }
  const recorded=await db.from("gutenberg_legacy_source_comparison")
    .update({candidate_storage_path:storedPath,archive_state:archiveState,
      archive_error:errorDetail.slice(0,500)||null,archive_attempted_at:new Date().toISOString()})
    .eq("book_id",row.book_id).eq("archive_state","pending");
  if(recorded.error)console.error("[gutenberg-archive] audit update",recorded.error.message);
  console.log("[gutenberg-archive] source",id,archiveState);
}
export async function reconcileOneLegacyGutenbergArchive():Promise<void>{
  const db=supabaseAdmin as any;
  const q=await db.from("gutenberg_legacy_source_comparison")
    .select("book_id,gutenberg_id,prior_recorded_source_sha256,current_official_raw_sha256,current_official_body_sha256,stored_reader_body_sha256,current_official_chars,stored_reader_chars,exact_reader_source_match,archive_state")
    .eq("archive_state","pending")
    .order("exact_reader_source_match",{ascending:false})
    .order("gutenberg_id",{ascending:true}).limit(2);
  if(q.error){console.error("[gutenberg-archive] queue",q.error.message);return;}
  const work=(q.data??[]) as Audit[];
  await Promise.all(work.map(x=>reconcile(x)));
}
