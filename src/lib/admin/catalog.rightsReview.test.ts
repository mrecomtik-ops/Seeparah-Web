import { describe, expect, it, vi } from "vitest";

// Same minimal chainable-query-builder mock pattern as
// src/lib/admin/catalog.accessType.test.ts.
interface ScriptEntry {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

interface MockChain {
  update(payload: unknown): MockChain;
  select(...args: unknown[]): MockChain;
  eq(...args: unknown[]): MockChain;
  single(): Promise<ScriptEntry>;
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
    const builder: MockChain = {
      update: (payload: unknown) => {
        updateSpy(payload);
        return builder;
      },
      select: () => builder,
      eq: () => builder,
      single: async () => next(),
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

const { reviewRights, isPlaceholderRightsText } = await import("@/lib/admin/catalog.server");

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
        },
        error: null,
      },
      { data: null, error: null },
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
