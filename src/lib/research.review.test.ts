import { describe, expect, it, vi } from "vitest";

// Same minimal chainable-query-builder mock pattern as
// src/lib/admin/catalog.accessType.test.ts.
interface ScriptEntry {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

interface MockChain {
  insert(payload: unknown): MockChain;
  update(payload: unknown): MockChain;
  select(...args: unknown[]): MockChain;
  eq(...args: unknown[]): MockChain;
  order(...args: unknown[]): MockChain;
  limit(...args: unknown[]): MockChain;
  single(): Promise<ScriptEntry>;
  maybeSingle(): Promise<ScriptEntry>;
  then<T>(resolve: (value: ScriptEntry) => T, reject: (error: unknown) => T): Promise<T>;
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
  const insertSpy = vi.fn();
  const fromSpy = vi.fn();
  // Records the (column, value) pair of every .eq() call in call order, so
  // tests can assert WHICH column a compare-and-swap guard is actually
  // keyed on (e.g. published_version_id vs status) — not just that some
  // update happened.
  const eqSpy = vi.fn();

  function chain(): MockChain {
    const builder: MockChain = {
      insert: (payload: unknown) => {
        insertSpy(payload);
        return builder;
      },
      update: (payload: unknown) => {
        updateSpy(payload);
        return builder;
      },
      select: () => builder,
      eq: (...args: unknown[]) => {
        eqSpy(args);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      single: async () => next(),
      maybeSingle: async () => next(),
      then: (resolve, reject) => Promise.resolve(next()).then(resolve, reject),
    };
    return builder;
  }

  return {
    supabaseAdmin: {
      from: (table: string) => {
        fromSpy(table);
        return chain();
      },
    },
    updateSpy,
    insertSpy,
    fromSpy,
    eqSpy,
  };
}

let mock: ReturnType<typeof makeMockSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mock.supabaseAdmin;
  },
}));

const { reviewResearchPaper, publishPaperVersion, withdrawPublishedPaper, uploadPaperPdf } =
  await import("@/lib/research.server");

describe("reviewResearchPaper — only ever moves a submitted paper", () => {
  it("refuses to review a paper that isn't currently submitted", async () => {
    mock = makeMockSupabase([{ data: { status: "draft" }, error: null }]);
    await expect(
      reviewResearchPaper({ paperId: "p1", decision: "approved", reviewerId: "admin-1" }),
    ).rejects.toThrow(/currently submitted/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });

  it("approves a submitted paper without publishing it", async () => {
    mock = makeMockSupabase([
      { data: { status: "submitted" }, error: null },
      { data: null, error: null },
    ]);
    const result = await reviewResearchPaper({
      paperId: "p1",
      decision: "approved",
      reviewerId: "admin-1",
    });
    expect(result.after["status"]).toBe("approved");
    expect(mock.fromSpy).not.toHaveBeenCalledWith("research_paper_versions");
  });

  it("records a rejection reason from notes, defaulting when none given", async () => {
    mock = makeMockSupabase([
      { data: { status: "submitted" }, error: null },
      { data: null, error: null },
    ]);
    await reviewResearchPaper({ paperId: "p1", decision: "rejected", reviewerId: "admin-1" });
    const payload = mock.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload["rejection_reason"]).toBe("Not approved for publication");
  });
});

