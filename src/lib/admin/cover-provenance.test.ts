import { describe, expect, it } from "vitest";
import { verifyStagedCoverProvenance, requireVerifiedSourceEditionId } from "./cover-provenance";

const metadata = {
  edition_language: "Urdu",
  source_edition_id: "quran-urdu-edition-1",
  attribution: "Original scanned artwork, rights reviewed",
  shared_artwork: "false",
};
const expected = {
  language: "Urdu",
  sourceEditionId: "quran-urdu-edition-1",
  attribution: "Original scanned artwork, rights reviewed",
  sharedArtwork: false,
};
describe("SP-14 exact staged cover metadata", () => {
  it("accepts unchanged storage rights provenance and source edition", () => {
    expect(() => verifyStagedCoverProvenance(metadata, expected)).not.toThrow();
  });
  it("blocks source edition replacement after staging", () => {
    expect(() => verifyStagedCoverProvenance(metadata, {
      ...expected, sourceEditionId: "quran-urdu-edition-2",
    })).toThrow(/source edition changed/i);
  });
  it("blocks altered attribution and shared collection art claims", () => {
    expect(() => verifyStagedCoverProvenance(metadata, {
      ...expected, attribution: "Another artwork source",
    })).toThrow(/rights or source edition changed/i);
    expect(() => verifyStagedCoverProvenance(metadata, {
      ...expected, sharedArtwork: true,
    })).toThrow(/rights or source edition changed/i);
  });
  it("blocks cross-language assignment or missing storage metadata", () => {
    expect(() => verifyStagedCoverProvenance(metadata, {
      ...expected, language: "Arabic",
    })).toThrow(/rights or source edition changed/i);
    expect(() => verifyStagedCoverProvenance(null, expected)).toThrow(/no stored rights provenance/i);
  });
});

describe("SP-14 no unrecorded exact-edition placeholder for cover publication", () => {
  it("rejects missing or whitespace-only source identifiers before any storage write", () => {
    expect(() => requireVerifiedSourceEditionId(null)).toThrow(/no verified identifier/i);
    expect(() => requireVerifiedSourceEditionId(undefined)).toThrow(/no verified identifier/i);
    expect(() => requireVerifiedSourceEditionId("  ")).toThrow(/no verified identifier/i);
    expect(() => requireVerifiedSourceEditionId("")).toThrow(/no verified identifier/i);
  });
  it("preserves canonical source ID byte-for-byte rather than silently normalizing", () => {
    const exact = "  source edition : 2026 / اصل  ";
    expect(requireVerifiedSourceEditionId(exact)).toBe(exact);
  });
});
