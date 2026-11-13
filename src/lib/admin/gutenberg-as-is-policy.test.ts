import { describe, expect, it } from "vitest";
import {
  computePublishGate, eligibleGutenbergAsIsMissingYear,
} from "./catalog.server";
import { extractGutenbergBody } from "./gutenberg-fast-import.server";

const sha = "a".repeat(64);
const originalTextNote = " Original print-publication year has not been independently corroborated.";
const book = {
  rights_status: "approved",
  edition_review_status: "approved",
  structure_review_status: "approved",
  cleanup_review_status: "approved",
  source_language: "English",
  content_classification: "general",
  edition_title: "The Original Book — Seeparah Source Edition",
  edition_year: 2026,
  publisher: "Seeparah",
  source_scan_id: "gutenberg:43019",
  source_file_sha256: sha,
  source_file_path: "gutenberg-sources/gutenberg/43019/pg43019-" + sha.slice(0,12) + ".txt",
  original_publication_year: null,
  word_count: 2021,
  estimated_reading_minutes: 10,
  rights_basis: "The original historical author died before 1901 and this exact ebook's US rights were checked.",
  rights_evidence_url: "https://www.gutenberg.org/ebooks/43019",
  description: "Historical source text preserved exactly in its original reading order." + originalTextNote,
  rights_risk_acknowledged_at: null,
};

describe("Gutenberg as-is publication metadata exceptions", () => {
  it("allows a disclosed missing print year only for an exact archived Gutenberg source", () => {
    expect(eligibleGutenbergAsIsMissingYear(book)).toBe(true);
    expect(computePublishGate(book,new Set(),false,true).canPublish).toBe(true);
  });
  it("rejects fake Gutenberg scan IDs, wrong hashes and missing date disclosures", () => {
    const alternatives = [
      {...book,source_scan_id:"gutenberg:9999"},
      {...book,source_file_sha256:"bad"},
      {...book,source_file_path:"other/path"},
      {...book,description:"Historical book summary without transparent date note, many words."},
      {...book,content_classification:"religious"},
    ];
    for(const variant of alternatives){
      expect(eligibleGutenbergAsIsMissingYear(variant)).toBe(false);
      expect(computePublishGate(variant,new Set(),false,true).canPublish).toBe(false);
    }
  });
  it("never overrides rights review or unresolved rights-risk signals", () => {
    expect(computePublishGate({...book,rights_status:"pending"},new Set()).canPublish).toBe(false);
    expect(computePublishGate(book,new Set(),true).canPublish).toBe(false);
  });
});

describe("Whole Gutenberg short-form manuscripts", () => {
  const poem = ("This is a full original verse with exact words and punctuation.\n").repeat(5);
  it("accepts a short but complete source between the real Gutenberg boundaries", () => {
    const raw = "*** START OF THE PROJECT GUTENBERG EBOOK SHORT POEM ***\n\n" +
      poem + "\n*** END OF THE PROJECT GUTENBERG EBOOK SHORT POEM ***";
    expect(extractGutenbergBody(raw)).toBe(poem.trim());
  });
  it("rejects truncated works or empty bodies instead of fabricating them", () => {
    expect(() => extractGutenbergBody(poem)).toThrow(/START boundary/);
    expect(() => extractGutenbergBody("*** START OF THE PROJECT GUTENBERG EBOOK SHORT POEM ***\nHi\n*** END OF THE PROJECT GUTENBERG EBOOK SHORT POEM ***")).toThrow(/empty or too short/);
  });
});
