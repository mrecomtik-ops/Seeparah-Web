/**
 * Fail-closed re-archiving of previously published original Gutenberg bytes.
 * Reuse the existing Gutenberg operated mirrors, never www scraping.
 * Only the pre-existing exact SHA256 is accepted; no source text or
 * permissions can be modified by this routine.
 */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getGutenbergAsset, extractGutenbergBody } from "@/lib/admin/gutenberg-fast-import.server";

const MAX_BYTES=12*1024*1024;
type LegacyBook={
  id:string;status:string;source_scan_id:string|null;
  source_file_sha256:string|null;source_file_path:string|null;
  import_key:string|null;created_at:string;
};
type Audit={book_id:string;expected_sha256:string;state:string;checked_at:string};

export function verifyLegacySourceBytes(
  gutenbergId:number, source:Uint8Array, expected:string,
):{sha256:string;key:string}|null{
  if(!Number.isSafeInteger(gutenbergId)||gutenbergId<1||gutenbergId>9999999||
     !/^[a-f0-9]{64}$/.test(expected)||
     source.length<180||source.length>MAX_BYTES)return null;
  const actual=createHash("sha256").update(source).digest("hex");
  if(actual!==expected)return null;
  extractGutenbergBody(new TextDecoder("utf-8",{fatal:true}).decode(source));
  return {sha256:actual,key:"gutenberg/"+gutenbergId+"/pg"+gutenbergId+
    "-"+actual.slice(0,12)+".txt"};
}

export async function reconcileOneLegacyGutenbergArchive():Promise<void>{
  const db=supabaseAdmin as any;
  const {data,error}=await db.from("books")
    .select("id,status,source_scan_id,source_file_sha256,source_file_path,import_key,created_at")
    .eq("status","published").is("source_file_path",null)
    .like("import_key","SP-CAND-%")
    .not("source_file_sha256","is",null)
    .order("created_at",{ascending:true}).limit(150);
  if(error){console.error("[gutenberg-archive] candidate read",error.message);return;}
  const candidates=(data??[]) as LegacyBook[];
  if(!candidates.length)return;
  const {data:audits,error:auditError}=await db.from("gutenberg_legacy_archive_checks")
    .select("book_id,expected_sha256,state,checked_at")
    .in("book_id",candidates.map(row=>row.id));
  if(auditError){console.error("[gutenberg-archive] audit read",auditError.message);return;}
  const previous=new Map<string,Audit>((audits??[]).map((row:Audit)=>[row.book_id,row]));
  const book=candidates.find(row=>{
    const prior=previous.get(row.id);
    if(!prior||prior.expected_sha256!==row.source_file_sha256)return true;
    return prior.state==="unavailable" && Date.now()-Date.parse(prior.checked_at)>24*3600000;
  });
  if(!book)return;
  const match=/^gutenberg:([1-9]\d{0,6})$/.exec(book.source_scan_id??"");
  const expected=book.source_file_sha256??"";
  if(!match || !/^[a-f0-9]{64}$/.test(expected))return;
  const id=Number(match[1]);
  let state:"archived"|"unavailable"|"checksum_mismatch"="unavailable";
  let detail="Gutenberg source not yet available from reviewed mirrors";
  let observed="";
  let savedPath="";
  let fetched=0;
  for(const name of ["pg"+id+".txt","pg"+id+"-0.txt",id+"-0.txt"]){
    try{
      const bytes=await getGutenbergAsset(id,name,MAX_BYTES);
      fetched++;
      const verified=verifyLegacySourceBytes(id,bytes,expected);
      if(!verified){
        state="checksum_mismatch";
        detail="Current Gutenberg raw source SHA-256 differs from stored legacy fingerprint";
        continue;
      }
      const store=supabaseAdmin.storage.from("gutenberg-sources");
      const upload=await store.upload(verified.key,bytes,{contentType:"text/plain",upsert:false});
      if(upload.error){
        // A previous attempt may have uploaded before its database update.
        // Check full contents instead of trusting a matching filename.
        const existing=await store.download(verified.key);
        if(existing.error||!existing.data)throw Error("Existing original cannot be verified");
        const existingBytes=new Uint8Array(await existing.data.arrayBuffer());
        if(!verifyLegacySourceBytes(id,existingBytes,expected))
          throw Error("Existing original has unexpected bytes");
      }
      savedPath="gutenberg-sources/"+verified.key;
      const updated=await db.from("books").update({source_file_path:savedPath})
        .eq("id",book.id).eq("status","published")
        .eq("source_file_sha256",expected)
        .is("source_file_path",null).select("id").maybeSingle();
      if(updated.error)throw Error("Source path CAS update rejected: "+updated.error.message);
      if(!updated.data){
        detail="Book changed during reconciliation; no source metadata overwritten";
        break;
      }
      observed=name;state="archived";
      detail="Original bytes match the book's previously recorded SHA-256";
      break;
    }catch(e){detail=e instanceof Error?e.message:String(e);}
  }
  if(!fetched && state!=="archived")state="unavailable";
  const result=await db.from("gutenberg_legacy_archive_checks").upsert({
    book_id:book.id,gutenberg_id:id,expected_sha256:expected,state,
    observed_source_name:observed||null,
    archived_path:state==="archived"?savedPath:null,
    details:detail.slice(0,450),checked_at:new Date().toISOString(),
  },{onConflict:"book_id"});
  if(result.error)console.error("[gutenberg-archive] audit save",result.error.message);
  console.log("[gutenberg-archive] result",JSON.stringify({gutenbergId:id,state}));
}
