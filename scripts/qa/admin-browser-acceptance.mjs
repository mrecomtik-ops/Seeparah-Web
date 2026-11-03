import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, webkit } from "playwright";

const origin = "http://127.0.0.1:4179";
const child = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--config", "scripts/qa/browser-fixtures/vite.config.mjs",
  "--host", "127.0.0.1", "--port", "4179",
], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", chunk => { serverLog += chunk; });
}
async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Fixture server exited: " + serverLog);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error("Fixture server did not start: " + serverLog);
}
async function assertCount(locator, expected) {
  // React 19 commits event-driven changes asynchronously. A bare count()
  // immediately after the click may inspect the DOM before React commits.
  for (let i = 0; i < 70; i++) {
    if ((await locator.count()) === expected) return;
    await sleep(50);
  }
  assert.equal(await locator.count(), expected);
}
async function runEngine(engine, browserType) {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", err => pageErrors.push(err.stack || String(err)));
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Isolated browser component QA/ }).waitFor();

    // SP-04: real browser event, focus and exact-title safeguards on
    // the production-shipped components; no actual server deletion.
    await page.getByTestId("role-support").click();
    await assertCount(page.getByRole("button", { name: "Delete permanently" }), 0);
    await assertCount(page.getByRole("button", { name: "Edit" }), 0);
    await page.getByTestId("role-editor").click();
    await assertCount(page.getByRole("button", { name: "Delete permanently" }), 0);
    await assertCount(page.getByRole("button", { name: "Edit" }), 1);
    await page.getByTestId("role-owner").click();
    await page.getByTestId("status-published").click();
    await assertCount(page.getByRole("button", { name: "Delete permanently" }), 0);
    await page.getByTestId("status-archived").click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    const permanentDialog = page.getByRole("dialog", { name: /Permanently delete/ });
    await permanentDialog.waitFor();
    const dangerousAction = permanentDialog.getByRole("button", { name: "Permanently delete" });
    assert.equal(await dangerousAction.isDisabled(), true);
    await permanentDialog.getByRole("textbox").fill("wrong title");
    assert.equal(await dangerousAction.isDisabled(), true);
    await permanentDialog.getByRole("textbox").fill("QA Fixture Book (not a real book)");
    assert.equal(await dangerousAction.isDisabled(), false);
    await dangerousAction.click();
    assert.equal((await page.evaluate(() => window.__qa.snapshot())).events.includes("would-delete:owner"), true);
    await page.getByTestId("role-administrator").click();
    await assertCount(page.getByRole("button", { name: "Delete permanently" }), 1);

    // SP-14: real canvas/image decoding, optional 2:3 crop,
    // stage is separate from explicit same-edition assign, with
    // exact language/source ID and attribution locked in the fixture.
    await page.getByTestId("role-editor").click();
    await page.getByRole("button", { name: "Edit" }).click();
    const metadataDialog = page.getByRole("dialog", { name: "Edit metadata" });
    await metadataDialog.waitFor();
    await metadataDialog.getByLabel("Target verified source edition").selectOption("Urdu");
    const imageBase64 = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 1200; c.height = 600;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f5e6c4"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#19324c"; ctx.fillRect(120, 80, 960, 440);
      return c.toDataURL("image/png").split(",")[1];
    });
    await metadataDialog.getByLabel("Upload cover for this source edition").setInputFiles({
      name: "synthetic-edition-qa-cover.png",
      mimeType: "image/png",
      buffer: Buffer.from(imageBase64, "base64"),
    });
    await metadataDialog.getByRole("checkbox", { name: /Crop to 2:3 portrait/ }).check();
    await metadataDialog.getByRole("button", { name: "Stage reviewed cover" }).click();
    await page.waitForFunction(() => window.__qa.snapshot().events.includes("stage:Urdu:900x1350"), null, { timeout: 15000 });
    assert.equal((await page.evaluate(() => window.__qa.snapshot())).events.some(x => x.startsWith("assign:")), false);
    await metadataDialog.getByLabel("Target verified source edition").selectOption("English");
    await assertCount(metadataDialog.getByRole("button", { name: "Assign to this verified edition" }), 0);
    await metadataDialog.getByLabel("Target verified source edition").selectOption("Urdu");
    await metadataDialog.getByLabel("Upload cover for this source edition").setInputFiles({
      name: "synthetic-edition-qa-cover.png",
      mimeType: "image/png",
      buffer: Buffer.from(imageBase64, "base64"),
    });
    await metadataDialog.getByRole("button", { name: "Stage reviewed cover" }).click();
    await metadataDialog.getByRole("button", { name: "Assign to this verified edition" }).waitFor();
    await metadataDialog.getByRole("button", { name: "Assign to this verified edition" }).click();
    assert.equal(
      (await page.evaluate(() => window.__qa.snapshot())).events.includes("assign:Urdu:Verified QA fixture artwork"),
      true,
    );
    await metadataDialog.getByRole("button", { name: "Cancel" }).click();

    // SP-33: production shelf logic running in Chromium/WebKit,
    // with a synthetic Supabase transport so no real users are modified.
    await page.getByRole("button", { name: "Save book" }).waitFor();
    await page.getByRole("button", { name: "Save book" }).click();
    await page.getByRole("button", { name: "Remove saved book" }).waitFor();
    assert.equal((await page.evaluate(() => window.__qa.snapshot())).server.length, 1);
    await page.evaluate(() => window.__qa.network(false));
    await page.getByRole("button", { name: "Remove saved book" }).waitFor();
    await page.evaluate(() => window.__qa.switchUser("reader-beta"));
    await page.getByRole("button", { name: "Save book" }).waitFor();
    assert.equal((await page.evaluate(() => window.__qa.snapshot())).cached.some(x => x.user_id === "reader-beta"), false);
    await page.evaluate(() => window.__qa.network(true));
    await page.getByRole("button", { name: "Save book" }).waitFor();
    await page.evaluate(() => window.__qa.switchUser("reader-alpha"));
    await page.getByRole("button", { name: "Remove saved book" }).waitFor();
    await page.getByRole("button", { name: "Remove saved book" }).click();
    await page.getByRole("button", { name: "Save book" }).waitFor();
    await page.evaluate(() => window.__qa.network(false));
    await page.getByRole("button", { name: "Save book" }).waitFor();
    const state = await page.evaluate(() => window.__qa.snapshot());
    assert.equal(state.server.filter(x => x.user_id === "reader-alpha").length, 0);
    assert.equal(state.cached.filter(x => x.user_id === "reader-alpha").length, 0);
    await page.evaluate(() => window.__qa.network(true));
    await page.getByRole("button", { name: "Save book" }).waitFor();

    assert.deepEqual(pageErrors, [], engine + " runtime errors");
    const result = {
      engine,
      roleModalAndExactTitle: "passed",
      optionalCrop: "1200x600 PNG to 900x1350 JPEG",
      exactEditionStaging: "Urdu only, explicit assign",
      shelves: "online-offline-identity-switch-remove-offline-reconnect",
      productionAuth: "not used (synthetic)",
      productionMutations: 0,
      viewport: await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio })),
    };
    await context.close();
    return result;
  } finally {
    await browser.close();
  }
}
try {
  await waitForServer();
  const results = [];
  for (const [engine, type] of [["Chromium", chromium], ["WebKit", webkit]]) {
    results.push(await runEngine(engine, type));
  }
  console.log("SEE_PARAH_ISOLATED_BROWSER_QA " + JSON.stringify({ status: "passed", results }));
} catch (error) {
  console.error("SEE_PARAH_ISOLATED_BROWSER_QA " + JSON.stringify({
    status: "failed", error: error?.stack || String(error), serverLog: serverLog.slice(-2500),
  }));
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
}
