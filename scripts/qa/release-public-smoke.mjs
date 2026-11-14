/** Read-only production QA; no identity or database writes. */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const BASE="https://seeparah.com";
const QURAN="f7e3a9f0-931a-5207-9859-a27210cc2ca8";
const JEKYLL="8c20a875-ed09-4be7-bda0-acccc1a3000a";
const OUT="audit-out/release-readiness";
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[],failures=[];
async function check(label,width,height,fn){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,reducedMotion:"reduce"});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(String(e).slice(0,250)));
  try{
    const data=await fn(page);
    if(errors.length)throw Error("JavaScript page errors: "+errors.join(" | "));
    results.push({label,width,status:"passed",...data});
  }catch(e){
    failures.push({label,width,error:String(e.stack||e),pageErrors:errors});
    await page.screenshot({path:OUT+"/"+label.replace(/[^a-z0-9]+/gi,"-")+"-"+width+".png"}).catch(()=>{});
  }finally{await context.close();}
}
await check("Library search",390,844,async(page)=>{
  await page.goto(BASE+"/library?q=Jekyll",{waitUntil:"domcontentloaded",timeout:60000});
  await page.getByRole("textbox",{name:"Search the library by title or author"}).waitFor({timeout:60000});
  await page.getByText(/strange case of Dr. Jekyll and Mr. Hyde/i).first().waitFor({state:"visible",timeout:60000});
  return {searchResult:"verified"};
});
await check("Published reader",390,844,async(page)=>{
  await page.goto(BASE+"/read/"+JEKYLL+"?lang=English&page=1",{waitUntil:"domcontentloaded",timeout:60000});
  await page.getByRole("button",{name:"Reader settings"}).waitFor({state:"visible",timeout:65000});
  await page.locator(".reader-v3-page").first().waitFor({state:"visible",timeout:65000});
  await page.getByRole("button",{name:"Reader settings"}).click();
  await page.getByRole("dialog",{name:"Reading settings"}).waitFor({timeout:30000});
  await page.getByRole("combobox",{name:"Line spacing"}).waitFor({state:"visible",timeout:30000});
  const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth}));
  if(size.scroll>size.width+2)throw Error("Reader horizontal overflow "+JSON.stringify(size));
  return {settings:"operable",...size};
});
for(const width of [390,1280]){
  for(const language of ["English","Urdu"]){
    await check("Quran inline "+language,width,width<500?844:900,async(page)=>{
      await page.goto(BASE+"/read/"+QURAN+"?lang=Arabic&page=1",{waitUntil:"domcontentloaded",timeout:60000});
      const select=page.locator('select[aria-label="Compare verified parallel edition"]');
      await select.waitFor({state:"visible",timeout:65000});
      await select.selectOption(language);
      await page.locator("[data-quran-inline-comparison]").first().waitFor({state:"visible",timeout:60000});
      await page.waitForFunction(()=>{
        const articles=[...document.querySelectorAll("article[data-sacred-visible-chunk]")];
        return articles.length>=3 && articles.every(a=>{
          const inline=a.querySelector("[data-quran-inline-comparison]");
          return inline && (inline.querySelector("[data-quran-matched-reference]") ||
            inline.textContent?.includes("No verified") ||
            inline.textContent?.includes("could not be loaded"));
        });
      },null,{timeout:60000});
      const detail=await page.evaluate(()=>{
        const articles=[...document.querySelectorAll("article[data-sacred-visible-chunk]")];
        const metrics={verses:articles.length,matched:0,unmatched:0,incorrectPlacement:0,
          docWidth:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth};
        for(const a of articles){
          const source=a.querySelector("[data-sacred-source-text]");
          const translation=a.querySelector("[data-quran-inline-comparison]");
          if(!source||!translation||(source.compareDocumentPosition(translation)&Node.DOCUMENT_POSITION_PRECEDING))
            metrics.incorrectPlacement++;
          if(translation?.querySelector("[data-quran-matched-reference]"))metrics.matched++;
          else metrics.unmatched++;
        }
        return metrics;
      });
      if(detail.verses<3||detail.unmatched||detail.incorrectPlacement)
        throw Error("Unmatched or incorrectly placed ayahs: "+JSON.stringify(detail));
      if(detail.docWidth>detail.viewport+2)
        throw Error("Comparison overflows viewport: "+JSON.stringify(detail));
      return detail;
    });
  }
}
await browser.close();
const report={checkedAt:new Date().toISOString(),status:failures.length?"failed":"passed",results,failures};
await writeFile(OUT+"/smoke.json",JSON.stringify(report,null,2));
console.log("SEEPARAH_RELEASE_SMOKE "+JSON.stringify(report));
if(failures.length)process.exitCode=1;
