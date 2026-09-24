import { describe, expect, it, vi } from "vitest";

// Same minimal chainable-query-builder mock pattern as
// src/lib/library.publishBook.test.ts — see that file's own comment.
interface ScriptEntry {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

interface MockChain {
  insert(payload: unknown): MockChain;
  update(payload: unknown): MockChain;
  select(...args: unknown[]): MockChain;
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
  const fromSpy = vi.fn();

  function chain(): MockChain {
    const builder: MockChain = {
      insert: () => builder,
      update: (payload: unknown) => {
        updateSpy(payload);
        return builder;
      },
      select: () => builder,
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
    fromSpy,
  };
}

let mock: ReturnType<typeof makeMockSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mock.supabaseAdmin;
  },
}));

const { setBookAccessType, setEditionAccessType, bulkSetAccessType } = await import(
  "@/lib/admin/catalog.server"
);

describe("setBookAccessType — the original edition", () => {
  it("updates books.access_type and reports a real before/after diff", async () => {
    mock = makeMockSupabase([
      { data: { access_type: "free" }, error: null }, // select before
      { data: null, error: null }, // update
    ]);
    const result = await setBookAccessType({ bookId: "book-1", accessType: "paid" });
    expect(result.before).toEqual({ access_type: "free" });
    expect(result.after).toEqual({ access_type: "paid" });
    expect(mock.updateSpy).toHaveBeenCalledWith({ access_type: "paid" });
    expect(mock.fromSpy).toHaveBeenCalledWith("books");
  });
});

describe("setEditionAccessType — a translated edition", () => {
  it("updates book_editions.access_type when the edition already exists", async () => {
    mock = makeMockSupabase([
      { data: { access_type: "free" }, error: null }, // select before
      { data: null, error: null }, // update
    ]);
    const result = await setEditionAccessType({
      bookId: "book-1",
      language: "Hindi",
      accessType: "paid",
    });
    expect(result.before).toEqual({ access_type: "free" });
    expect(result.after).toEqual({ access_type: "paid" });
    expect(mock.fromSpy).toHaveBeenCalledWith("book_editions");
  });

  it("refuses — does not attempt any write — when no edition has been published yet", async () => {
    mock = makeMockSupabase([{ data: null, error: null }]); // select before: no row
    await expect(
      setEditionAccessType({ bookId: "book-1", language: "Hindi", accessType: "paid" }),
    ).rejects.toThrow(/no published Hindi edition/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });
});

describe("bulkSetAccessType", () => {
  it("applies to a mix of original (language: null) and translated-edition targets, reporting per-target success", async () => {
    mock = makeMockSupabase([
      { data: { access_type: "free" }, error: null }, // book-1 select
      { data: null, error: null }, // book-1 update
      { data: { access_type: "free" }, error: null }, // book-2 edition select
      { data: null, error: null }, // book-2 edition update
    ]);
    const results = await bulkSetAccessType({
      targets: [
        { bookId: "book-1", language: null },
        { bookId: "book-2", language: "Hindi" },
      ],
      accessType: "paid",
    });
    expect(results).toEqual([
      { target: { bookId: "book-1", language: null }, ok: true },
      { target: { bookId: "book-2", language: "Hindi" }, ok: true },
    ]);
  });

  it("a single bad target (edition never published) does not abort the rest of the batch", async () => {
    mock = makeMockSupabase([
      { data: null, error: null }, // book-1 edition select: no row → throws
      { data: { access_type: "free" }, error: null }, // book-2 select
      { data: null, error: null }, // book-2 update
    ]);
    const results = await bulkSetAccessType({
      targets: [
        { bookId: "book-1", language: "Hindi" },
        { bookId: "book-2", language: null },
      ],
      accessType: "paid",
    });
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toMatch(/no published Hindi edition/i);
    expect(results[1]?.ok).toBe(true);
  });
});
