import { describe, expect, it, vi } from "vitest";

// Same minimal chainable-query-builder mock pattern as
// src/lib/admin/catalog.accessType.test.ts.
interface ScriptEntry {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

interface MockChain extends PromiseLike<ScriptEntry> {
  update(payload: unknown): MockChain;
  select(...args: unknown[]): MockChain;
  eq(...args: unknown[]): MockChain;
  order(...args: unknown[]): MockChain;
  limit(...args: unknown[]): MockChain;
  single(): Promise<ScriptEntry>;
  maybeSingle(): Promise<ScriptEntry>;
}

function makeMockSupabase(script: ScriptEntry[]) {
  let i = 0;
  const next = (): ScriptEntry => {
    if (i >= script.length) {
      throw new Error(`Mock supabase: ran out of scripted responses after ${i} call(s)`);
    }
    return script[i++]!;
  };
  const updateSpy = vi.fn();

  function chain(): MockChain {
    let isUpdate = false;
    const builder: MockChain = {
      update: (payload: unknown) => {
        isUpdate = true;
        updateSpy(payload);
        return builder;
      },
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => next(),
      maybeSingle: async () => next(),
      then: (onfulfilled, onrejected) =>
        Promise.resolve(isUpdate ? { data: null, error: null } : next()).then(
          onfulfilled ?? undefined,
          onrejected ?? undefined,
        ),
    };
    return builder;
  }

  return {
    supabaseAdmin: { from: () => chain() },
    updateSpy,
  };
}

let mock: ReturnType<typeof makeMockSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mock.supabaseAdmin;
  },
}));

const { reviewRights, isPlaceholderRightsText, updateBookRightsProvenance } = await import("@/lib/admin/catalog.server");

