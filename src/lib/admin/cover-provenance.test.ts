import { describe, expect, it } from "vitest";
import { verifyStagedCoverProvenance, verifyStagedCoverObjectProvenance, requireVerifiedSourceEditionId } from "./cover-provenance";

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


describe("SP-14 real Supabase Storage file-info metadata split", () => {
  const info = {
    name: "editorial/book-id/Bilingual/some-id.webp",
    metadata: {
      mimetype: "image/webp",
      size: 293666,
      eTag: "storage-generated",
    },
    user_metadata: metadata,
  };

  it("uses user_metadata rather than the separate system metadata", () => {
    expect(() => verifyStagedCoverObjectProvenance(info, expected)).not.toThrow();
    // This was the live production failure: passing info.metadata produced
    // a false rights mismatch for a correctly staged artwork.
    expect(() => verifyStagedCoverProvenance(info.metadata, expected))
      .toThrow(/rights or source edition changed/i);
  });

  it("never accepts rights declarations from technical metadata when user_metadata is missing", () => {
    expect(() => verifyStagedCoverObjectProvenance({
      metadata: { ...metadata, mimetype: "image/webp" },
    }, expected)).toThrow(/no stored rights provenance/i);
    expect(() => verifyStagedCoverObjectProvenance(null, expected))
      .toThrow(/no stored rights provenance/i);
  });

  it("rejects tampered or cross-language custom metadata despite valid system file metadata", () => {
    expect(() => verifyStagedCoverObjectProvenance({
      ...info,
      user_metadata: { ...metadata, attribution: "Unreviewed art" },
    }, expected)).toThrow(/rights or source edition changed/i);
    expect(() => verifyStagedCoverObjectProvenance(info, {
      ...expected,
      sourceEditionId: "unrelated-edition",
    })).toThrow(/rights or source edition changed/i);
    expect(() => verifyStagedCoverObjectProvenance(info, {
      ...expected,
      language: "Arabic",
    })).toThrow(/rights or source edition changed/i);
    expect(() => verifyStagedCoverObjectProvenance(info, {
      ...expected,
      sharedArtwork: true,
    })).toThrow(/rights or source edition changed/i);
  });
});

describe("SP-14 actual storage-js .info recursive camelCase response", () => {
  // StorageFileApi.info performs recursiveToCamel over the full REST JSON.
  // The storage.objects DB row is snake_case; the client response is NOT.
  const liveLikeResponse = {
    metadata: {
      size: 293666,
      mimetype: "image/webp",
      cacheControl: "max-age=86400",
    },
    userMetadata: {
      editionLanguage: expected.language,
      sourceEditionId: expected.sourceEditionId,
      attribution: expected.attribution,
      sharedArtwork: "false",
      uploadedBy: "authorized-owner",
    },
  };
  it("accepts the actual camelized immutable rights namespace", () => {
    expect(() => verifyStagedCoverObjectProvenance(liveLikeResponse, expected)).not.toThrow();
  });
  it("rejects tampered author/source/rights even when the technical object exists", () => {
    expect(() => verifyStagedCoverObjectProvenance({
      ...liveLikeResponse,
      userMetadata: { ...liveLikeResponse.userMetadata, sourceEditionId: "different" },
    }, expected)).toThrow(/rights or source edition changed/i);
    expect(() => verifyStagedCoverObjectProvenance({
      ...liveLikeResponse,
      userMetadata: { ...liveLikeResponse.userMetadata, sharedArtwork: "true" },
    }, expected)).toThrow(/rights or source edition changed/i);
    expect(() => verifyStagedCoverObjectProvenance({
      ...liveLikeResponse,
      userMetadata: { ...liveLikeResponse.userMetadata, attribution: "not-reviewed" },
    }, expected)).toThrow(/rights or source edition changed/i);
  });
  it("never falls back to technical fields when the custom namespace is absent", () => {
    expect(() => verifyStagedCoverObjectProvenance({
      metadata: { ...metadata, editionLanguage: expected.language, sourceEditionId: expected.sourceEditionId },
    }, expected)).toThrow(/no stored rights provenance/i);
  });
  it("fails on conflicting duplicate camel/snake rights fields", () => {
    expect(() => verifyStagedCoverObjectProvenance({
      ...liveLikeResponse,
      userMetadata: { ...liveLikeResponse.userMetadata, source_edition_id: "other" },
    }, expected)).toThrow(/rights or source edition changed/i);
    expect(() => verifyStagedCoverObjectProvenance({
      ...liveLikeResponse,
      user_metadata: { ...metadata, source_edition_id: "other" },
    }, expected)).toThrow(/rights or source edition changed/i);
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
