/**
 * Production read-only/guest-only Chromium smoke test of Seeparah's new
 * physical-paper zoom and local freehand annotation tools.
 * Never signs in, touches another user's records, or changes book content.
 */
import { chromium } from "playwright";

const BASE=process.env.SEE_PARAH_QA_URL||"https://seeparah.com";
const BOOK_ID="2b1caa84-c09c-4f24-adc9-2f43621a81f4";
const results=[];
const browser=await chromium.launch({headless:true});
async function audit(width,height){
  const context=await browser.newContext({
    viewport:{width,height},deviceScaleFactor:1,
    hasTouch:width<600,isMobile:width<600,
  });
  const page=await context.newPage();
  const fail=(message)=>{throw Error(width+"px: "+message);};
  try{
    await page.goto(BASE+"/read/"+BOOK_ID+"?lang=English&page=1",{
      waitUntil:"domcontentloaded",timeout:60_000,
    });
    await page.locator(".reader-v3-page[data-book-page]").first().waitFor({timeout:50_000});
    await page.waitForFunction(()=>{
      const label=document.querySelector(".reader-v3-topbar")?.textContent||"";
      return /Page \d+ of \d+/.test(label)&&
        !!document.querySelector(".reader-v3-flow [data-chapter-offset]");
    },{timeout:50_000});
    const baseline=await page.evaluate(()=>{
      const pageLeaf=document.querySelector(".reader-v3-page[data-book-page]");
      return {
        heading:document.querySelector(".reader-v3-topbar")?.textContent||"",
        width:pageLeaf?.getBoundingClientRect().width??0,
        pageCount:Number((document.querySelector(".reader-v3-topbar")?.textContent||"")
          .match(/of (\d+)/)?.[1]||0),
      };
    });
    if(baseline.pageCount<2)fail("book pagination did not settle");
    await page.getByRole("button",{name:"Reader settings"}).click();
    const size=page.locator('.reader-v3-settings input[type="range"]').first();
    await size.focus();
    await size.press("End");
    await page.getByRole("button",{name:"Done"}).click();
    await page.waitForTimeout(900);
    const larger=await page.evaluate(()=>{
      const leaf=document.querySelector(".reader-v3-page[data-book-page]");
      const stage=document.querySelector(".reader-v3-stage");
      return {
        pageCount:Number((document.querySelector(".reader-v3-topbar")?.textContent||"")
          .match(/of (\d+)/)?.[1]||0),
        width:leaf?.getBoundingClientRect().width??0,
        viewportWidth:document.documentElement.clientWidth,
        docScrollWidth:document.documentElement.scrollWidth,
        canPan:stage?.classList.contains("reader-v3-stage-zoomed")||false,
      };
    });
    if(larger.pageCount!==baseline.pageCount)
      fail("font-size change altered book page count");
    if(larger.width<baseline.width*1.17)
      fail("font-size change did not enlarge the physical page");
    if(!larger.canPan)
      fail("enlarged paper does not expose the panning stage");
    if(larger.docScrollWidth>larger.viewportWidth+2)
      fail("magnified paper overflowed the whole document, not just the reader stage");
    await page.getByRole("button",{name:"Draw or write by hand"}).click();
    const canvas=page.locator(".reader-v3-ink-active").first();
    await canvas.waitFor({timeout:25_000});
    await page.waitForTimeout(900);
    const rect=await canvas.boundingBox();
    if(!rect||rect.width<140||rect.height<150)
      fail("active ink overlay missing or too small");
    const start={x:rect.x+rect.width*.3,y:rect.y+rect.height*.5};
    await page.mouse.move(start.x,start.y);
    await page.mouse.down();
    await page.mouse.move(start.x+40,start.y+17,{steps:9});
    await page.mouse.up();
    await page.waitForTimeout(600);
    const paths=await canvas.locator("path").count();
    if(paths<1)fail("freehand pointer stroke was not committed");
    const guestSaved=await page.evaluate(()=>{
      return Object.keys(localStorage).some(x=>x.startsWith("seeparah:reader-ink:v1:"));
    });
    if(!guestSaved)fail("guest handwriting was not persisted");
    await page.getByRole("button",{name:"Undo drawing"}).click();
    if(await canvas.locator("path").count())fail("undo left drawing visible");
    await page.getByRole("button",{name:"Redo drawing"}).click();
    if(!await canvas.locator("path").count())fail("redo did not restore drawing");
    await page.getByRole("button",{name:"Eraser — remove brush strokes"}).click();
    await page.mouse.move(start.x+15,start.y+7);
    await page.mouse.down();
    await page.mouse.move(start.x+25,start.y+9,{steps:4});
    await page.mouse.up();
    await page.waitForTimeout(300);
    if(await canvas.locator("path").count())fail("eraser did not remove stroke");
    results.push({width,baselinePages:baseline.pageCount,zoomedPages:larger.pageCount,
      pageWidthBefore:baseline.width,pageWidthAfter:larger.width,ink:"pass"});
  }finally{await context.close();}
}
try{
  await audit(1440,900);
  await audit(375,812);
  console.log(JSON.stringify({status:"pass",results},null,2));
}finally{await browser.close();}
