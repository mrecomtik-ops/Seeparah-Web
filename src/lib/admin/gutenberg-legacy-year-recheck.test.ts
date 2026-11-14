import { describe, expect, it } from "vitest";
import { canRecheckLegacyHistoricalYearJob, legacyDateRecoveryDue, canRetryInterruptedGutenbergJob } from "./gutenberg-autopilot.server";

const original = {
  attempts: 1,
  book_id: null,
  original_publication_year: null,
  last_error: "Independent historical first publication year unavailable",
  metadata: {
    autopilot: true,
    metadataSource: "Project Gutenberg official weekly CSV",
    catalogUrl: "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv",
    batchId: "PG-AUTO-0001",
    title: "Paul Prescott's Charge",
    author: "Alger, Horatio, Jr.",
    authorDeathYear: 1899,
  },
};

describe("Legacy Gutenberg publication-year backlog recovery", () => {
  it("only retries an unimported official-source historical-year failure once under the new safety gates", () => {
    expect(canRecheckLegacyHistoricalYearJob(original)).toBe(true);
  });
  it("never relabels a published or already imported book as a retry", () => {
    expect(canRecheckLegacyHistoricalYearJob({...original,book_id:"some-book-id"})).toBe(false);
    expect(canRecheckLegacyHistoricalYearJob({...original,attempts:2})).toBe(false);
    expect(canRecheckLegacyHistoricalYearJob({...original,original_publication_year:1850})).toBe(false);
  });
  it("rejects altered sources, missing authors and any prior recovery attempt", () => {
    expect(canRecheckLegacyHistoricalYearJob({...original,last_error:"Copyright requires review"})).toBe(false);
    expect(canRecheckLegacyHistoricalYearJob({...original,metadata:{...original.metadata,metadataSource:"untrusted"}})).toBe(false);
    expect(canRecheckLegacyHistoricalYearJob({...original,metadata:{...original.metadata,catalogUrl:"https://example.net"}})).toBe(false);
    expect(canRecheckLegacyHistoricalYearJob({...original,metadata:{...original.metadata,authorDeathYear:null}})).toBe(false);
    expect(canRecheckLegacyHistoricalYearJob({...original,metadata:{...original.metadata,legacyYearRecheckVersion:"gutenberg-v4-safe-metadata-review"}})).toBe(false);
  });
  it("schedules one paced recovery even when the ordinary ten-book queue is full", () => {
    expect(legacyDateRecoveryDue(0, 10)).toBe(true);
    expect(legacyDateRecoveryDue(5, 9)).toBe(true);
    expect(legacyDateRecoveryDue(10, 11)).toBe(false);
    expect(legacyDateRecoveryDue(12, 1)).toBe(true);
    expect(legacyDateRecoveryDue(20, -1)).toBe(false);
    expect(legacyDateRecoveryDue(61, 0)).toBe(false);
  });
  it("does not fabricate an original year or claim publication rights", () => {
    const candidate = structuredClone(original);
    expect(canRecheckLegacyHistoricalYearJob(candidate)).toBe(true);
    expect(candidate.original_publication_year).toBeNull();
    expect("copyright" in candidate.metadata).toBe(false);
  });
});


describe("Interrupted Gutenberg imports", () => {
  const safe = {
    status: "failed", gutenberg_id: 7749, attempts: 2, book_id: null,
    last_error: "Import interrupted after 30 minutes; no automatic partial-write retry",
    metadata: { autopilot: true, batchId: "PG-AUTO-0005" },
  };
  it("retries an unlinked interrupted source only within the bounded attempt limit", () => {
    expect(canRetryInterruptedGutenbergJob(safe)).toBe(true);
    expect(canRetryInterruptedGutenbergJob({ ...safe, attempts: 3 })).toBe(false);
    expect(canRetryInterruptedGutenbergJob({ ...safe, attempts: 0 })).toBe(false);
  });
  it("never requeues a linked partial book or a rights/review failure", () => {
    expect(canRetryInterruptedGutenbergJob({ ...safe, book_id: "partial-edition" })).toBe(false);
    expect(canRetryInterruptedGutenbergJob({ ...safe, status: "in_review" })).toBe(false);
    expect(canRetryInterruptedGutenbergJob({ ...safe, metadata: { autopilot: false } })).toBe(false);
    expect(canRetryInterruptedGutenbergJob({ ...safe, last_error: "Copyright needs review" })).toBe(false);
    expect(canRetryInterruptedGutenbergJob({ ...safe, gutenberg_id: -1 })).toBe(false);
  });
});
