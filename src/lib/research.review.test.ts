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
      eq: () => builder,
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
  };
}

let mock: ReturnType<typeof makeMockSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mock.supabaseAdmin;
  },
}));

const { reviewResearchPaper, publishPaperVersion, withdrawPublishedPaper } = await import(
  "@/lib/research.server"
);

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

  it("refuses to withdraw a paper whose status isn't currently 'published', even with a stale pointer", async () => {
    mock = makeMockSupabase([
      { data: { status: "unpublished", published_version_id: "v1" }, error: null },
    ]);
    await expect(
      withdrawPublishedPaper({ paperId: "p1", actorId: "admin-1", reason: "test" }),
    ).rejects.toThrow(/no published version/i);
  });

  it("cuts off visibility FIRST (the research_papers status update), then marks the version row's audit fields", async () => {
    mock = makeMockSupabase([
      { data: { status: "published", published_version_id: "v1" }, error: null },
      { data: { id: "p1" }, error: null }, // paper status update (CAS match) — runs first
      { data: null, error: null }, // version withdrawn-audit update — runs second
    ]);
    await withdrawPublishedPaper({
      paperId: "p1",
      actorId: "admin-1",
      reason: "Factual correction needed",
    });
    const paperPayload = mock.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(paperPayload["status"]).toBe("unpublished");
    const versionPayload = mock.updateSpy.mock.calls[1]![0] as Record<string, unknown>;
    expect(versionPayload["withdrawn"]).toBe(true);
    expect(versionPayload["withdrawn_reason"]).toBe("Factual correction needed");
  });

  it("refuses when a concurrent action already changed the paper's status before this could complete", async () => {
    mock = makeMockSupabase([
      { data: { status: "published", published_version_id: "v1" }, error: null },
      { data: null, error: null }, // CAS matched zero rows
    ]);
    await expect(
      withdrawPublishedPaper({ paperId: "p1", actorId: "admin-1", reason: "test" }),
    ).rejects.toThrow(/concurrent action/i);
  });
});
