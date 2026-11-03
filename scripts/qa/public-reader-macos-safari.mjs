/**
 * SP-01: genuine Apple Safari desktop browser through Apple's safaridriver
 * (not Playwright's Linux WebKit implementation, not iOS Safari).
 * Read-only checks against public published source editions. No auth or writes.
 *
 * Safaridriver must first be enabled on a macOS runner:
 *   sudo /usr/bin/safaridriver --enable
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.SEEPARAH_QA_URL || "https://seeparah.com";
const PORT = Number(process.env.SAFARI_DRIVER_PORT || "4451");
const driverOrigin = "http://127.0.0.1:" + PORT;
const cases = [
  {title:"Quran Arabic",id:"f7e3a9f0-931a-5207-9859-a27210cc2ca8",language:"Arabic",tag:"ar",font:"Naskh",rtl:true},
  {title:"Quran Urdu",id:"f7e3a9f0-931a-5207-9859-a27210cc2ca8",language:"Urdu",tag:"ur",font:"Nastaliq",rtl:true},
  {title:"Genesis Hebrew",id:"87205571-41a9-540a-abd2-3784a4079fad",language:"Hebrew",tag:"he",font:"Hebrew",rtl:true},
  {title:"Matthew Greek",id:"7bc812fd-6a4d-544e-903f-b2e333a5cc4f",language:"Greek",tag:"el",font:null,rtl:false},
  {title:"Analects Bilingual Chinese",id:"898fc232-957e-52e6-8339-01a38c2a9da8",language:"Bilingual",tag:"zh-Hant",font:null,rtl:false},
];
const driver = spawn("/usr/bin/safaridriver", ["-p", String(PORT)], { stdio:["ignore","pipe","pipe"] });
let driverLog = "";
for (const stream of [driver.stdout, driver.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", value => { driverLog += value; });
}
async function command(method, path, data, timeoutMs=60000) {
  const response = await fetch(driverOrigin+path,{
    method,
    headers:{"content-type":"application/json"},
    ...(data===undefined?{}:{body:JSON.stringify(data)}),
    signal:AbortSignal.timeout(timeoutMs),
  });
  const result=await response.json();
  if(!response.ok||result?.value?.error) {
    throw new Error(method+" "+path+" failed: "+JSON.stringify(result).slice(0,700));
  }
  return result.value;
}
async function waitDriver() {
  for(let i=0;i<90;i++){
    if(driver.exitCode!==null)throw new Error("Safari driver exited: "+driverLog.slice(-1500));
    try {const status=await command("GET","/status",undefined,1000);if(status?.ready!==false)return;}catch{}
    await sleep(350);
  }
  throw new Error("Safari driver did not become ready: "+driverLog.slice(-1500));
}
async function execute(sessionId, script, args=[]){
  return command("POST",`/session/${sessionId}/execute/sync`,{script,args});
}
async function waitForLanguage(sessionId, code, timeoutMs=60000){
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    const state=await execute(sessionId,`
      const e=document.querySelector('[lang="'+arguments[0]+'"]');
      return e?{length:(e.textContent||'').trim().length,ready:document.fonts.status}:null;
    `,[code]);
    if(state?.length>5&&state.ready==="loaded")return;
    await sleep(900);
  }
  throw new Error("Safari reader did not load published authored source for "+code);
}
const metrics=[];
let sessionId=null;
try{
  await waitDriver();
  // Hosted macOS runners can start Safari slowly on first boot, even after
  // safaridriver becomes ready. Retry ONLY new-session establishment (no
  // page checks or acceptance failures are retried).
  let created;
  for (let attempt=0;attempt<3;attempt++){
    try {
      created=await command("POST","/session",{
        capabilities:{alwaysMatch:{browserName:"safari"}}
      },90000);
      break;
    } catch (error) {
      if (attempt===2 || !String(error).includes("session not created")) throw error;
      await sleep(3000);
    }
  }
  sessionId=created?.sessionId;
  assert.ok(sessionId,"Safari returned no WebDriver session ID");
  // macOS Safari may clamp very narrow requested window widths.
  await command("POST",`/session/${sessionId}/window/rect`,{width:575,height:900}).catch(()=>{});
  for(const item of cases){
    const url=`${BASE}/read/${item.id}?lang=${encodeURIComponent(item.language)}&page=1`;
    await command("POST",`/session/${sessionId}/url`,{url},90000);
    await waitForLanguage(sessionId,item.tag);
    const result=await execute(sessionId,`
      const tag=arguments[0], selector='[lang="'+tag+'"]';
      const el=document.querySelector(selector);
      const r=el.getBoundingClientRect();
      const style=getComputedStyle(el);
      const firstText=(el.textContent||'').trim();
      const loadedFonts=[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family).slice(0,40);
      return {
        lang:el.getAttribute('lang'), direction:style.direction,
        textLength:firstText.length, box:{width:r.width,height:r.height},
        cssViewport:innerWidth,docWidth:document.documentElement.scrollWidth,
        fontFamily:style.fontFamily,documentFontStatus:document.fonts.status,
        loadedFonts,
      };
    `,[item.tag]);
    assert.equal(result.lang,item.tag,item.title+" BCP47 language");
    assert.ok(result.textLength>5,item.title+" source text missing");
    assert.ok(result.box.width>0 && result.box.height>0,item.title+" no visible glyph layout");
    assert.ok(result.docWidth<=result.cssViewport+1,item.title+" horizontal overflow");
    if(item.font)assert.ok(result.fontFamily.includes(item.font),item.title+" font stack absent");
    if(item.rtl)assert.equal(result.direction,"rtl",item.title+" lost RTL reading direction");
    metrics.push({title:item.title,...result});
  }
  console.log("SEE_PARAH_NATIVE_MAC_SAFARI_QA "+JSON.stringify({
    status:"passed",engine:"Apple Safari via safaridriver on macOS",
    results:metrics,
    limitation:"Desktop Safari is not physical iOS Safari/Android or VoiceOver/TalkBack",
    productionMutation:false,
  }));
}catch(error){
  console.error("SEE_PARAH_NATIVE_MAC_SAFARI_QA "+JSON.stringify({
    status:"failed",error:error?.stack||String(error),results:metrics,driverLog:driverLog.slice(-1200)
  }));
  process.exitCode=1;
}finally{
  if(sessionId)await command("DELETE",`/session/${sessionId}`).catch(()=>{});
  driver.kill("SIGTERM");
}
