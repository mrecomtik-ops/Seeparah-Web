/**
 * Public-production reader navigation regression for the 44 repaired books.
 * The fixture contains original-book/edition source-backed navigation labels.
 * These are read-only UI checks in headless Chromium and mobile emulation;
 * physical iOS/Android, TalkBack, VoiceOver and source-byte acceptance remain separate.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = (process.env.SEEPARAH_QA_URL || "https://seeparah.com").replace(/\/+$/, "");
const shard = Number(process.env.QA_SHARD_INDEX || "0");
const shards = Number(process.env.QA_SHARD_COUNT || "4");
const fixture = JSON.parse(readFileSync(new URL("./fixtures/false-part-reader-44.json", import.meta.url), "utf8"));
if (!Array.isArray(fixture.books) || fixture.books.length !== 44 ||
    !Number.isInteger(shard) || !Number.isInteger(shards) || shards < 1 ||
    shard < 0 || shard >= shards) {
  throw new Error("Invalid structure QA fixture or shard parameters");
}
const books = fixture.books.filter((_, i) => i % shards === shard);
const viewports = [
  { name: "desktop", context: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  { name: "touch-mobile", context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];
const normalize = (v) => String(v || "").replace(/\s+/gu, " ").trim();
const passed = [];
const failed = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const device of viewports) {
    const context = await browser.newContext(device.context);
    const page = await context.newPage();
    page.setDefaultTimeout(25_000);
    for (const book of books) {
      const ref = { id: book.id, title: book.title, device: device.name, expectedNodes: book.nodes.length };
      try {
        const first = book.nodes.find((n) => n.kind === "chapter") ||
          book.nodes.find((n) => n.kind !== "front_matter") || book.nodes[0];
        const url = BASE + "/read/" + book.id + "?lang=" +
          encodeURIComponent(book.language) + "&page=" + (first.chunk + 1);
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        if (!response || !response.ok()) throw new Error("Reader HTTP " + (response?.status() || "unknown"));
        const tocButton = page.getByRole("button", { name: "Table of contents", exact: true });
        await tocButton.waitFor({ state: "visible", timeout: 40_000 });
        await tocButton.click();
        const sheet = page.locator("div.fixed.inset-0").filter({
          has: page.getByRole("heading", { name: "Table of contents", exact: true })
        }).first();
        await sheet.getByRole("heading", { name: "Table of contents", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        const buttons = sheet.locator("div.space-y-1 > button");
        await buttons.first().waitFor({ timeout: 15_000 });
        const actual = (await buttons.locator(":scope > span:first-child").allTextContents()).map(normalize);
        const expected = book.nodes.map((n) => normalize(n.title));
        if (actual.length !== expected.length) {
          throw new Error("TOC count " + actual.length + " != backed-up count " + expected.length);
        }
        const mismatch = actual.flatMap((title, i) =>
          title === expected[i] ? [] : [{ ordinal: i, expected: expected[i], observed: title }]
        );
        if (mismatch.length) throw new Error("Unexpected TOC titles/order " + JSON.stringify(mismatch.slice(0, 3)));
        if (actual.some((title) => /^(?:Partly|Parting|Part of)\s/u.test(title) && title.length > 75) ||
            actual.some((title) => /^Volume 1 contains /iu.test(title))) {
          throw new Error("Narrative prose incorrectly appears as a volume heading");
        }
        const chapters = book.nodes.flatMap((n, i) => n.kind === "chapter" ? [{ ...n, offset: i }] : []);
        const last = chapters.at(-1) || { ...book.nodes.at(-1), offset: book.nodes.length - 1 };
        await buttons.nth(last.offset).click();
        await page.waitForURL((u) => u.searchParams.get("page") === String(last.chunk + 1),
          { timeout: 25_000 });
        await page.locator(".reader-v3-stage").first().waitFor({ state: "visible", timeout: 25_000 });
        const textLength = await page.locator(".reader-v3-stage").first()
          .evaluate((el) => (el.textContent || "").trim().length);
        if (textLength < 25) throw new Error("Reader final chapter was visibly empty");
        const success = { ...ref, status: "passed", lastPage: last.chunk + 1 };
        passed.push(success);
        console.log("SEEPARAH_STRUCTURE_QA " + JSON.stringify(success));
      } catch (error) {
        const failure = { ...ref, status: "failed", error: String(error) };
        failed.push(failure);
        console.error("SEEPARAH_STRUCTURE_QA " + JSON.stringify(failure));
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("SEEPARAH_STRUCTURE_SUMMARY " + JSON.stringify({
  shard, shards, books: books.length, attempted: passed.length + failed.length,
  passed: passed.length, failed: failed.length, failures: failed,
  caveat: "Headless browser emulation, not physical mobile/assistive technology acceptance"
}));
if (passed.length + failed.length !== books.length * viewports.length || failed.length) process.exitCode = 1;
