import { describe, expect, it } from "vitest";
import { parseCsvManifest, computePublishGate } from "@/lib/admin/catalog.server";

const HEADER =
  "title,author,source_language,description,rights_basis,manuscript_text,translation_permission";

describe("parseCsvManifest", () => {
  it("parses a valid row with no errors", () => {
    const csv = `${HEADER}\nMoby Dick,Herman Melville,English,A whale book,public_domain,Call me Ishmael.,true`;
    const { rows } = parseCsvManifest(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[0]?.data["title"]).toBe("Moby Dick");
    expect(rows[0]?.data["translation_permission"]).toBe("true");
  });

  it("flags every missing required column by name", () => {
    const csv = `${HEADER}\n,,,,, ,`;
    const { rows } = parseCsvManifest(csv);
    expect(rows[0]?.errors.some((e) => e.includes('"title"'))).toBe(true);
    expect(rows[0]?.errors.some((e) => e.includes('"rights_basis"'))).toBe(true);
  });

  it("rejects a translation_permission value that isn't true/false", () => {
    const csv = `${HEADER}\nTitle,Author,English,Desc,public_domain,Text,maybe`;
    const { rows } = parseCsvManifest(csv);
    expect(rows[0]?.errors.some((e) => e.includes("translation_permission"))).toBe(true);
  });

  it("returns an empty result for an empty manifest", () => {
    expect(parseCsvManifest("")).toEqual({ rows: [], columns: [] });
  });

  it("numbers rows by their position in the file (1-indexed, header excluded)", () => {
    const csv = `${HEADER}\nA,B,English,d,pd,t,true\nC,D,English,d,pd,t,true`;
    const { rows } = parseCsvManifest(csv);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });
});

describe("computePublishGate", () => {
  const approved = {
    rights_status: "approved",
    edition_review_status: "approved",
    structure_review_status: "approved",
    cleanup_review_status: "approved",
    source_language: "French",
    edition_title: "Reviewed test edition",
    edition_year: 1900,
    publisher: "Test Publisher",
    isbn: "TEST-ISBN-001",
    source_scan_id: null,
    original_publication_year: 1890,
    word_count: 50_000,
    estimated_reading_minutes: 223,
    rights_risk_acknowledged_at: null,
  };

  it("allows publishing an approved original-language edition with NO translations at all", () => {
    const result = computePublishGate(approved, new Set());
    expect(result.canPublish).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("lists missing English/Urdu editions as pending, never as a blocking reason", () => {
    const result = computePublishGate(approved, new Set());
    expect(result.pendingTranslations.sort()).toEqual(["English", "Urdu"]);
    expect(result.reasons.join(" ")).not.toMatch(/english|urdu/i);
  });

  it("drops a standard target from 'pending' once it has a reviewed, published edition", () => {
    const result = computePublishGate(approved, new Set(["English"]));
    expect(result.pendingTranslations).toEqual(["Urdu"]);
  });

  it("never lists the book's own source language as pending", () => {
    const result = computePublishGate({ ...approved, source_language: "English" }, new Set());
    expect(result.pendingTranslations).toEqual(["Urdu"]);
  });

  it("blocks publishing when rights review is not approved, regardless of translations", () => {
    const result = computePublishGate(
      { ...approved, rights_status: "pending" },
      new Set(["English", "Urdu"]),
    );
    expect(result.canPublish).toBe(false);
    expect(result.reasons.some((r) => /rights/i.test(r))).toBe(true);
  });

  it("blocks publishing when editorial review is not approved, regardless of translations", () => {
    const result = computePublishGate(
      { ...approved, edition_review_status: "pending" },
      new Set(["English", "Urdu"]),
    );
    expect(result.canPublish).toBe(false);
    expect(result.reasons.some((r) => /edition|quality/i.test(r))).toBe(true);
  });

  it("blocks publishing until structure and cleanup reviews are approved", () => {
    const structure = computePublishGate(
      { ...approved, structure_review_status: "pending" },
      new Set(),
    );
    const cleanup = computePublishGate(
      { ...approved, cleanup_review_status: "changes_requested" },
      new Set(),
    );
    expect(structure.canPublish).toBe(false);
    expect(structure.reasons.join(" ")).toMatch(/structure/i);
    expect(cleanup.canPublish).toBe(false);
    expect(cleanup.reasons.join(" ")).toMatch(/cleanup/i);
  });

  it("blocks publishing when exact-edition metadata is incomplete", () => {
    const result = computePublishGate(
      { ...approved, edition_title: null, isbn: null, source_scan_id: null },
      new Set(),
    );
    expect(result.canPublish).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/metadata/i);
  });

  it("requires acknowledgment when the manuscript contains rights-risk clues", () => {
    const blocked = computePublishGate(approved, new Set(), true);
    expect(blocked.canPublish).toBe(false);
    expect(blocked.reasons.join(" ")).toMatch(/rights-risk|acknowledged/i);

    const allowed = computePublishGate(
      { ...approved, rights_risk_acknowledged_at: "2026-09-26T00:00:00Z" },
      new Set(),
      true,
    );
    expect(allowed.canPublish).toBe(true);
  });
});
