import { describe, expect, it, vi } from "vitest";

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

describe("setBookAccessType — original editions are always free", () => {
  it("refuses to put an original-language edition behind a paywall", async () => {
    mock = makeMockSupabase([]);
    await expect(
      setBookAccessType({ bookId: "book-1", accessType: "paid" }),
    ).rejects.toThrow(/always free/i);
    expect(mock.fromSpy).not.toHaveBeenCalled();
  });

  it("allows an admin to normalize a legacy original back to free", async () => {
    mock = makeMockSupabase([
      { data: { access_type: "paid" }, error: null },
      { data: null, error: null },
    ]);
    const result = await setBookAccessType({ bookId: "book-1", accessType: "free" });
    expect(result.before).toEqual({ access_type: "paid" });
    expect(result.after).toEqual({ access_type: "free" });
    expect(mock.updateSpy).toHaveBeenCalledWith({ access_type: "free" });
  });
});

describe("setEditionAccessType — translated editions", () => {
  it("allows a general translated edition to use monthly-plan access", async () => {
    mock = makeMockSupabase([
      { data: { access_type: "free" }, error: null },
      { data: { content_classification: "general" }, error: null },
      { data: null, error: null },
    ]);
    const result = await setEditionAccessType({
      bookId: "book-1",
      language: "Hindi",
      accessType: "paid",
    });
    expect(result.after).toEqual({ access_type: "paid" });
  });

  it("refuses to put a Religious translated edition behind a paywall", async () => {
    mock = makeMockSupabase([
      { data: { access_type: "free" }, error: null },
      { data: { content_classification: "religious" }, error: null },
    ]);
    await expect(
      setEditionAccessType({
        bookId: "book-1",
        language: "Urdu",
        accessType: "paid",
      }),
    ).rejects.toThrow(/religious.*always free/i);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });

  it("refuses when the translated edition has never been published", async () => {
    mock = makeMockSupabase([{ data: null, error: null }]);
    await expect(
      setEditionAccessType({ bookId: "book-1", language: "Hindi", accessType: "paid" }),
    ).rejects.toThrow(/no published Hindi edition/i);
  });
});

describe("bulkSetAccessType", () => {
  it("reports a paid original as rejected while still updating a general translation", async () => {
    mock = makeMockSupabase([
      { data: { access_type: "free" }, error: null },
      { data: { content_classification: "general" }, error: null },
      { data: null, error: null },
    ]);
    const results = await bulkSetAccessType({
      targets: [
        { bookId: "book-1", language: null },
        { bookId: "book-2", language: "Hindi" },
      ],
      accessType: "paid",
    });
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toMatch(/always free/i);
    expect(results[1]?.ok).toBe(true);
  });
});
