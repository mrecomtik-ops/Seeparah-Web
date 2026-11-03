/** SP-01: real Android system-image Chrome on an Android SDK emulator.
 * This tests Android Chrome itself, not Playwright mobile desktop emulation.
 * It is neither physical hardware nor a TalkBack screen-reader test.
 * Read-only public edition navigation, no account/book writes.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const BASE=process.env.SEEPARAH_QA_URL||"https://seeparah.com";
const qa=[
  {book:"f7e3a9f0-931a-5207-9859-a27210cc2ca8",language:"Arabic",tag:"ar",stack:"Naskh",rtl:true},
  {book:"f7e3a9f0-931a-5207-9859-a27210cc2ca8",language:"Urdu",tag:"ur",stack:"Nastaliq",rtl:true},
  {book:"87205571-41a9-540a-abd2-3784a4079fad",language:"Hebrew",tag:"he",stack:"Hebrew",rtl:true},
  {book:"7bc812fd-6a4d-544e-903f-b2e333a5cc4f",language:"Greek",tag:"el",stack:null,rtl:false},
  {book:"898fc232-957e-52e6-8339-01a38c2a9da8",language:"Bilingual",tag:"zh-Hant",stack:null,rtl:false},
];
function adb(...args){return execFileSync("adb",args,{encoding:"utf8",timeout:30000}).trim();}
async function connectCDP(){
  for(let i=0;i<65;i++){
    try {return await chromium.connectOverCDP("http://127.0.0.1:9222",{timeout:4500});}
    catch{await sleep(700);}
  }
  throw new Error("Android Chrome DevTools was unavailable over adb localabstract socket");
}
const metrics=[];
let browser;
try{
  const packages=adb("shell","pm","list","packages").split("\n");
  assert.ok(packages.includes("package:com.android.chrome"),
    "Android emulator does not contain native Google Chrome: "+packages.filter(x=>/browser|chrome/i.test(x)).join(", "));
  const model=adb("shell","getprop","ro.product.model");
  const android=adb("shell","getprop","ro.build.version.release");
  const first=`${BASE}/read/${qa[0].book}?lang=${qa[0].language}&page=1`;
  // adb shell concatenates arguments into a shell command: the URL's '&'
  // must be quoted or Android treats it as shell background syntax.
  adb("shell","am","start","-a","android.intent.action.VIEW","-d",`'${first}'`,"-p","com.android.chrome");
  // Android Chrome's native debugging socket, not a desktop Chrome binary.
  adb("forward","tcp:9222","localabstract:chrome_devtools_remote");
  // Diagnose Chrome's first-run screen and available debugger sockets. This
  // only reads the disposable emulator, never a production account.
  await sleep(2500);
  try {
    const sockets=adb("shell","cat","/proc/net/unix").split("\n")
      .filter(x=>/chrome|devtools|webview/i.test(x)).slice(0,20);
    console.log("ANDROID_DEVTOOLS_SOCKETS "+JSON.stringify(sockets));
    console.log("ANDROID_RUNNING_APP "+
      adb("shell","dumpsys","activity","activities").split("\n")
        .filter(x=>/mResumed|topResumed|com.android.chrome/.test(x)).slice(0,6).join(" | "));
  } catch(e){ console.log("ANDROID_DIAGNOSTIC_UNAVAILABLE "+String(e).slice(0,250)); }
  browser=await connectCDP();
  const context=browser.contexts()[0];
  assert.ok(context,"No Android Chrome browser context");
  let page=context.pages().find(p=>p.url().startsWith("https://seeparah.com"));
  if(!page)page=context.pages()[0];
  if(!page)page=await context.newPage();
  for(const item of qa){
    const target=`${BASE}/read/${item.book}?lang=${encodeURIComponent(item.language)}&page=1`;
    await page.goto(target,{waitUntil:"domcontentloaded",timeout:60000});
    const original=page.locator('[lang="'+item.tag+'"]').first();
    await original.waitFor({timeout:55000});
    await page.evaluate(()=>document.fonts.ready);
    const result=await original.evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const css=getComputedStyle(el);
      return {
        lang:el.getAttribute("lang"),fontFamily:css.fontFamily,
        direction:css.direction,textLength:(el.textContent||"").trim().length,
        viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        boxWidth:rect.width,boxHeight:rect.height,
        fontFamiliesLoaded:[...document.fonts].filter(f=>f.status==="loaded").map(f=>f.family).slice(0,12),
        userAgent:navigator.userAgent,
      };
    });
    assert.equal(result.lang,item.tag,item.language+" language tag");
    assert.ok(result.textLength>5,item.language+" authored passage missing");
    assert.ok(result.boxWidth>0&&result.boxHeight>0,item.language+" empty glyph box");
    assert.ok(result.scrollWidth<=result.viewport+1,item.language+" horizontal overflow");
    if(item.stack)assert.ok(result.fontFamily.includes(item.stack),item.language+" font stack");
    if(item.rtl)assert.equal(result.direction,"rtl",item.language+" reading direction");
    assert.ok(result.userAgent.includes("Android"),"Not an actual Android Chrome browser");
    metrics.push({edition:item.language,...result});
  }
  console.log("SEE_PARAH_ANDROID_CHROME_QA "+JSON.stringify({
    status:"passed",engine:"Google Chrome for Android (SDK emulator)",model,android,
    results:metrics,productionMutations:0,
    limitation:"Android emulator, not physical handset or TalkBack accessibility acceptance"
  }));
}catch(e){
  console.error("SEE_PARAH_ANDROID_CHROME_QA "+JSON.stringify({
    status:"failed",error:e?.stack||String(e),completed:metrics,
  }));
  process.exitCode=1;
}finally{
  await browser?.close().catch(()=>{});
}
