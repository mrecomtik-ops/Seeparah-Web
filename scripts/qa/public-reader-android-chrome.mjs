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
/** Dismiss Google Chrome's disposable emulator FirstRunActivity, never
 * authenticating or accepting any Seeparah data changes. */
async function dismissChromeFirstRun(){
  const preferences=[
    /use without an account/i,
    /continue without/i,
    /accept\s*(?:&amp;|&|and)\s*continue/i,
    /agree and continue/i,
    /no thanks/i,
    /not now/i,
    /skip/i,
    /^continue$/i,
    /^next$/i,
    /got it/i,
  ];
  for(let attempt=0;attempt<18;attempt++){
    const activityLines=adb("shell","dumpsys","activity","activities").split("\n")
      .filter(x=>x.includes("topResumedActivity="));
    console.log("ANDROID_CHROME_TOP_ACTIVITY "+JSON.stringify(activityLines.slice(0,4)));
    if(!activityLines.some(x=>x.includes("FirstRunActivity"))){
      // An Android intent can return before its first-run activity resumes.
      // Only finish the handler after Chrome itself becomes the active app.
      if(activityLines.some(x=>x.includes("com.android.chrome")))return;
      await sleep(1400);
      continue;
    }
    const target="/sdcard/chrome-first-run.xml";
    adb("shell","uiautomator","dump",target);
    const xml=adb("shell","cat",target);
    const nodes=[...xml.matchAll(/<node\s+[^>]+>/g)].map(([markup])=>{
      const text=markup.match(/text="([^"]*)"/)?.[1]||"";
      const description=markup.match(/content-desc="([^"]*)"/)?.[1]||"";
      const bounds=markup.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      return {label:text+" "+description,bounds};
    });
    console.log("ANDROID_CHROME_ONBOARDING "+JSON.stringify(nodes.map(n=>n.label.trim())
      .filter(Boolean).slice(0,25)));
    let choice;
    for(const pattern of preferences){
      choice=nodes.find(n=>pattern.test(n.label)&&n.bounds);
      if(choice)break;
    }
    if(!choice?.bounds){
      // Fresh Google Play images can report Chrome's FirstRunActivity before
      // it exposes child accessibility nodes. Do not prematurely fail or
      // randomly tap the screen: wait for a button we can actually identify.
      console.log("ANDROID_CHROME_ONBOARDING_NOT_READY "+String(attempt+1));
      await sleep(3500);
      continue;
    }
    const b=choice.bounds;
    const x=Math.round((Number(b[1])+Number(b[3]))/2);
    const y=Math.round((Number(b[2])+Number(b[4]))/2);
    adb("shell","input","tap",String(x),String(y));
    await sleep(1700);
  }
  throw new Error("Chrome first-run never provided an accessible sign-in-free continue button after 18 checks");
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
  // First-run can be blank on hosted emulators before account services
  // initialize. Use Chromium's documented disposable test-device flags
  // rather than touching a Google account or changing production settings.
  adb("shell","am","set-debug-app","--persistent","com.android.chrome");
  adb("shell",`echo 'chrome --disable-fre --no-first-run --no-default-browser-check --skip_first_run_ui' > /data/local/tmp/chrome-command-line`);
  adb("shell","am","force-stop","com.android.chrome");
  adb("shell","am","start","-n","com.android.chrome/com.google.android.apps.chrome.Main");
  await sleep(2500);
  // Also pass the Chromium FirstRunFlowSequencer per-intent skip flag.
  // adb shell re-parses &, so quote the full synthetic public URL.
  adb("shell","am","start","-a","android.intent.action.VIEW","-d",`'${first}'`,"-p","com.android.chrome","--ez","skip_first_run_experience","true");
  await sleep(2000);
  await dismissChromeFirstRun();
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
