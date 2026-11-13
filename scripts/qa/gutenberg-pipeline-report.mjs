#!/usr/bin/env node
/* Secretless, read-only published Gutenberg catalogue QA. */
import { fetchScalablePublicQaSnapshot } from "./production-catalog-audit.mjs";
const data = await fetchScalablePublicQaSnapshot(
  "https://seeparah.com/api/catalog-qa-public.json",
);
if (data.version !== 1 || data.scope !== "published-catalogue-only" ||
    !Array.isArray(data.books) || !Array.isArray(data.reviews) ||
    !Array.isArray(data.oldYears) || !data.importer) {
  throw new Error("Untrusted public QA response");
}
const count = (status) => data.reviews.filter((r) => r.status === status).length;
const covers = data.books.filter((b) =>
  /\/cover-medium\.jpg(?:\?|$)/iu.test(String(b.cover_url || ""))).length;
const missing = data.books.filter((b) => !b.cover_url).length;
const suspect = data.books.filter((b) =>
  /^gutenberg:/u.test(String(b.source_scan_id || "")) &&
  [1656, 1800].includes(Number(b.original_publication_year))).length;
const summary = {
  generatedAt: new Date().toISOString(),
  publishedBooks: data.books.length,
  unknownHistoricalYearBackups: data.oldYears.length,
  openSourceReviews: count("requires_manual_source_review"),
  visualAcceptanceReviews: count("navigation_repaired_pending_visual_qa"),
  lowResolutionGutenbergCovers: covers,
  missingCoverUrls: missing,
  suspectHistoricYearRegressions: suspect,
  publicationImporterEnabled: data.importer.enabled,
  publicationTarget: data.importer.target_published,
  discovery: data.discovery || { status: "not deployed yet" },
  importQueue: data.queue || {},
  auditedPublication: data.auditedPublication || {},
  policy: "No complete claim without source SHA256, exact reader read-back, rights and visual acceptance",
};
console.log(JSON.stringify(summary, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  const rows = [
    ["Published", summary.publishedBooks],
    ["Unverified first-print-year queue", summary.unknownHistoricalYearBackups],
    ["Source/chapter review", summary.openSourceReviews],
    ["Reader/device acceptance", summary.visualAcceptanceReviews],
    ["Low-res cover candidates", summary.lowResolutionGutenbergCovers],
    ["No cover URL", summary.missingCoverUrls],
    ["Suspect 1800/1656 years", summary.suspectHistoricYearRegressions],
    ["Publication importer enabled", summary.publicationImporterEnabled],
    ["Discovery", JSON.stringify(summary.discovery)],
    ["Import queue (review/fail/queued)", JSON.stringify(summary.importQueue)],
    ["New v4 publications with missing gate proof", summary.auditedPublication.missingIntegrityEvidence ?? 0],
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    "## Seeparah Gutenberg safety checks\n\n| Check | Result |\n|---|---|\n" +
    rows.map((r) => "| " + r[0] + " | " + r[1] + " |").join("\n") +
    "\n\nReview queues remain open until source and rights evidence is accepted.\n");
}
if (!data.books.length || suspect > 0) {
  throw new Error("Unsafe published bibliography state detected");
}
if ((summary.auditedPublication.missingIntegrityEvidence ?? 0) > 0) {
  throw new Error("New v4 Gutenberg books were published without required integrity proof");
}
if (summary.publicationImporterEnabled &&
    (summary.openSourceReviews || summary.visualAcceptanceReviews ||
     summary.unknownHistoricalYearBackups)) {
  console.warn("Legacy review queues still open; new Gutenberg publications must pass independent per-book gates");
}
