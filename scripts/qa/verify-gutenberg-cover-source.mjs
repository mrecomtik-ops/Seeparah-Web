
import { createHash } from "node:crypto";
const ids=[3616,3699,3700,3710,3711,3712,3713,3716,3717,3718,3720,3723,3724,3767,3792,3801,3802,3803,3806,3926,3942,3946,3985,3999,4002,4033,4048,4056,4071,4226,4506,4586,4587,4588,4589,4590,4591,4592,4594,4595,4616,4617,4619,4622,4623,4624,4625,4626,4627,4628,4629,4630,4631,4632,4669,4675,4677,4680,4777,4795,4955,4956,4957,4958,5348,5352,5589,5590,5591,5673,6050,6098,6148,6357,6454,6709,6761,6944,6945,6947,7079,7087,7114,7307,7372,7425,7608,7614,7623,7630,7639,7658,7671,7701,7714,7727,7735,7749,7756,7757,7758,7759,7760,7761,7823,7842,7878,7881,8188,8384,8424,8572,8607,8677,8694,8711,8883,9152,9202,9210,9211,9214,9215,9217,9218,9219,9221,9223,9225,9226,9227,9228,9229,9230,9231,9232,9233,9235,9236,9238,9239,9247,9248,9251,9332,9387,9476,9502,9755,9756,9758,9759,9760,9761,9762,9763,9764,9765,9768,9769,9770,9771,9772,9773,9774,9817,9983,10007,10049,10149,10165,10222,10318,10322,10377,10458,10560,10729,10810,10915,10926,11085,11105,11120,11171,11231,11243,11333,11521,11573,11610,11860,12354,12453,12558,12828,12886,13001,13077,13162,13260,13290,13305,13375,13572,13896,14098,14382,15117,15124,15181,15182,15183,15238,15289,17973,19671,21137,58323,58462];
function dimensions(b){
 if(b.length<128||b[0]!==255||b[1]!==216)return null;
 let i=2;
 while(i+12<b.length){if(b[i]!==255){i++;continue;}const marker=b[i+1];i+=2;if(marker===216||marker===217||marker===1)continue;if(i+2>b.length)break;
 const len=(b[i]<<8)|b[i+1];if(len<2||i+len>b.length)break;
 if([192,193,194,195,198,199,201,202].includes(marker)){const h=(b[i+3]<<8)|b[i+4],w=(b[i+5]<<8)|b[i+6];return {w,h};}
 i+=len;
 }return null;
}
const found=[],missing=[];
let next=0;
async function worker(){
 while(next<ids.length){
 const id=ids[next++]; const url="https://www.gutenberg.org/cache/epub/"+id+"/pg"+id+".cover.medium.jpg";
 let result=null;
 for(let attempt=0;attempt<2;attempt++){
 try{const response=await fetch(url,{headers:{"Accept":"image/jpeg","User-Agent":"Seeparah-eBook-cover-source-verification/1.0 (https://seeparah.com)"},signal:AbortSignal.timeout(13000)});
 if(!response.ok)throw Error("HTTP "+response.status);
 const type=response.headers.get("content-type")||"";if(!/image\/jpeg/i.test(type))throw Error("not-jpeg "+type);
 const bytes=new Uint8Array(await response.arrayBuffer());
 const dims=dimensions(bytes);
 if(!dims||dims.w<180||dims.h<260||dims.w>8000||dims.h>10000||bytes.length<2500||bytes.length>2000000)
   throw Error("invalid-jpeg-dimensions "+JSON.stringify(dims)+" bytes="+bytes.length);
 result={id,sha:createHash("sha256").update(bytes).digest("hex"),w:dims.w,h:dims.h,bytes:bytes.length};
 break;
 }catch(e){if(attempt===1)result={id,error:String(e).slice(0,120)};else await new Promise(resolve=>setTimeout(resolve,250));}
 }
 if(result.sha){found.push(result);console.log("VERIFIED_COVER",result.id,result.sha,result.w,result.h,result.bytes);}
 else {missing.push(result);console.log("UNAVAILABLE_COVER",id,result.error);}
 }
}
await Promise.all(Array.from({length:8},worker));
console.log("SCAN_SUMMARY",JSON.stringify({total:ids.length,verified:found.length,unavailable:missing.length,validated_ids:found.map(x=>x.id),unavailable_ids:missing.map(x=>x.id)}));
