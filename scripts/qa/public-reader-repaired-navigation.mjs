/**
 * Non-privileged, production-only navigation acceptance for the 41
 * previously repaired Gutenberg editions. This is Chromium functional
 * acceptance, NOT native Safari, VoiceOver or physical-device signoff.
 * It never writes books, user progress, or authentication state.
 */
import { chromium } from "playwright";

const base = (process.env.SEEPARAH_QA_URL || "https://seeparah.com").replace(/\/$/, "");
const concurrency = Math.max(1, Math.min(3, Number(process.env.QA_CONCURRENCY || 2)));
const fail = (message) => { throw new Error(message); };
async function getPage(kind, page) {
  const url = base + "/api/catalog-qa-public.json?kind=" + kind + "&page=" + page;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { Accept: "application/json" } });
  if (!response.ok) fail("Public catalogue QA " + kind + " HTTP " + response.status);
  const data = await response.json();
  if (data.version !== 2 || data.scope !== "published-catalogue-page" ||
      data.kind !== kind || !Array.isArray(data.rows)) fail("Invalid public QA response for " + kind);
  return data;
}
async function allPages(kind) {
  const all = [];
  for (let index = 1; index <= 50; index++) {
    const data = await getPage(kind, index);
    all.push(...data.rows);
    if (!data.hasMore) return all;
  }
  fail("Public QA pagination exceeded guarded 50 pages for " + kind);
}
const [reviews, books] = await Promise.all([allPages("reviews"), allPages("books")]);
const flagged = reviews.filter(r => r.status === "navigation_repaired_pending_visual_qa");
const catalog = new Map(books.map(b => [b.id, b]));
if (flagged.length === 0) fail("No pending repaired Gutenberg titles: review state or QA endpoint changed");
if (flagged.some(r => !catalog.has(r.book_id))) fail("A flagged book is unpublished or absent from public catalog");
const browser = await chromium.launch({ headless: true });
let next = 0;
const results = [];
async function checkOne(page, review) {
  const b = catalog.get(review.book_id);
  const sourceLanguage = b.source_language;
  if (!sourceLanguage || b.status !== "published") fail("No published source language for " + review.book_id);
  const url = base + "/read/" + encodeURIComponent(b.id) + "?lang=" + encodeURIComponent(sourceLanguage) + "&page=1";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const contents = page.locator('button[aria-label="Contents"]').first();
  await contents.waitFor({ state: "visible", timeout: 60000 });
  await contents.click({ timeout: 15000 });
  const front = page.locator(".reader-v3-stage [data-front-page]").first();
  await front.waitFor({ state: "visible", timeout: 20000 });
  const rows = page.locator(".reader-v3-stage .reader-v3-toc-row:visible");
  await rows.first().waitFor({ state: "visible", timeout: 20000 });
  const count = await rows.count();
  if (count < 2) fail("Fewer than two functional contents links");
  const choice = Math.min(count - 1, 2);
  const chapterLabel = (await rows.nth(choice).locator(".reader-v3-toc-title").innerText()).trim();
  if (!chapterLabel) fail("Empty chapter heading in contents");
  await rows.nth(choice).click({ timeout: 15000 });
  await page.locator('.reader-v3-stage [data-book-page]').first().waitFor({ state: "visible", timeout: 25000 });
  const state = await page.evaluate(() => {
    const stage = document.querySelector(".reader-v3-stage");
    const article = stage?.querySelector("[data-book-page]");
    const body = article?.querySelector(".reader-v3-content-viewport");
    const r = article?.getBoundingClientRect();
    return {
      frontStillVisible: Boolean(stage?.querySelector("[data-front-page]")),
      page: Number(article?.getAttribute("data-book-page") ?? 0),
      width: r?.width ?? 0,
      height: r?.height ?? 0,
      textCharacters: body?.textContent?.trim().length ?? 0,
      stageText: stage?.textContent?.trim().slice(0,100) ?? "",
    };
  });
  if (state.frontStillVisible || state.page < 1 || state.width < 50 || state.height < 100 ||
      state.textCharacters < 50) fail("Chapter navigation did not open readable content " + JSON.stringify(state));
  // Opening the same menu from within the chapter must remain functional.
  await contents.click({ timeout: 12000 });
  await front.waitFor({ state: "visible", timeout: 15000 });
  await rows.first().waitFor({ state: "visible", timeout: 15000 });
  return { book_id: b.id, title: b.title, source_language: sourceLanguage,
    chapterLinksTested: 1, tocVisibleCount: count, chosenChapter: chapterLabel,
    reachedBodyPage: state.page, result: "browser-verified",
    caveat: "Chromium; physical iOS/Android and assistive tech acceptance not covered" };
}
async function worker() {
  const context = await browser.newContext({
    viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    while (true) {
      const index = next++;
      if (index >= flagged.length) return;
      const review = flagged[index];
      try {
        const result = await checkOne(page, review);
        results[index] = result;
        console.log("NAV_QA_PASS " + JSON.stringify({title: result.title, book_id: result.book_id, chapter: result.chosenChapter}));
      } catch (error) {
        results[index] = {book_id: review.book_id, title: catalog.get(review.book_id)?.title,
          result: "failed", error: String(error).slice(0,600)};
        console.error("NAV_QA_FAIL " + JSON.stringify(results[index]));
      }
    }
  } finally {
    await context.close();
  }
}
try {
  await Promise.all(Array.from({length: Math.min(concurrency, flagged.length)}, () => worker()));
  const failed = results.filter(x => x.result !== "browser-verified");
  const summary = {checkedAt: new Date().toISOString(), checked: flagged.length,
    passed: flagged.length - failed.length, failed: failed.length,
    caveat: "Automated Chromium functionality test only. No manual device/visual signoff.", results };
  const fs = await import("node:fs/promises");
  await fs.mkdir("audit-out/navigation", {recursive: true});
  await fs.writeFile("audit-out/navigation/acceptance.json", JSON.stringify(summary,null,2) + "\n");
  console.log("SEE_PARAH_NAVIGATION_ACCEPTANCE " + JSON.stringify({
    checked: summary.checked, passed: summary.passed, failed: summary.failed }));
  if (failed.length) process.exitCode = 1;
} catch (error) {
  console.error("SEE_PARAH_NAVIGATION_ACCEPTANCE failed: " + String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
