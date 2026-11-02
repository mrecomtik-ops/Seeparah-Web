/** Public reader glyph/overflow smoke check in REAL WebKit on Linux.
 * This tests WebKit's renderer (rather than Chromium pretending to be iOS).
 * It is not a claim of actual iOS Safari, VoiceOver or physical Android QA.
 * Read-only: no authentication, metadata edits or publication.
 */
import { webkit, devices } from "playwright";

const BASE = process.env.SEEPARAH_QA_URL || "https://seeparah.com";
const checks = [
  { work: "f7e3a9f0-931a-5207-9859-a27210cc2ca8", language: "Arabic", tag: "ar", font: "Naskh" },
  { work: "f7e3a9f0-931a-5207-9859-a27210cc2ca8", language: "Urdu", tag: "ur", font: "Nastaliq" },
  { work: "87205571-41a9-540a-abd2-3784a4079fad", language: "Hebrew", tag: "he", font: "Hebrew" },
  { work: "898fc232-957e-52e6-8339-01a38c2a9da8", language: "Bilingual", tag: "zh-Hant", font: null },
];
const result = [];
const browser = await webkit.launch({ headless: true });
try {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  for (const item of checks) {
    await page.goto(`${BASE}/read/${item.work}?lang=${encodeURIComponent(item.language)}&page=1`, {
      waitUntil: "domcontentloaded", timeout: 60000,
    });
    const element = page.locator(`[lang="${item.tag}"]`).first();
    await element.waitFor({ timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await element.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        lang: el.getAttribute("lang"), fontFamily: getComputedStyle(el).fontFamily,
        viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
        glyphContentLength: el.textContent?.trim().length ?? 0,
        glyphBoxWidth: rect.width, glyphBoxHeight: rect.height,
      };
    });
    result.push({ title: item.language + " WebKit iPhone viewport", ...metrics });
    if (metrics.lang !== item.tag || metrics.glyphContentLength < 5) {
      throw new Error(item.language + ": authored source language content not visible");
    }
    if (metrics.pageWidth > metrics.viewport + 1) {
      throw new Error(item.language + ": horizontal overflow in WebKit");
    }
    if (metrics.glyphBoxWidth <= 0 || metrics.glyphBoxHeight <= 0) {
      throw new Error(item.language + ": script glyph layout box is empty");
    }
    if (item.font && !metrics.fontFamily.includes(item.font)) {
      throw new Error(item.language + ": intended script font not in computed family");
    }
  }
  await ctx.close();
  console.log("SEE_PARAH_WEBKIT_SCRIPT_QA " + JSON.stringify({
    status: "passed", result,
    limitation: "WebKit Linux iPhone viewport; not device-native iOS Safari or screen reader",
  }));
} catch (error) {
  console.error("SEE_PARAH_WEBKIT_SCRIPT_QA " + JSON.stringify({
    status: "failed", result, error: String(error),
  }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
