import {createHash} from "node:crypto";
const cases=[
 {id:2434,expected:"bafd5a4331d76a5adcc64cf08fcb9688b0b036f47277e62423baf255ffa8bc80"},
 {id:23366,expected:"b867178271f8eb510ff3783c765703b931fb97bdbaa0704b2d510184ff461de9"},
 {id:8883,expected:null},
];
const urls=id=>[
 "https://www.gutenberg.org/cache/epub/"+id+"/pg"+id+".txt",
 "https://www.gutenberg.org/cache/epub/"+id+"/pg"+id+"-0.txt",
 "https://gutenberg.pglaf.org/cache/epub/"+id+"/pg"+id+".txt",
 "https://mirror.cs.odu.edu/gutenberg-epub/"+id+"/pg"+id+".txt",
 "https://www.gutenberg.org/cache/epub/"+id+"/pg"+id+".cover.medium.jpg",
 "https://www.gutenberg.org/cache/epub/"+id+"/pg"+id+"-images.html",
 "https://www.gutenberg.org/cache/epub/"+id+"/cover.jpg",
];
for(const test of cases){for(const u of urls(test.id)){
 try{
 const r=await fetch(u,{headers:{"User-Agent":"Seeparah-source-audit/1.0 (https://seeparah.com)","Accept":"*/*"},signal:AbortSignal.timeout(10000)});
 const typ=r.headers.get("content-type");if(!r.ok){console.log(test.id,r.status,u);continue;}
 const b=new Uint8Array(await r.arrayBuffer());
 const hash=createHash("sha256").update(b).digest("hex");
 console.log(test.id,r.status,typ,b.length,hash,"matches-original?",hash===test.expected,u);
 }catch(e){console.log(test.id,"ERROR",String(e).slice(0,180),u)}
}}
