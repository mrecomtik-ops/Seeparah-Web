/**
 * Byte-verified, low-volume archiving of official Gutenberg generated covers.
 * Exact eBook ID + SHA256 + JPEG dimensions were independently verified in
 * the source audit. The main Gutenberg site is NEVER crawled by this worker:
 * all bytes are fetched from the authorized Gutenberg mirrors.
 * A source-image mismatch fails closed and leaves the original URL intact.
 */
import {createHash} from "node:crypto";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {getGutenbergAsset} from "@/lib/admin/gutenberg-fast-import.server";
import {jpegDimensions} from "@/lib/admin/gutenberg-publication-qa.server";

type CoverRecord={
  book_id:string;gutenberg_id:number;official_cover_url:string;
  source_sha256:string;source_width:number;source_height:number;
  source_bytes:number;archived_storage_path:string|null;
};
const MAX_BYTES=2*1024*1024;
const BATCH=8;
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");

export function checkGutenbergCoverSource(
  bytes:Uint8Array,record:Pick<CoverRecord,
  "source_sha256"|"source_width"|"source_height"|"source_bytes">,
):boolean{
  if(!/^[0-9a-f]{64}$/.test(record.source_sha256)||
     bytes.length!==record.source_bytes||
     bytes.length<2500||bytes.length>MAX_BYTES||
     bytes[0]!==0xff||bytes[1]!==0xd8||
     bytes[bytes.length-2]!==0xff||bytes[bytes.length-1]!==0xd9)return false;
  const dims=jpegDimensions(bytes);
  return Boolean(dims && dims.width===record.source_width &&
    dims.height===record.source_height && dims.width>=180 &&
    dims.height>=200 && dims.height>=dims.width &&
    hash(bytes)===record.source_sha256);
}
async function cacheOne(row:CoverRecord):Promise<boolean>{
  const id=row.gutenberg_id;
  if(!Number.isSafeInteger(id)||id<1||id>9999999||
    row.official_cover_url!==
    "https://www.gutenberg.org/cache/epub/"+id+"/pg"+id+".cover.medium.jpg")return false;
  const img=await getGutenbergAsset(id,"pg"+id+".cover.medium.jpg",MAX_BYTES);
  if(!checkGutenbergCoverSource(img,row)){
    console.warn("[gutenberg-covers] source-image SHA or dimensions changed",id);
    return false;
  }
  const key="gutenberg/"+id+"/"+row.source_sha256.slice(0,16)+"/cover-medium.jpg";
  const bucket=supabaseAdmin.storage.from("book-covers");
  const upload=await bucket.upload(key,img,{contentType:"image/jpeg",upsert:false,cacheControl:"31536000"});
  if(upload.error){
    // A retry may encounter already uploaded immutable content.
    // Never silently accept an incorrect same-path object.
    const existing=await bucket.download(key);
    if(existing.error||!existing.data)throw Error("Uploaded cover cannot be verified for "+id);
    const old=new Uint8Array(await existing.data.arrayBuffer());
    if(!checkGutenbergCoverSource(old,row))throw Error("Cover storage collision for "+id);
  }
  const publicUrl=bucket.getPublicUrl(key).data.publicUrl;
  const db=supabaseAdmin as any;
  // Do not overwrite a deliberate cover change made by an editor.
  const upd=await db.from("books").update({cover_url:publicUrl})
    .eq("id",row.book_id).eq("status","published")
    .eq("source_scan_id","gutenberg:"+id)
    .eq("cover_url",row.official_cover_url).select("id").maybeSingle();
  if(upd.error)throw Error("Cover CAS update: "+upd.error.message);
  if(!upd.data){
    const current=await db.from("books").select("cover_url,status")
      .eq("id",row.book_id).maybeSingle();
    if(current.error||current.data?.status!=="published"||
       current.data?.cover_url!==publicUrl)return false;
  }
  const result=await db.from("gutenberg_cover_source_evidence")
    .update({archived_storage_path:key,archived_at:new Date().toISOString()})
    .eq("book_id",row.book_id).eq("source_sha256",row.source_sha256)
    .is("archived_storage_path",null);
  if(result.error)throw Error("Cover provenance write: "+result.error.message);
  return true;
}
export async function archiveVerifiedGutenbergCoversOnce():Promise<void>{
  const db=supabaseAdmin as any;
  const q=await db.from("gutenberg_cover_source_evidence")
    .select("book_id,gutenberg_id,official_cover_url,source_sha256,source_width,source_height,source_bytes,archived_storage_path")
    .is("archived_storage_path",null).order("gutenberg_id").limit(BATCH);
  if(q.error){console.error("[gutenberg-covers] verifier query",q.error.message);return;}
  const rows=(q.data??[]) as CoverRecord[];
  if(!rows.length)return;
  let next=0,archived=0;
  async function worker(){
    while(next<rows.length){
      const row=rows[next++];
      if(!row)continue;
      try{if(await cacheOne(row))archived++;}
      catch(e){console.error("[gutenberg-covers] record",row.gutenberg_id,
        e instanceof Error?e.message:String(e));}
    }
  }
  await Promise.all([worker(),worker(),worker(),worker()]);
  console.log("[gutenberg-covers] restored",archived,"of",rows.length);
}
