import { describe, expect, it, vi } from "vitest";

// Same minimal chainable-query-builder mock pattern as
// src/lib/admin/catalog.accessType.test.ts, extended with `.delete()` and a
// `count`-mode `.select()` for the deletion-impact queries.
interface ScriptEntry {
  data?: unknown;
  error?: { code?: string; message: string } | null;
  count?: number | null;
}

interface MockChain {
  select(...args: unknown[]): MockChain;
  update(payload: unknown): MockChain;
  delete(): MockChain;
  eq(...args: unknown[]): MockChain;
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
  const deleteSpy = vi.fn();
  const fromSpy = vi.fn();

  function chain(): MockChain {
    const builder: MockChain = {
      select: () => builder,
      update: (payload: unknown) => {
        updateSpy(payload);
        return builder;
      },
      delete: () => {
        deleteSpy();
        return builder;
      },
      eq: () => builder,
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
    deleteSpy,
    fromSpy,
  };
}

let mock: ReturnType<typeof makeMockSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mock.supabaseAdmin;
  },
}));

const {
  updateBookMetadata,
  stageChunkContentEdit,
  publishChunkContentEdit,
  discardChunkContentEdit,
  getBookDeletionImpact,
  deleteBookPermanently,
} = await import("@/lib/admin/catalog.server");

describe("updateBookMetadata", () => {
  it("only patches the fields provided, leaving others untouched", async () => {
    mock = makeMockSupabase([
      {
        data: { title: "Old", author: "A", description: "D", genre: "Fiction", cover_url: null },
        error: null,
      },
      { data: null, error: null },
    ]);
    const result = await updateBookMetadata({ bookId: "book-1", patch: { title: "New Title" } });
    expect(mock.updateSpy).toHaveBeenCalledWith({ title: "New Title" });
    expect(result.after).toEqual({ title: "New Title" });
  });

  it("refuses an empty patch", async () => {
    mock = makeMockSupabase([
      { data: { title: "Old", author: "A", description: "D", genre: null, cover_url: null }, error: null },
    ]);
    await expect(updateBookMetadata({ bookId: "book-1", patch: {} })).rejects.toThrow(/no metadata/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });
});

describe("staged content editing lifecycle", () => {
  it("stageChunkContentEdit refuses empty content without touching the DB", async () => {
    mock = makeMockSupabase([]);
    await expect(
      stageChunkContentEdit({
        bookId: "b",
        language: "English",
        chunkIndex: 0,
        newContent: "   ",
        editorId: "admin-1",
      }),
    ).rejects.toThrow(/cannot be empty/i);
  });

  it("stageChunkContentEdit refuses when the page doesn't exist", async () => {
    mock = makeMockSupabase([{ data: null, error: null }]);
    await expect(
      stageChunkContentEdit({
        bookId: "b",
        language: "English",
        chunkIndex: 999,
        newContent: "New text",
        editorId: "admin-1",
      }),
    ).rejects.toThrow(/doesn't exist/i);
  });

  it("stageChunkContentEdit writes pending_content without touching content", async () => {
    mock = makeMockSupabase([
      { data: { content: "Old text" }, error: null },
      { data: null, error: null },
    ]);
    const result = await stageChunkContentEdit({
      bookId: "b",
      language: "English",
      chunkIndex: 0,
      newContent: "Corrected text",
      editorId: "admin-1",
    });
    expect(result).toEqual({ before: "Old text", after: "Corrected text" });
    const payload = mock.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload["pending_content"]).toBe("Corrected text");
    expect(payload["pending_content_by"]).toBe("admin-1");
    expect(payload["content"]).toBeUndefined();
  });

  it("publishChunkContentEdit refuses when there is no pending edit", async () => {
    mock = makeMockSupabase([{ data: { content: "Live text", pending_content: null }, error: null }]);
    await expect(
      publishChunkContentEdit({ bookId: "b", language: "English", chunkIndex: 0 }),
    ).rejects.toThrow(/no pending edit/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });

  it("publishChunkContentEdit promotes pending_content into content and clears staging fields", async () => {
    mock = makeMockSupabase([
      { data: { content: "Live text", pending_content: "Corrected text" }, error: null },
      { data: null, error: null },
    ]);
    const result = await publishChunkContentEdit({ bookId: "b", language: "English", chunkIndex: 0 });
    expect(result).toEqual({ before: "Live text", after: "Corrected text" });
    const payload = mock.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload["content"]).toBe("Corrected text");
    expect(payload["pending_content"]).toBeNull();
    expect(payload["pending_content_by"]).toBeNull();
  });

  it("discardChunkContentEdit clears the pending fields without touching content", async () => {
    mock = makeMockSupabase([
      { data: { pending_content: "Discarded draft" }, error: null },
      { data: null, error: null },
    ]);
    const result = await discardChunkContentEdit({ bookId: "b", language: "English", chunkIndex: 0 });
    expect(result).toEqual({ discarded: "Discarded draft" });
    const payload = mock.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload["pending_content"]).toBeNull();
    expect(payload["content"]).toBeUndefined();
  });
});

describe("getBookDeletionImpact", () => {
  it("aggregates counts across every related table", async () => {
    mock = makeMockSupabase([
      { data: { title: "The Book", status: "archived" }, error: null }, // books
      { count: 475, error: null }, // book_chunks
      { count: 2, error: null }, // book_editions
      { count: 3, error: null }, // book_translation_jobs
      { count: 10, error: null }, // reading_progress
      { count: 5, error: null }, // book_highlights
      { count: 7, error: null }, // book_shelves
      { count: 1, error: null }, // user_subscriptions
      { count: 4, error: null }, // translation_requests
      { count: 0, error: null }, // translation_reports
      { count: 2, error: null }, // support_tickets
    ]);
    const impact = await getBookDeletionImpact("book-1");
    expect(impact).toEqual({
      bookId: "book-1",
      title: "The Book",
      status: "archived",
      chunkCount: 475,
      editionCount: 2,
      translationJobCount: 3,
      progressCount: 10,
      highlightCount: 5,
      shelfCount: 7,
      subscriptionCount: 1,
      translationRequestCount: 4,
      translationReportCount: 0,
      relatedSupportTicketCount: 2,
    });
  });
});

describe("deleteBookPermanently", () => {
  it("refuses when the book is still published (not archived or unpublished)", async () => {
    mock = makeMockSupabase([
      { data: { title: "Live Book", status: "published" }, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
    ]);
    await expect(deleteBookPermanently({ bookId: "book-1" })).rejects.toThrow(/already be archived/i);
    expect(mock.deleteSpy).not.toHaveBeenCalled();
  });

  it("detaches referencing support tickets before deleting when any exist", async () => {
    mock = makeMockSupabase([
      { data: { title: "Archived Book", status: "archived" }, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 1, error: null }, // one related support ticket
      { data: null, error: null }, // detach update
      { data: null, error: null }, // delete
    ]);
    const result = await deleteBookPermanently({ bookId: "book-1" });
    expect(result.impact.relatedSupportTicketCount).toBe(1);
    expect(mock.updateSpy).toHaveBeenCalledWith({ related_book_id: null });
    expect(mock.deleteSpy).toHaveBeenCalled();
  });

  it("skips the detach step and deletes directly when no support tickets reference the book", async () => {
    mock = makeMockSupabase([
      { data: { title: "Archived Book", status: "unpublished" }, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null }, // zero related support tickets
      { data: null, error: null }, // delete
    ]);
    await deleteBookPermanently({ bookId: "book-1" });
    expect(mock.updateSpy).not.toHaveBeenCalled();
    expect(mock.deleteSpy).toHaveBeenCalled();
  });
});