describe("isPlaceholderRightsText", () => {
  it("flags the exact placeholder that slipped through review ('hh')", () => {
    expect(isPlaceholderRightsText("hh")).toBe(true);
  });

  it("flags short strings, all-repeated-character strings, and known placeholder tokens", () => {
    expect(isPlaceholderRightsText("")).toBe(true);
    expect(isPlaceholderRightsText(null)).toBe(true);
    expect(isPlaceholderRightsText(undefined)).toBe(true);
    expect(isPlaceholderRightsText("xxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
    expect(isPlaceholderRightsText("TBD")).toBe(true);
    expect(isPlaceholderRightsText("n/a")).toBe(true);
    expect(isPlaceholderRightsText("Lorem ipsum dolor sit amet")).toBe(true);
    expect(
      isPlaceholderRightsText(
        "PENDING — do not approve until the exact edition and its rights evidence are verified.",
      ),
    ).toBe(true);
  });

  it("accepts a real, substantive rights statement", () => {
    expect(
      isPlaceholderRightsText(
        "Public domain in the US: published 1936, copyright not renewed per Stanford Copyright Renewal Database.",
      ),
    ).toBe(false);
  });
});

describe("reviewRights — approval gate refuses placeholder evidence", () => {
  it("rejects an 'approved' decision when rights_basis is a placeholder", async () => {
    mock = makeMockSupabase([
      {
        data: {
          rights_status: "pending",
          edition_review_status: "approved",
          status: "in_review",
          rights_basis: "hh",
          rights_evidence_url: null,
        },
        error: null,
      },
    ]);
    await expect(
      reviewRights({ bookId: "book-1", decision: "approved", reviewerId: "admin-1" }),
    ).rejects.toThrow(/placeholder/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });

  it("rejects an 'approved' decision when rights_evidence_url is missing, even with real-looking basis text", async () => {
    mock = makeMockSupabase([
      {
        data: {
          rights_status: "pending",
          edition_review_status: "approved",
          status: "in_review",
          rights_basis: "Public domain per the publisher's own 1960 renewal filing, confirmed against the Copyright Office database.",
          rights_evidence_url: null,
        },
        error: null,
      },
    ]);
    await expect(
      reviewRights({ bookId: "book-1", decision: "approved", reviewerId: "admin-1" }),
    ).rejects.toThrow(/evidence url/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });

  it("allows an 'approved' decision when both rights_basis and rights_evidence_url are real", async () => {
    mock = makeMockSupabase([
      {
        data: {
          rights_status: "pending",
          edition_review_status: "approved",
          status: "in_review",
          rights_basis: "Public domain per the publisher's own 1960 renewal filing, confirmed against the Copyright Office database.",
          rights_evidence_url: "https://example.gov/copyright-records/12345",
          rights_risk_acknowledged_at: null,
        },
        error: null,
      },
      {
        data: { source_language: "English", source_version: 1 },
        error: null,
      },
      { data: [], error: null },
    ]);
    const result = await reviewRights({
      bookId: "book-1",
      decision: "approved",
      reviewerId: "admin-1",
    });
    expect(result.after.rights_status).toBe("approved");
    expect(mock.updateSpy).toHaveBeenCalled();
  });

  it("never gates a 'rejected' decision on evidence content", async () => {
    mock = makeMockSupabase([
      {
        data: {
          rights_status: "pending",
          edition_review_status: "pending",
          status: "in_review",
          rights_basis: "hh",
          rights_evidence_url: null,
        },
        error: null,
      },
      { data: null, error: null },
    ]);
    const result = await reviewRights({
      bookId: "book-1",
      decision: "rejected",
      reviewerId: "admin-1",
      notes: "Not enough evidence",
    });
    expect(result.after.rights_status).toBe("rejected");
  });
});


describe("updateBookRightsProvenance", () => {
  it("keeps never-reviewed books pending while saving real provenance fields", async () => {
    mock = makeMockSupabase([
      {
        data: {
          status: "in_review",
          rights_status: "pending",
          rights_basis: "Old basis",
          rights_evidence_url: null,
          source_url: null,
          attribution: null,
          translation_permission: false,
          permitted_territories: [],
        },
        error: null,
      },
    ]);
    const result = await updateBookRightsProvenance({
      bookId: "book-1",
      patch: {
        rightsBasis: "Permission is documented for this exact edition.",
        rightsEvidenceUrl: "https://example.org/rights",
        sourceUrl: "https://example.org/source",
        attribution: "Example attribution",
        translationPermission: true,
        permittedTerritories: ["US", "AE"],
      },
    });
    expect(result.after.rights_status).toBe("pending");
    expect(mock.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        rights_status: "pending",
        rights_basis: "Permission is documented for this exact edition.",
        rights_evidence_url: "https://example.org/rights",
      }),
    );
  });

  it("invalidates a previous decision when provenance is edited", async () => {
    mock = makeMockSupabase([
      {
        data: {
          status: "unpublished",
          rights_status: "approved",
          rights_basis: "Previously approved basis",
          rights_evidence_url: "https://example.org/old",
          source_url: null,
          attribution: null,
          translation_permission: false,
          permitted_territories: [],
        },
        error: null,
      },
    ]);
    const result = await updateBookRightsProvenance({
      bookId: "book-1",
      patch: {
        rightsBasis: "Updated evidence for the exact edition.",
        rightsEvidenceUrl: "https://example.org/new",
        sourceUrl: null,
        attribution: null,
        translationPermission: false,
        permittedTerritories: [],
      },
    });
    expect(result.after.rights_status).toBe("unverified");
  });

  it("refuses to change provenance while a book is published", async () => {
    mock = makeMockSupabase([
      {
        data: {
          status: "published",
          rights_status: "approved",
          rights_basis: "Approved basis",
          rights_evidence_url: "https://example.org/rights",
          source_url: null,
          attribution: null,
          translation_permission: false,
          permitted_territories: [],
        },
        error: null,
      },
    ]);
    await expect(
      updateBookRightsProvenance({
        bookId: "book-1",
        patch: {
          rightsBasis: "Changed basis",
          rightsEvidenceUrl: "https://example.org/new",
          sourceUrl: null,
          attribution: null,
          translationPermission: false,
          permittedTerritories: [],
        },
      }),
    ).rejects.toThrow(/unpublish/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });
});
