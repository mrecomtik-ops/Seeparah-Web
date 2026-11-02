/** Read-only public reader acceptance at a *genuine* Chromium tab zoom level.
 * A temporary isolated MV3 extension calls chrome.tabs.setZoom(2), then
 * chrome.tabs.getZoom() proves that Chrome's own tab zoom is exactly 200%.
 * This is NOT CSS zoom, DPR emulation, physical Safari, or assistive tech QA.
 * No account sign-in and no write to production data.
 */
import { chromium } from "playwright";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.SEEPARAH_QA_URL ?? "https://seeparah.com";
const bookId = "8c20a875-ed09-4be7-bda0-acccc1a3000a";
const root = await mkdtemp(join(tmpdir(), "seeparah-native-zoom-"));
const extension = join(root, "qa-extension");
const profile = join(root, "browser-profile");
let context;
const details = {};
try {
  await mkdir(extension);
  await writeFile(join(extension, "manifest.json"), JSON.stringify({
    manifest_version: 3, name: "Seeparah QA Native Tab Zoom",
    version: "1.0.0", permissions: ["tabs"],
    host_permissions: ["https://seeparah.com/*"],
    background: { service_worker: "background.js" },
  }));
  await writeFile(join(extension, "background.js"), 'chrome.runtime.onInstalled.addListener(() => {});');
  // A real headed Chromium is required to exercise the browser-level zoom
  // machinery; CI runs this process under Xvfb, never a fake CSS zoom.
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 780, height: 960 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-first-run",
    ],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 25000 });
  const page = await context.newPage();
  await page.goto(`${BASE}/read/${bookId}?lang=English&page=1`, {
    waitUntil: "domcontentloaded", timeout: 60000,
  });
  await page.locator('[aria-label="Reader settings"]').first().waitFor({ timeout: 60000 });
  await page.locator(".reader-v3-stage").first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(750);
  details.before = await page.evaluate(() => ({
    cssViewport: innerWidth, dpr: devicePixelRatio,
  }));

  const nativeZoom = await worker.evaluate(async (matchUrl) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((entry) => entry.id && entry.url?.startsWith(matchUrl));
    if (!tab?.id) throw new Error("QA tab not found by extension");
    await chrome.tabs.setZoom(tab.id, 2);
    return { requested: 2, reported: await chrome.tabs.getZoom(tab.id) };
  }, `${BASE}/read/${bookId}`);
  details.nativeZoom = nativeZoom;
  if (Math.abs(nativeZoom.reported - 2) > 0.01) {
    throw new Error("Native Chrome tab zoom is not 200%");
  }

  await page.waitForTimeout(1800);
  details.after = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    return {
      cssViewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      dpr: devicePixelRatio,
      stage: rect(".reader-v3-stage"),
      settings: rect('[aria-label="Reader settings"]'),
      back: rect('[aria-label="Back to library"]'),
      textLength: document.querySelector(".reader-v3-stage")?.textContent?.trim().length ?? 0,
    };
  });
  if (!(details.after.cssViewport < details.before.cssViewport * 0.65)) {
    throw new Error("Native zoom did not reduce layout viewport as expected");
  }
  if (details.after.scrollWidth > details.after.cssViewport + 1) {
    throw new Error("Reader has horizontal overflow at native 200% zoom");
  }
  if (!details.after.stage || details.after.stage.height < 100 || details.after.textLength < 20) {
    throw new Error("Visible reader page lost text at native 200% zoom");
  }
  for (const key of ["settings", "back"]) {
    const box = details.after[key];
    if (!box || box.width < 44 || box.height < 44) {
      throw new Error(`${key} tap target below 44 CSS px at native 200% zoom`);
    }
  }
  await page.locator('[aria-label="Reader settings"]').first().click();
  details.settingsOperable = await page.getByText("Line spacing").count() > 0;
  if (!details.settingsOperable) throw new Error("Settings did not open at native 200% zoom");
  console.log("SEE_PARAH_NATIVE_CHROME_ZOOM_QA " + JSON.stringify({
    status: "passed", details,
    caveat: "Chromium on Xvfb; not iOS Safari / physical Android / VoiceOver or TalkBack",
  }));
} catch (error) {
  console.error("SEE_PARAH_NATIVE_CHROME_ZOOM_QA " + JSON.stringify({
    status: "failed", details, error: String(error),
  }));
  process.exitCode = 1;
} finally {
  if (context) await context.close();
  await rm(root, { recursive: true, force: true });
}