describe("publishPaperVersion — versioning and immutability", () => {
  const snapshot = {
    author_name: "A. Student",
    coauthor_names: [],
    affiliation: null,
    orcid: null,
    language: "English",
    title: "A Study",
    abstract: "Abstract text",
    keywords: ["poetry"],
    topic: null,
    paper_type: "literary_analysis",
    body_text: "Body",
    pdf_data: null,
    pdf_filename: null,
    pdf_size_bytes: null,
    citation_style: "MLA",
    references_text: "References",
    funding_note: null,
    conflicts_of_interest: null,
    acknowledgments: null,
    ai_assistance_disclosure: null,
  };

  it("refuses to publish a paper that isn't approved", async () => {
    mock = makeMockSupabase([{ data: { status: "submitted", ...snapshot }, error: null }]);
    await expect(
      publishPaperVersion({ paperId: "p1", publisherId: "admin-1" }),
    ).rejects.toThrow(/been approved/i);
    expect(mock.insertSpy).not.toHaveBeenCalled();
  });

  it("creates version 1 with no prior versions — no supersede step exists anymore", async () => {
    mock = makeMockSupabase([
      { data: { status: "approved", ...snapshot }, error: null }, // paper read
      { data: [], error: null }, // existing versions (none)
      { data: { id: "v1" }, error: null }, // insert new version
      { data: { id: "p1" }, error: null }, // pointer update (CAS match)
    ]);
    const result = await publishPaperVersion({ paperId: "p1", publisherId: "admin-1" });
    expect(result).toEqual({ versionId: "v1", version: 1 });
    const insertPayload = mock.insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertPayload["version"]).toBe(1);
    expect(insertPayload["paper_id"]).toBe("p1");
    // Only 2 tables are ever touched: research_papers (read + final update)
    // and research_paper_versions (read-highest-version + insert) — no
    // third "supersede" update to research_paper_versions.
    expect(mock.updateSpy).toHaveBeenCalledTimes(1);
  });

  it("increments to version 2 with a prior version, without touching that prior row at all", async () => {
    mock = makeMockSupabase([
      { data: { status: "approved", ...snapshot }, error: null },
      { data: [{ version: 1 }], error: null },
      { data: { id: "v2" }, error: null },
      { data: { id: "p1" }, error: null },
    ]);
    const result = await publishPaperVersion({ paperId: "p1", publisherId: "admin-1" });
    expect(result.version).toBe(2);
    // The only update in the whole call is the final research_papers
    // pointer move — the old version row is never written to; it becomes
    // invisible purely because the pointer no longer names it.
    expect(mock.updateSpy).toHaveBeenCalledTimes(1);
  });

  it("sets research_papers.status to published and points published_version_id at the new snapshot, guarded by a compare-and-swap on status='approved'", async () => {
    mock = makeMockSupabase([
      { data: { status: "approved", ...snapshot }, error: null },
      { data: [], error: null },
      { data: { id: "v1" }, error: null },
      { data: { id: "p1" }, error: null },
    ]);
    await publishPaperVersion({ paperId: "p1", publisherId: "admin-1" });
    const finalUpdate = mock.updateSpy.mock.calls[mock.updateSpy.mock.calls.length - 1]![0] as Record<
      string,
      unknown
    >;
    expect(finalUpdate).toEqual({ status: "published", published_version_id: "v1" });
  });

  it("refuses (does not silently succeed) when a concurrent action already changed the paper's status before the pointer update could run", async () => {
    mock = makeMockSupabase([
      { data: { status: "approved", ...snapshot }, error: null },
      { data: [], error: null },
      { data: { id: "v1" }, error: null },
      { data: null, error: null }, // CAS matched zero rows — status already changed
    ]);
    await expect(publishPaperVersion({ paperId: "p1", publisherId: "admin-1" })).rejects.toThrow(
      /concurrent action/i,
    );
  });

  it("publishing a revision never requires published_version_id to be cleared first — the compare-and-swap is keyed only on status", async () => {
    // A paper that already has a live published version (v1) submits a
    // revision, gets re-approved, and is published again — the OLD
    // version must still be fully visible right up until this call's own
    // pointer update, so nothing here should gate on published_version_id
    // at all (see migration 0014's "THIRD REVIEW ROUND (b)" note).
    mock = makeMockSupabase([
      { data: { status: "approved", ...snapshot }, error: null },
      { data: [{ version: 1 }], error: null },
      { data: { id: "v2" }, error: null },
      { data: { id: "p1" }, error: null },
    ]);
    await publishPaperVersion({ paperId: "p1", publisherId: "admin-1" });
    const eqCalls = mock.eqSpy.mock.calls.map((c) => c[0] as [string, unknown]);
    expect(eqCalls.some(([column]) => column === "published_version_id")).toBe(false);
    expect(eqCalls).toContainEqual(["status", "approved"]);
  });
});

