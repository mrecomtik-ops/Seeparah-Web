/**
 * SP-01 public-production Study-mode accessibility regression.
 *
 * Tests original source editions and their English interface controls at
 * touch-sized Chromium viewports. No credentials, source edits, or writes.
 * Playwright Chromium is NOT physical iOS VoiceOver/Android TalkBack acceptance.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SEEPARAH_QA_URL || "https://seeparah.com";
const editions = [
  { name: "Quran Arabic", id: "f7e3a9f0-931a-5207-9859-a27210cc2ca8", query: "Arabic", lang: "ar" },
  { name: "Quran Urdu", id: "f7e3a9f0-931a-5207-9859-a27210cc2ca8", query: "Urdu", lang: "ur" },
  { name: "Genesis Hebrew", id: "87205571-41a9-540a-abd2-3784a4079fad", query: "Hebrew", lang: "he" },
  { name: "Matthew Greek", id: "7bc812fd-6a4d-544e-903f-b2e333a5cc4f", query: "Greek", lang: "el" },
];
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [320, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    const page = await context.newPage();
    try {
      for (const edition of editions) {
        const url = `${base}/read/${edition.id}?lang=${edition.query}&page=1`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        const source = page.locator(`[lang="${edition.lang}"]`).first();
        await source.waitFor({ timeout: 55000 });
        const originalLength = await source.evaluate(el => (el.textContent || "").trim().length);
        assert.ok(originalLength > 6, `${edition.name}: original-language content missing`);
        await page.getByText("Study", { exact: true }).first().click({ timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);
        const details = await source.evaluate(el => {
          const buttons = [...el.querySelectorAll('button,[role="button"]')];
          return {
            viewport: innerWidth,
            pageWidth: document.documentElement.scrollWidth,
            direction: getComputedStyle(el).direction,
            controls: buttons.map(button => {
              const box = button.getBoundingClientRect();
              return {
                name: button.getAttribute("aria-label") || button.textContent?.trim() || "",
                language: button.closest("[lang]")?.getAttribute("lang") || "",
                width: box.width, height: box.height,
              };
            }),
          };
        });
        assert.ok(details.pageWidth <= details.viewport + 1,
          `${edition.name} at ${width}px: horizontal overflow`);
        assert.ok(details.controls.length >= 4,
          `${edition.name}: Study mode source controls not rendered`);
        assert.ok(details.controls.some(c => /Go to reference/.test(c.name)),
          `${edition.name}: accessible verse reference control missing`);
        for (const control of details.controls) {
          assert.equal(control.language, "en",
            `${edition.name}: English control inherits source language: ${control.name}`);
          assert.ok(control.width >= 23.5 && control.height >= 23.5,
            `${edition.name}: undersized Study control ${control.name}: ${control.width}×${control.height}`);
        }
        if (["ar", "ur", "he"].includes(edition.lang)) {
          assert.equal(details.direction, "rtl", `${edition.name}: source direction`);
        }
        const result = {
          width, edition: edition.name, sourceLang: edition.lang,
          sourceCharacters: originalLength, controls: details.controls.length,
          minimumWidth: Math.round(Math.min(...details.controls.map(c => c.width))),
          minimumHeight: Math.round(Math.min(...details.controls.map(c => c.height))),
          englishControls: details.controls.every(c => c.language === "en"),
          overflow: false,
        };
        results.push(result);
        console.log("SP01_MOBILE_STUDY " + JSON.stringify(result));
      }
    } finally {
      await context.close();
    }
  }
  console.log("SP01_MOBILE_STUDY_SUMMARY " + JSON.stringify({
    status: "passed", cases: results.length,
    limitation: "Device emulation; hardware screen-reader speech still requires physical-device acceptance",
  }));
} catch (error) {
  console.error("SP01_MOBILE_STUDY_SUMMARY " + JSON.stringify({
    status: "failed", completed: results.length, error: error.stack || String(error),
  }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
