import {createHash} from "node:crypto";
const ids=[11,12,15,16,20,35,36,43,45,46,73,76,82,84,95,105,120,121,131,145,159,161,209,215,217,219,244,271,289,308,320,421,514,555,561,564,575,580,599,652,730,766,768,792,796,804,811,829,968,997,998,999,1012,1026,1216,1260,1329,1400,1457,1513,1661,1880,1906,1934,1947,1951,2005,2021,2042,2166,2276,2432,2434,2636,2687,2702,2783,2799,3030,3290,3294,3300,3467,3747,4084,4238,4791,6143,7486,7949,9077,11503,12102,14157,14851,16736,17223,17237,17983,19476,21502,23364,23365,23366,23367,23368,23369,25344,30842,31130,31131,31202,34811,37943,44796,49740,50087,50088,50091,52457,53021,53874,54729,65182,65939,71320,72113,73037,74230,74264,76484,77465];
const canonical=text=>text.normalize("NFC").replace(/\s+/gu,"");
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
function extract(raw){
  const start=/^\s*\*{3}\s*START OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\r\n]*\*{3}[^\S\r\n]*$/im;
  const end=/^\s*\*{3}\s*END OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\r\n]*\*{3}[^\S\r\n]*$/im;
  const a=start.exec(raw);if(!a)throw Error("start boundary unavailable");
  const tail=raw.slice(a.index+a[0].length);
  const b=end.exec(tail);if(!b)throw Error("end boundary unavailable");
  return tail.slice(0,b.index).replace(/^\s*\r?\n/,"").replace(/\s+$/,"");
}
const results=[];let cursor=0;
async function worker(){
 while(cursor<ids.length){
 const id=ids[cursor++],uri="https://www.gutenberg.org/cache/epub/"+id+"/pg"+id+".txt";
 let out={id,status:"unavailable"};
 try{
 const rsp=await fetch(uri,{headers:{"User-Agent":"Seeparah-source-integrity/1.0 (https://seeparah.com)","Accept":"text/plain"},signal:AbortSignal.timeout(16000)});
 if(!rsp.ok)throw Error("HTTP "+rsp.status);
 const bytes=new Uint8Array(await rsp.arrayBuffer());
 if(bytes.length>12582912)throw Error("oversize");
 const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 const body=extract(text);
 const normal=canonical(body);
 if(normal.length<180)throw Error("source too short");
 out={id,status:"ok",rawSha:digest(bytes),canonicalSha:digest(normal),characters:normal.length,bytes:bytes.length};
 }catch(e){out={id,status:"error",reason:String(e).slice(0,100)}}
 results.push(out);
 if(out.status==="ok")console.log("ARCHIVE_SOURCE",id,out.rawSha,out.canonicalSha,out.characters,out.bytes);
 else console.log("ARCHIVE_UNAVAILABLE",id,out.reason);
 }
}
await Promise.all(Array.from({length:6},worker));
console.log("ARCHIVE_SUMMARY",JSON.stringify({total:ids.length,ok:results.filter(x=>x.status==="ok").length,failed:results.filter(x=>x.status!=="ok").length}));