describe("withdrawPublishedPaper", () => {
  it("refuses to withdraw a paper that was never published", async () => {
    mock = makeMockSupabase([
      { data: { status: "approved", published_version_id: null }, error: null },
    ]);
    await expect(
      withdrawPublishedPaper({ paperId: "p1", actorId: "admin-1", reason: "test" }),
    ).rejects.toThrow(/no published version/i);
  });

  it("cuts off visibility FIRST (nulls published_version_id), then marks the version row's audit fields — resting case, status was 'published'", async () => {
    mock = makeMockSupabase([
      { data: { status: "published", published_version_id: "v1" }, error: null },
      { data: { id: "p1" }, error: null }, // pointer-null update (CAS match) — runs first
      { data: null, error: null }, // version withdrawn-audit update — runs second
    ]);
    await withdrawPublishedPaper({
      paperId: "p1",
      actorId: "admin-1",
      reason: "Factual correction needed",
    });
    const paperPayload = mock.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(paperPayload["published_version_id"]).toBeNull();
    expect(paperPayload["status"]).toBe("unpublished");
    const versionPayload = mock.updateSpy.mock.calls[1]![0] as Record<string, unknown>;
    expect(versionPayload["withdrawn"]).toBe(true);
    expect(versionPayload["withdrawn_reason"]).toBe("Factual correction needed");
    // The compare-and-swap is keyed on published_version_id, not status —
    // required so withdrawal still works when status is no longer
    // 'published' (see the mid-revision test below).
    const eqCalls = mock.eqSpy.mock.calls.map((c) => c[0] as [string, unknown]);
    expect(eqCalls).toContainEqual(["published_version_id", "v1"]);
  });

  it("withdraws while a revision is mid-review — nulls the pointer but leaves the revision's own status untouched", async () => {
    // The paper's status is already 'submitted' (a revision awaiting
    // re-review) while published_version_id still points at the OLD,
    // currently-live version. Withdrawing that old version must not
    // clobber the in-progress review state.
    mock = makeMockSupabase([
      { data: { status: "submitted", published_version_id: "v1" }, error: null },
      { data: { id: "p1" }, error: null },
      { data: null, error: null },
    ]);
    await withdrawPublishedPaper({ paperId: "p1", actorId: "admin-1", reason: "Retracted" });
    const paperPayload = mock.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(paperPayload["published_version_id"]).toBeNull();
    expect(paperPayload["status"]).toBe("submitted");
  });

  it("refuses when a concurrent action already changed the published version before this could complete", async () => {
    mock = makeMockSupabase([
      { data: { status: "published", published_version_id: "v1" }, error: null },
      { data: null, error: null }, // CAS matched zero rows
    ]);
    await expect(
      withdrawPublishedPaper({ paperId: "p1", actorId: "admin-1", reason: "test" }),
    ).rejects.toThrow(/concurrent action/i);
  });
});

// Regression coverage: EDITABLE_STATUSES in research.server.ts previously
// excluded 'published', so an author revising an already-published paper's
// text (allowed by research.ts's isEditableForRevision, widened earlier)
// could not revise its PDF in the same revision — a real inconsistency,
// not a deliberate restriction. Confirms it's fixed, and that unrelated
// non-editable statuses are still correctly refused.
describe("uploadPaperPdf — editable-status set matches research.ts's isEditableForRevision", () => {
  it("allows uploading a PDF revision for an already-published paper", async () => {
    mock = makeMockSupabase([
      { data: { author_id: "author-1", status: "published" }, error: null },
      { data: null, error: null },
    ]);
    await expect(
      uploadPaperPdf({
        paperId: "p1",
        authorId: "author-1",
        filename: "revised.pdf",
        fileBase64: Buffer.from("hello").toString("base64"),
      }),
    ).resolves.toEqual({ ok: true });
    const payload = mock.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload["pdf_data"]).toBe(`\\x${Buffer.from("hello").toString("hex")}`);
  });

  it("still refuses for a status that was never editable, e.g. 'approved' (pending publish)", async () => {
    mock = makeMockSupabase([
      { data: { author_id: "author-1", status: "approved" }, error: null },
    ]);
    await expect(
      uploadPaperPdf({
        paperId: "p1",
        authorId: "author-1",
        filename: "revised.pdf",
        fileBase64: Buffer.from("hello").toString("base64"),
      }),
    ).rejects.toThrow(/no longer editable/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });
});
