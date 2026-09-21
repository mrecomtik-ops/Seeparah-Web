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

  it("creates version 1 with no prior versions, and never supersedes anything", async () => {
    mock = makeMockSupabase([
      { data: { status: "approved", ...snapshot }, error: null }, // paper read
      { data: [], error: null }, // existing versions (none)
      { data: null, error: null }, // supersede update (no-op, zero rows matched)
      { data: { id: "v1" }, error: null }, // insert new version
      { data: null, error: null }, // update research_papers
    ]);
    const result = await publishPaperVersion({ paperId: "p1", publisherId: "admin-1" });
    expect(result).toEqual({ versionId: "v1", version: 1 });
    const insertPayload = mock.insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertPayload["version"]).toBe(1);
    expect(insertPayload["paper_id"]).toBe("p1");
  });

  it("supersedes the prior current version before inserting version 2 — never two is_current rows", async () => {
    mock = makeMockSupabase([
      { data: { status: "approved", ...snapshot }, error: null },
      { data: [{ id: "v1", version: 1 }], error: null },
      { data: null, error: null }, // supersede
      { data: { id: "v2" }, error: null },
      { data: null, error: null },
    ]);
    const result = await publishPaperVersion({ paperId: "p1", publisherId: "admin-1" });
    expect(result.version).toBe(2);
    // The supersede update ran before the insert (call order in updateSpy vs insertSpy
    // reflects the awaited sequence in publishPaperVersion).
    expect(mock.updateSpy.mock.invocationCallOrder[0]).toBeLessThan(
      mock.insertSpy.mock.invocationCallOrder[0]!,
    );
  });

  it("sets research_papers.status to published and points published_version_id at the new snapshot", async () => {
    mock = makeMockSupabase([
      { data: { status: "approved", ...snapshot }, error: null },
      { data: [], error: null },
      { data: null, error: null },
      { data: { id: "v1" }, error: null },
      { data: null, error: null },
    ]);
    await publishPaperVersion({ paperId: "p1", publisherId: "admin-1" });
    const finalUpdate = mock.updateSpy.mock.calls[mock.updateSpy.mock.calls.length - 1]![0] as Record<
      string,
      unknown
    >;
    expect(finalUpdate).toEqual({ status: "published", published_version_id: "v1" });
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

  it("marks the current version withdrawn (with reason) and moves the paper to unpublished", async () => {
    mock = makeMockSupabase([
      { data: { status: "published", published_version_id: "v1" }, error: null },
      { data: null, error: null }, // version withdrawn update
      { data: null, error: null }, // paper status update
    ]);
    await withdrawPublishedPaper({
      paperId: "p1",
      actorId: "admin-1",
      reason: "Factual correction needed",
    });
    const versionPayload = mock.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(versionPayload["withdrawn"]).toBe(true);
    expect(versionPayload["withdrawn_reason"]).toBe("Factual correction needed");
    const paperPayload = mock.updateSpy.mock.calls[1]![0] as Record<string, unknown>;
    expect(paperPayload["status"]).toBe("unpublished");
  });
});
