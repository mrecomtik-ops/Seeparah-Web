/** Production read-only acceptance for book theme, request controls, saved highlights.
 * Browser emulation is not physical VoiceOver/TalkBack acceptance.
 * Never submits or modifies reader data; only local preferences in a fresh context.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SEE_PARAH_QA_URL || "https://seeparah.com";
const literaryBookId = "ef9f374c-b11c-49b3-8c54-05e5b7e9bf4c";
const sacredBookId = "f7e3a9f0-931a-5207-9859-a27210cc2ca8";
const browser = await chromium.launch({headless:true});
const passed = [];
try {
  for(const width of [390,1280]){
    const ctx=await browser.newContext({
      viewport:{width,height:width===390?844:900},
      isMobile:width===390,hasTouch:width===390,deviceScaleFactor:2,
    });
    const page=await ctx.newPage();
    try{
      await page.goto(base+"/read/"+literaryBookId+"?lang=English&page=1",{
        waitUntil:"domcontentloaded",timeout:65000,
      });
      const settingsButton=page.getByRole("button",{name:"Reader settings"});
      await settingsButton.waitFor({timeout:60000});
      const root=page.locator(".reader-v3-root").first();
      await page.evaluate(()=>document.documentElement.classList.add("dark"));
      const color=()=>root.evaluate(e=>({background:getComputedStyle(e).backgroundColor,klass:e.className,variables:{background:getComputedStyle(e).getPropertyValue("--background"),colorBackground:getComputedStyle(e).getPropertyValue("--color-background"),card:getComputedStyle(e).getPropertyValue("--card")},pageBackground:getComputedStyle(e.querySelector(".reader-v3-page")||e).backgroundColor,bodyClass:document.body.className,htmlClass:document.documentElement.className}));
      await settingsButton.click();
      await page.getByRole("button",{name:"light reading theme"}).click();
      const lightInfo=await color();
      assert.equal(await page.getByRole("button",{name:"light reading theme"}).getAttribute("aria-pressed"),"true");
      await page.getByRole("button",{name:"sepia reading theme"}).click();
      const sepiaInfo=await color();
      await page.getByRole("button",{name:"dark reading theme"}).click();
      const darkInfo=await color();
      console.log("SEEPARAH_THEME_DIAGNOSTIC "+JSON.stringify({width,lightInfo,sepiaInfo,darkInfo}));
      const light=lightInfo.background,sepia=sepiaInfo.background,dark=darkInfo.background;
      assert.notEqual(light,sepia,"Light and sepia backgrounds must differ");
      assert.notEqual(sepia,dark,"Sepia and dark backgrounds must differ");
      assert.notEqual(light,dark,"Light and dark backgrounds must differ");
      // Persist the choice for this browser and make it readable again.
      await page.getByRole("button",{name:"sepia reading theme"}).click();
      await page.getByRole("button",{name:"Done",exact:true}).click();
      const review=page.getByRole("button",{name:/View saved highlights \(/});
      await review.waitFor({timeout:10000});
      await review.click();
      const dialog=page.getByRole("dialog",{name:"Saved highlights"});
      await dialog.waitFor();
      assert.ok(await dialog.getByText("No highlights yet").count());
      await dialog.getByRole("button",{name:"Close saved highlights"}).click();
      assert.equal(await dialog.count(),0,"Highlight drawer closes to reading");
      await settingsButton.click();
      const request=page.getByRole("button",{name:"Request",exact:true});
      await request.waitFor();
      assert.equal(await request.isDisabled(),true,"Select target language first");
      await page.locator(".reader-v3-settings select").last().selectOption("Urdu");
      assert.equal(await request.isEnabled(),true,"A reader can request a missing-language edition");
      assert.ok(await page.getByText(/rights clearance and publication require separate editorial approval/i).count());
      // Never actually submit: authenticated and rights review are tested independently.
      await page.getByRole("button",{name:"Done",exact:true}).click();
      await page.reload({waitUntil:"domcontentloaded",timeout:60000});
      await page.getByRole("button",{name:"Reader settings"}).waitFor({timeout:60000});
      assert.equal(await root.evaluate(e=>e.classList.contains("reader-sepia")),true,
        "Saved sepia choice persists after reload");
      passed.push({width,reader:"literature",colors:{light,sepia,dark},persisted:true});
      console.log("SEEPARAH_THEME_QA "+JSON.stringify(passed.at(-1)));

      await page.goto(base+"/read/"+sacredBookId+"?lang=Arabic&page=1",{
        waitUntil:"domcontentloaded",timeout:65000,
      });
      const sacredViewer=page.getByRole("button",{name:/View saved highlights \(/});
      await sacredViewer.waitFor({timeout:60000});
      await sacredViewer.click();
      await page.getByRole("dialog",{name:"Saved highlights"}).waitFor();
      await page.getByRole("button",{name:"Close saved highlights"}).click();
      passed.push({width,reader:"sacred",highlightViewer:true});
      console.log("SEEPARAH_THEME_QA "+JSON.stringify(passed.at(-1)));
    }finally{await ctx.close();}
  }
  assert.equal(passed.length,4);
  console.log("SEEPARAH_THEME_QA_SUMMARY "+JSON.stringify({status:"passed",cases:passed.length}));
}catch(error){
  console.error("SEEPARAH_THEME_QA_SUMMARY "+JSON.stringify({
    status:"failed",cases:passed.length,error:error.stack||String(error),
  }));
  process.exitCode=1;
}finally{await browser.close();}
