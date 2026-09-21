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

vi.mock("@/lib/admin/settings.server", () => ({
  getSetting: vi.fn(async (key: string) => {
    if (key !== "categories") return null;
    return { value: ["Poetry", "History", "Philosophy"] };
  }),
}));

const { setBookCategories, bulkPatchBookCategory, suggestCategory, decideCategorySuggestion } =
  await import("@/lib/admin/catalog.server");

describe("setBookCategories — validated against the master list", () => {
  it("accepts categories that are in the master list, deduped", async () => {
    mock = makeMockSupabase([
      { data: { categories: ["History"] }, error: null },
      { data: null, error: null },
    ]);
    const result = await setBookCategories({
      bookId: "book-1",
      categories: ["Poetry", "Poetry", "History"],
    });
    expect(result.after).toEqual(["Poetry", "History"]);
    expect(mock.updateSpy).toHaveBeenCalledWith({ categories: ["Poetry", "History"] });
  });

  it("refuses a category not in the master list — never invents one on the fly", async () => {
    mock = makeMockSupabase([]);
    await expect(
      setBookCategories({ bookId: "book-1", categories: ["Not A Real Category"] }),
    ).rejects.toThrow(/not in the category list/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });
});

describe("bulkPatchBookCategory — independent per-book application", () => {
  it("adds a category to multiple books, reporting per-book success", async () => {
    mock = makeMockSupabase([
      { data: { categories: [] }, error: null },
      { data: null, error: null },
      { data: { categories: ["Poetry"] }, error: null }, // already has it — no-op add
      { data: null, error: null },
    ]);
    const results = await bulkPatchBookCategory({
      bookIds: ["book-1", "book-2"],
      category: "Poetry",
      action: "add",
    });
    expect(results).toEqual([
      { bookId: "book-1", ok: true },
      { bookId: "book-2", ok: true },
    ]);
  });

  it("one book's read failure doesn't abort the rest of the batch", async () => {
    mock = makeMockSupabase([
      { data: null, error: { message: "not found" } },
      { data: { categories: ["Poetry"] }, error: null },
      { data: null, error: null },
    ]);
    const results = await bulkPatchBookCategory({
      bookIds: ["book-missing", "book-2"],
      category: "Poetry",
      action: "remove",
    });
    expect(results[0]?.ok).toBe(false);
    expect(results[1]?.ok).toBe(true);
  });

  it("refuses to add a not-in-master-list category before touching any book", async () => {
    mock = makeMockSupabase([]);
    await expect(
      bulkPatchBookCategory({ bookIds: ["book-1"], category: "Fake", action: "add" }),
    ).rejects.toThrow(/not in the category list/i);
  });
});

describe("suggestCategory — author ownership enforced independently of client-side RLS", () => {
  it("refuses to record a suggestion for a book the caller doesn't own", async () => {
    mock = makeMockSupabase([{ data: { author_id: "someone-else" }, error: null }]);
    await expect(
      suggestCategory({
        contentType: "book",
        contentId: "book-1",
        suggestedBy: "author-1",
        category: "Poetry",
      }),
    ).rejects.toThrow(/your own submission/i);
    expect(mock.insertSpy).not.toHaveBeenCalled();
  });

  it("records a suggestion when the caller does own the content", async () => {
    mock = makeMockSupabase([
      { data: { author_id: "author-1" }, error: null },
      { data: { id: "suggestion-1" }, error: null },
    ]);
    const result = await suggestCategory({
      contentType: "research_paper",
      contentId: "paper-1",
      suggestedBy: "author-1",
      category: "History",
    });
    expect(result.id).toBe("suggestion-1");
    expect(mock.fromSpy).toHaveBeenCalledWith("research_papers");
  });

  it("refuses an empty category suggestion", async () => {
    mock = makeMockSupabase([]);
    await expect(
      suggestCategory({ contentType: "book", contentId: "book-1", suggestedBy: "author-1", category: "   " }),
    ).rejects.toThrow(/enter a category/i);
  });
});

describe("decideCategorySuggestion — deciding never itself changes what's assigned", () => {
  it("records the decision without touching books.categories or the master list", async () => {
    mock = makeMockSupabase([
      { data: { id: "s1", status: "pending", suggested_category: "Poetry" }, error: null },
      { data: null, error: null },
    ]);
    const result = await decideCategorySuggestion({
      suggestionId: "s1",
      decision: "approved",
      decidedBy: "admin-1",
      note: "Reasonable category",
    });
    expect(result.before).toEqual({ id: "s1", status: "pending", suggested_category: "Poetry" });
    expect(mock.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", decided_by: "admin-1" }),
    );
    // The only table touched is category_suggestions — never books.
    expect(mock.fromSpy).not.toHaveBeenCalledWith("books");
  });
});
