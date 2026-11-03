/**
 * SP-01: Native iOS Safari using a stock Apple iOS Simulator runtime.
 * Evidence is rendered, original-language screenshots. This exercises actual
 * iOS Safari, not Mac Safari or Playwright WebKit emulation, but it is NOT a
 * physical iPhone and does NOT claim VoiceOver acceptance.
 *
 * No auth, account access, or production writes. Screenshot pages contain
 * only publicly published source editions.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const base=process.env.SEEPARAH_QA_URL || "https://seeparah.com";
const out=process.env.SEEPARAH_IOS_ARTIFACT_DIR || "artifacts/ios-simulator";
mkdirSync(out,{recursive:true});
function xcrun(...args) {
  return execFileSync("xcrun",args,{encoding:"utf8",timeout:180000}).trim();
}
const items=[
  {key:"quran-arabic",title:"Qur'an Arabic",id:"f7e3a9f0-931a-5207-9859-a27210cc2ca8",lang:"Arabic"},
  {key:"quran-urdu",title:"Qur'an Urdu",id:"f7e3a9f0-931a-5207-9859-a27210cc2ca8",lang:"Urdu"},
  {key:"genesis-hebrew",title:"Genesis Hebrew",id:"87205571-41a9-540a-abd2-3784a4079fad",lang:"Hebrew"},
  {key:"matthew-greek",title:"Matthew Greek",id:"7bc812fd-6a4d-544e-903f-b2e333a5cc4f",lang:"Greek"},
  {key:"analects-chinese",title:"Analects Chinese",id:"898fc232-957e-52e6-8339-01a38c2a9da8",lang:"Bilingual"},
];
let chosen=null;const results=[];
try{
  const devices=JSON.parse(xcrun("simctl","list","devices","available","--json"));
  const compatible=Object.entries(devices.devices)
    .filter(([runtime])=>runtime.includes("iOS"))
    .flatMap(([runtime,list])=>list.map(item=>({...item,runtime})))
    .filter(item=>item.name==="iPhone 16"&&item.isAvailable!==false);
  chosen=compatible.sort((a,b)=>b.runtime.localeCompare(a.runtime))[0];
  if(!chosen)throw new Error("No installed iPhone 16 Simulator runtime on hosted runner");
  if(chosen.state!=="Booted")xcrun("simctl","boot",chosen.udid);
  xcrun("simctl","bootstatus",chosen.udid,"-b");
  // Force a consistent light mode and unchanged Dynamic Type for source runs.
  xcrun("simctl","ui",chosen.udid,"appearance","light");
  for(const item of items){
    const url=base+"/read/"+item.id+"?lang="+encodeURIComponent(item.lang)+"&page=1";
    // Public source page only. On iOS this starts Mobile Safari.
    xcrun("simctl","openurl",chosen.udid,url);
    await sleep(11000);
    const path=out+"/"+item.key+".png";
    xcrun("simctl","io",chosen.udid,"screenshot","--type=png",path);
    results.push({key:item.key,title:item.title,url,screenshot:path});
  }
  // Visual sampling is confined to Safari's content middle, not status/nav bars.
  // No OCR or inferred reading text: proof of nonblank and changed rendering.
  function readVisualMetrics() {
    const output=execFileSync("swift",[
      "scripts/qa/ios-screenshot-metrics.swift",
      ...results.map(x=>x.screenshot)
    ],{encoding:"utf8",timeout:120000}).trim();
    return JSON.parse(output);
  }
  let screenshots=readVisualMetrics();
  if(screenshots.length!==items.length)throw new Error("Screenshot count mismatch");
  const blank = (m) => m.width<600 || m.height<1100 ||
    m.quantizedColorCount<12 || m.luminanceRange<65 ||
    m.darkSampleRatio<0.003;
  // Native Simulator Safari occasionally starts a tab on a white paint frame
  // before hydration. Preserve evidence of the initial failure and verify a
  // full browser reload instead of treating an empty screenshot as success.
  const firstPassBlank=screenshots.filter(blank).map(m=>m.name);
  if(firstPassBlank.length) {
    console.warn("SEE_PARAH_IOS_FIRST_PASS_BLANK "+JSON.stringify(firstPassBlank));
    for(const name of firstPassBlank){
      const item=results.find(x=>x.screenshot.endsWith("/"+name));
      if(!item) throw new Error("Cannot identify blank screenshot: "+name);
      xcrun("simctl","openurl",chosen.udid,item.url);
      await sleep(19000);
      xcrun("simctl","io",chosen.udid,"screenshot","--type=png",item.screenshot);
    }
    screenshots=readVisualMetrics();
  }
  for(const m of screenshots){
    if(blank(m)) throw new Error("Mobile Safari page still blank after retry: "+JSON.stringify(m));
  }
  if(new Set(screenshots.map(x=>x.centerDigest)).size<3)
    throw new Error("Five independent original-language pages rendered indistinguishably");
  const evidence={status:"passed",engine:"Apple iOS Mobile Safari (iPhone 16 Simulator)",
    runtime:chosen.runtime,device:chosen.name,
    screens:screenshots,initialBlankScreens:firstPassBlank,productionMutations:0,
    limitations:"Simulator screenshots prove original-language pages visibly render; NOT physical iOS hardware, VoiceOver, or glyph-by-glyph validation",
  };
  writeFileSync(out+"/acceptance.json",JSON.stringify(evidence,null,2));
  console.log("SEE_PARAH_IOS_SAFARI_SIMULATOR_QA "+JSON.stringify(evidence));
}catch(error){
  console.error("SEE_PARAH_IOS_SAFARI_SIMULATOR_QA "+JSON.stringify({
    status:"failed",error:error?.stack||String(error),device:chosen?.name,completed:results,
  }));
  process.exitCode=1;
}finally{
  if(chosen)try{xcrun("simctl","shutdown",chosen.udid);}catch{}
}
