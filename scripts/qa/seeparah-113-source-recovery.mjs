#!/usr/bin/env node
/**
 * Recovery ONLY of exact original 113-cover-batch Gutenberg source identities.
 * Read-only toward Supabase: no database connection, approval or publication.
 * Fetch from Gutenberg's mirror infrastructure, not human-facing catalog pages.
 * Preserve original source bytes and its Gutenberg licence intact.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const MANIFEST = "data/seeparah-113-pending-source-manifest.json";
const OUT = resolve(process.env.RECOVERY_OUT || "source-recovery-out");
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ATTEMPT_MS = 22_000;
const MIRRORS = [
  (id) => "https://gutenberg.pglaf.org/cache/epub/" + id + "/pg" + id + ".txt",
  (id) => "https://mirror.cs.odu.edu/gutenberg-epub/" + id + "/pg" + id + ".txt",
];
const VALID_ACTIONS = new Set(["acquire", "edition_hold", "rights_hold", "already_published_work"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function validateManifest(data) {
  if (!Array.isArray(data?.entries) || data.entries.length !== 46)
    throw new Error("Expected exactly 46 ledger-matched missing candidate records");
  const seen = new Set();
  const counts = Object.create(null);
  for (const x of data.entries) {
    if (!/^SP-CAND-\d{4}$/.test(x.candidateId) || seen.has(x.candidateId))
      throw new Error("Malformed or duplicate candidate ID");
    seen.add(x.candidateId);
    if (!VALID_ACTIONS.has(x.action))
      throw new Error("Unreviewed disposition " + x.candidateId);
    if (!["en","fr","de","es","it"].includes(x.language))
      throw new Error("Unrecognized original language for " + x.candidateId);
    if (x.action === "acquire" &&
      (!Number.isSafeInteger(x.gutenbergId) || x.gutenbergId <= 0))
      throw new Error("Missing exact Gutenberg identity for " + x.candidateId);
    if (x.gutenbergId !== null &&
      (!Number.isSafeInteger(x.gutenbergId) || x.gutenbergId <= 0))
      throw new Error("Invalid Gutenberg identity for " + x.candidateId);
    counts[x.action] = (counts[x.action] || 0) + 1;
  }
  if (counts.acquire !== 32 || counts.edition_hold !== 5 ||
      counts.rights_hold !== 4 || counts.already_published_work !== 5)
    throw new Error("Unexpected 113-candidate reconciliation; require independent review");
  return counts;
}

function assessSource(bytes) {
  if (bytes.length < 4_000)
    throw new Error("Short or empty source; not a complete verified original");
  let decoded;
  try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Source is not valid UTF-8"); }
  const begin = /^\s*\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\r\n]*\*{3}/im.exec(decoded);
  if (!begin) throw new Error("Gutenberg START marker absent");
  const tail = decoded.slice(begin.index + begin[0].length);
  const end = /^\s*\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\r\n]*\*{3}/im.exec(tail);
  if (!end) throw new Error("Gutenberg END marker absent");
  const body = tail.slice(0, end.index);
  if (body.trim().length < 1500)
    throw new Error("Source body too short; manual review required");
  return { sha256: sha256(bytes), byteCount: bytes.length,
    bodySha256: sha256(Buffer.from(body, "utf8")),
    bodyCharacters: body.length, bodyWords: (body.match(/\S+/g) || []).length };
}

async function download(url) {
  const response = await fetch(url, {
    headers: { Accept: "text/plain,*/*;q=0.1", "User-Agent": "Seeparah-Source-Recovery/1.0 (+https://seeparah.com)" },
    signal: AbortSignal.timeout(MAX_ATTEMPT_MS),
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  if (Number(response.headers.get("content-length") || "0") > MAX_BYTES)
    throw new Error("Over 16 MiB bound");
  if (!response.body) throw new Error("No response body");
  const parts = [];
  let length = 0;
  for await (const part of response.body) {
    length += part.byteLength;
    if (length > MAX_BYTES) throw new Error("Over 16 MiB bound");
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts, length);
}

async function recover(item) {
  const failures = [];
  for (const makeUrl of MIRRORS) {
    const url = makeUrl(item.gutenbergId);
    try {
      const bytes = await download(url);
      const source = assessSource(bytes);
      const directory = join(OUT, "sources", item.candidateId);
      await mkdir(directory, { recursive: true });
      const file = join(directory, "pg" + item.gutenbergId + ".txt");
      await writeFile(file, bytes, { flag: "wx" });
      return { candidateId: item.candidateId, gutenbergId: item.gutenbergId,
        title: item.title, language: item.language, status: "source_recovered_for_review",
        mirror: new URL(url).hostname, sourceFile: file.slice(OUT.length + 1),
        ...source, verifiedPublication: false };
    } catch (error) {
      failures.push(new URL(url).hostname + ": " +
        String(error instanceof Error ? error.message : error).slice(0, 180));
    }
  }
  return { candidateId: item.candidateId, gutenbergId: item.gutenbergId,
    title: item.title, status: "source_download_failed", problems: failures,
    verifiedPublication: false };
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const counts = validateManifest(manifest);
if (process.argv.includes("--check")) {
  console.log("Manifest validated: " + JSON.stringify(counts));
  process.exit(0);
}
if (!process.argv.includes("--recover"))
  throw new Error("Use --check for validation or --recover to fetch source files");
await mkdir(OUT, { recursive: true });
const results = [];
for (const item of manifest.entries) {
  if (item.action !== "acquire") {
    results.push({ candidateId: item.candidateId, title: item.title,
      gutenbergId: item.gutenbergId, status: item.action, reason: item.notes,
      verifiedPublication: false });
    continue;
  }
  const result = await recover(item);
  results.push(result);
  console.log(item.candidateId + " " + result.status + " Gutenberg #" + item.gutenbergId);
  await delay(750);
}
const statusCounts = Object.create(null);
for (const row of results)
  statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
const report = {
  batch: manifest.batch,
  generatedAt: new Date().toISOString(),
  purpose: "recovery evidence only; no Supabase modifications or publication",
  counts: statusCounts, results,
};
await writeFile(join(OUT, "recovery.json"), JSON.stringify(report, null, 2) + "\n");
const summary = [
  "## Seeparah original 113-book source recovery",
  "",
  "| Disposition | Count |",
  "| --- | ---: |",
  ...Object.entries(statusCounts).map(([k,v]) => "| " + k + " | " + v + " |"),
  "",
  "All recovered Gutenberg files are unmodified source originals, with individual SHA-256 evidence.",
  "Recovered is NOT published: original-language text parity, complete reader structure, rights, source edition, and cover review are still mandatory.",
  "Existing published titles are never reimported; ambiguous and rights-held titles are not downloaded.",
].join("\n") + "\n";
await writeFile(join(OUT, "summary.md"), summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(JSON.stringify({ output: OUT, counts: statusCounts }, null, 2));
if (!(statusCounts.source_recovered_for_review > 0))
  process.exitCode = 1;
