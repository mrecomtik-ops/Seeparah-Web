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
const DIAGNOSTIC = process.env.QA_DIAGNOSTIC === "1";
const books = fixture.books.filter((_, i) => i % shards === shard).slice(0, DIAGNOSTIC ? 1 : undefined);
const viewports = [
  { name: "desktop", context: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  { name: "touch-mobile", context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];
const normalize = (v) => String(v || "").replace(/\s+/gu, " ").trim();
if (DIAGNOSTIC) console.log("SEEPARAH_DIAGNOSTIC_MODE: one book per shard, first viewport");
const passed = [];
const failed = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const device of (DIAGNOSTIC ? viewports.slice(0, 1) : viewports)) {
    const context = await browser.newContext(device.context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 350)));
    page.on("console", (event) => { if (event.type() === "error") pageErrors.push(event.text().slice(0, 350)); });
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
        // The production BookReaderV3 uses an actual paginated Contents
        // section, not the legacy slide-out "Table of contents" sheet.
        const tocButton = page.getByRole("button", { name: "Contents", exact: true });
        await tocButton.waitFor({ state: "visible", timeout: DIAGNOSTIC ? 12_000 : 35_000 });
        await tocButton.click();
        const rows = page.locator(".reader-v3-toc-row");
        await rows.first().waitFor({ state: "visible", timeout: 15_000 });

        const semantic = book.nodes.filter((entry) =>
          ["part", "book", "chapter", "act"].includes(entry.kind));
        // A few historically unstructured items contain only section labels.
        // These are separate manual source-review obligations; the reader's
        // current single "Reading" fallback still gets a UI smoke check.
        const fallback = !semantic.length;
        const expectedTitles = (fallback ? [book.nodes[0]] : semantic).map((entry) =>
          normalize(entry.title));
        const titles = [];
        const maxTurns = Math.ceil(expectedTitles.length / 14) + 3;
        for (let turn = 0; turn < maxTurns; turn++) {
          const current = (await page.locator(".reader-v3-toc-row .reader-v3-toc-title")
            .allTextContents()).map(normalize);
          if (current.length === 0) break;
          titles.push(...current);
          if (titles.length >= expectedTitles.length) break;
          const before = current[0] ?? "";
          await page.getByRole("button", { name: "Next", exact: true }).click();
          await page.waitForFunction(
            (oldTitle) => {
              const next = document.querySelector(".reader-v3-toc-row .reader-v3-toc-title");
              return !next || (next.textContent || "").trim() !== oldTitle;
            },
            before,
            { timeout: 15_000 },
          );
        }

        if (titles.length !== expectedTitles.length) {
          throw new Error("V3 Contents has " + titles.length +
            " entries, expected " + expectedTitles.length +
            " source-backed semantic chapter/part entries" +
            (fallback ? " (fallback reader)" : ""));
        }
        const mismatches = titles.flatMap((title, i) =>
          title === expectedTitles[i] ? [] : [{ index: i, expected: expectedTitles[i], actual: title }]
        );
        if (mismatches.length) {
          throw new Error("Source/TOC label or order mismatch " + JSON.stringify(mismatches.slice(0, 4)));
        }
        if (titles.some((title) =>
          (/^(?:Partly|Parting|Part of)\s/u.test(title) && title.length > 75) ||
          /^Volume 1 contains /iu.test(title))) {
          throw new Error("Previously repaired false prose division leaked into Contents");
        }

        // The loop stops on the final Contents spread, so the final
        // navigation item can be tested directly without relying on a
        // URL's legacy ?page= format (V3 navigates by client state).
        await rows.last().click();
        await page.waitForFunction(
          () => {
            const heading = document.querySelector(".reader-v3-topbar");
            return heading && !/Front matter|Preparing book/.test(heading.textContent || "");
          }, null, { timeout: 15_000 },
        );
        await page.locator(".reader-v3-stage[aria-busy='false']").first()
          .waitFor({ state: "visible", timeout: 30_000 });
        const textLength = await page.locator(".reader-v3-stage").first()
          .evaluate((element) => (element.textContent || "").trim().length);
        if (textLength < 25) throw new Error("Last semantic entry did not load reader text");
        if (DIAGNOSTIC) console.log("SEEPARAH_DIAGNOSTIC_PASS " +
          JSON.stringify({ ...ref, titles: titles.length, fallback, textLength }));
        const success = { ...ref, status: "passed", checkedTitles: titles.length, fallback, textLength };
        passed.push(success);
        console.log("SEEPARAH_STRUCTURE_QA " + JSON.stringify(success));
      } catch (error) {
        let pageState = null;
        try {
          pageState = await page.evaluate(() => ({
            url: location.href, title: document.title, readyState: document.readyState,
            path: location.pathname,
            body: document.body?.innerText?.slice(0, 950) || "",
            buttons: Array.from(document.querySelectorAll("button")).slice(0, 16)
              .map((el) => ({ label: el.getAttribute("aria-label"), text: el.textContent?.slice(0, 50) })),
            scripts: document.scripts.length,
          }));
        } catch (captureError) { pageState = { captureError: String(captureError) }; }
        if (DIAGNOSTIC) console.error("SEEPARAH_DIAGNOSTIC " + JSON.stringify({ ...ref, pageState, pageErrors: pageErrors.slice(-8) }));
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
  passed: passed.length, failed: failed.length, failures: failed, diagnostic: DIAGNOSTIC,
  caveat: "Headless browser emulation, not physical mobile/assistive technology acceptance"
}));
if (passed.length + failed.length !== books.length * (DIAGNOSTIC ? 1 : viewports.length) || failed.length) process.exitCode = 1;
