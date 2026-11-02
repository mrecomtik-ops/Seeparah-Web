/** Public production smoke QA: actual Chromium at narrow touch viewport.
 * Native browser 200% zoom, iOS VoiceOver and Android TalkBack are NOT
 * simulated by CSS zoom; report these as separate human acceptance gates.
 * No sign-in, user mutation, or privileged account credentials.
 */
import { chromium } from "playwright";

const BASE = process.env.SEEPARAH_QA_URL || "https://seeparah.com";
const readerId = "8c20a875-ed09-4be7-bda0-acccc1a3000a";
const matthewId = "7bc812fd-6a4d-544e-903f-b2e333a5cc4f";
const analectsId = "898fc232-957e-52e6-8339-01a38c2a9da8";
const output = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 320, height: 820 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const fail = (msg) => { throw new Error(msg); };
try {
  await page.goto(`${BASE}/read/${readerId}?lang=English&page=1`, {
    waitUntil: "domcontentloaded", timeout: 60000,
  });
  await page.locator('[aria-label="Back to library"]').first().waitFor({ timeout: 45000 });
  await page.locator('.reader-v3-stage').first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(1600);
  const normal = await page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    };
    return {
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      back: box(document.querySelector('[aria-label="Back to library"]')),
      contents: box(document.querySelector('[aria-label="Contents"]')),
      settings: box(document.querySelector('[aria-label="Reader settings"]')),
      stage: box(document.querySelector(".reader-v3-stage")),
      visibleWords: document.querySelector(".reader-v3-stage")?.textContent?.trim().length || 0,
    };
  });
  output.push({ area: "literature-320", ...normal });
  if (normal.scrollWidth > normal.width + 1) fail("320px literature reader scrolls sideways");
  if (!normal.back || normal.back.width < 44 || normal.back.height < 44) fail("Back control smaller than 44px");
  for (const [label, rect] of [["Contents", normal.contents], ["Reader settings", normal.settings]]) {
    if (rect && (rect.width < 44 || rect.height < 44)) fail(label + " below 44px");
  }
  if (!normal.stage || normal.stage.height < 100) fail("Reader page was not visible");
  // CSS zoom is a stress check, not a native Chrome zoom assertion.
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await page.waitForTimeout(900);
  const stress = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    readerVisible: Boolean(document.querySelector(".reader-v3-stage")?.getBoundingClientRect().height),
  }));
  output.push({ area: "css-zoom-2-approximation", ...stress, caveat: "not native browser zoom" });
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });

  // Focus-visible skip-to-content is tested independently from the reader.
  await page.goto(`${BASE}/library`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const skip = page.locator('a[href="#main-content"]').first();
  await skip.waitFor({ timeout: 30000 });
  await skip.focus();
  const skipSize = await skip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height) };
  });
  output.push({ area: "focused-skip-link", ...skipSize });
  if (skipSize.height < 44) fail("Focused skip link smaller than 44px");

  // Multiscript checks use actual authored source editions. Do not alter text.
  await page.goto(`${BASE}/read/${matthewId}?lang=Greek&page=1`, {
    waitUntil: "domcontentloaded", timeout: 60000,
  });
  const greek = page.locator('[lang="el"]').first();
  await greek.waitFor({ timeout: 45000 });
  const greekStyle = await greek.evaluate((el) => ({
    family: getComputedStyle(el).fontFamily,
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  output.push({ area: "Greek-Matthew", ...greekStyle });
  if (greekStyle.scrollWidth > greekStyle.width + 1) fail("Greek 320px page scrolls sideways");

  await page.goto(`${BASE}/read/${analectsId}?lang=Bilingual&page=1`, {
    waitUntil: "domcontentloaded", timeout: 60000,
  });
  const chinese = page.locator('[lang="zh-Hant"]').first();
  await chinese.waitFor({ timeout: 45000 });
  const chineseStyle = await chinese.evaluate((el) => ({
    family: getComputedStyle(el).fontFamily,
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  output.push({ area: "Chinese-Analects", ...chineseStyle });
  if (chineseStyle.scrollWidth > chineseStyle.width + 1) fail("Chinese 320px page scrolls sideways");
  console.log("SEE_PARAH_PUBLIC_BROWSER_QA " + JSON.stringify({ status: "passed", output }));
} catch (e) {
  console.error("SEE_PARAH_PUBLIC_BROWSER_QA " + JSON.stringify({ status: "failed", output, error: String(e) }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
