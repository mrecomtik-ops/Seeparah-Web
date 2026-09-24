import { describe, expect, it, vi } from "vitest";
import { splitManuscript } from "@/lib/manuscript";

// A minimal, purpose-built mock of the chainable supabase-js query
// builder, scripted per-test as an ordered queue of responses. Each
// terminal point in publishBook's own call sequence — an explicit
// `.single()`/`.maybeSingle()`, or `await`ing a chain directly (which
// invokes `.then` the same way a real PostgrestBuilder does) — consumes
// exactly the next entry. `insert`/`update` are spies so tests can assert
// on *what* was written, not just what came back.
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
  then<T>(
    resolve: (value: ScriptEntry) => T,
    reject: (error: unknown) => T,
  ): Promise<T>;
}

function makeMockSupabase(script: ScriptEntry[]) {
  let i = 0;
  const next = (): ScriptEntry => {
    if (i >= script.length) {
      throw new Error(`Mock supabase: ran out of scripted responses after ${i} call(s)`);
    }
    return script[i++]!;
  };
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
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
      single: async () => next(),
      maybeSingle: async () => next(),
      then: (resolve, reject) => Promise.resolve(next()).then(resolve, reject),
    };
    return builder;
  }

  return {
    supabase: {
      from: (table: string) => {
        fromSpy(table);
        return chain();
      },
    },
    insertSpy,
    updateSpy,
  };
}

let mock: ReturnType<typeof makeMockSupabase>;

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.supabase;
  },
}));

const { publishBook, ManuscriptSaveError } = await import("@/lib/library");

const BASE_INPUT = {
  title: "Test Book",
  authorName: "Test Author",
  sourceLanguage: "English",
  summary: "A summary.",
  manuscript: "Chapter one text.\n\nChapter two text.",
  isPaid: false,
  priceUsd: null,
  genre: null,
  coverUrl: null,
  status: "draft" as const,
  rightsConfirmed: true,
};

const USER_ID = "author-1";

// What splitManuscript actually produces for BASE_INPUT.manuscript — used
// to build mock `book_chunks` rows that genuinely match (or, deliberately,
// don't match) what publishBook's own exact-content check expects. Never
// hand-typed separately from the real chunking logic, so these tests can't
// silently drift from what the function under test actually computes.
const CHUNKS = splitManuscript(BASE_INPUT.manuscript);

function matchingRows(language = "English") {
  return CHUNKS.map((content, i) => ({ chunk_index: i, language, content }));
}

describe("publishBook — chunk-write failure", () => {
  it("throws ManuscriptSaveError and leaves the book as a draft — no second 'demote' step involved", async () => {
    mock = makeMockSupabase([
      { data: { id: "book-1" }, error: null }, // books insert
      { data: null, error: { code: "23505", message: "duplicate key value" } }, // chunk insert — NOT the known schema gap
    ]);
    await expect(publishBook(USER_ID, BASE_INPUT)).rejects.toThrow(ManuscriptSaveError);
    // Exactly two writes happened: the book insert and the one (failed,
    // non-retried) chunk insert. No update was ever issued to "demote" the
    // book — because the insert above already wrote it as 'draft', there
    // was never anything to demote. Note the function throws immediately
    // on a genuine chunk-insert failure, before ever reaching the
    // fetch-and-compare validation step — there is nothing to verify yet.
    expect(mock.insertSpy).toHaveBeenCalledTimes(2);
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });

  it("does not retry a non-schema chunk error, and the thrown error carries the real cause", async () => {
    mock = makeMockSupabase([
      { data: { id: "book-1" }, error: null },
      { data: null, error: { code: "42501", message: "permission denied" } },
    ]);
    await expect(publishBook(USER_ID, BASE_INPUT)).rejects.toThrow(/permission denied/);
    expect(mock.insertSpy).toHaveBeenCalledTimes(2); // no fallback retry attempted
  });

  it("does retry the one known missing-column signature, and succeeds", async () => {
    mock = makeMockSupabase([
      { data: { id: "book-1" }, error: null }, // books insert
      {
        data: null,
        error: { code: "PGRST204", message: "Could not find the 'status' column of 'book_chunks' in the schema cache" },
      }, // first chunk insert attempt — known gap
      { data: null, error: null }, // retried chunk insert (status omitted) — succeeds
      { data: matchingRows(), error: null }, // post-insert validation: exact content re-fetch, matches
      { data: { id: "book-1", status: "draft" }, error: null }, // final fetch
    ]);
    const result = await publishBook(USER_ID, BASE_INPUT);
    expect(result.id).toBe("book-1");
    expect(mock.insertSpy).toHaveBeenCalledTimes(3); // book + failed chunk attempt + retried chunk attempt
    const retriedPayload = mock.insertSpy.mock.calls[2]![0] as Array<Record<string, unknown>>;
    expect(retriedPayload[0]).not.toHaveProperty("status");
  });

  it("rejects a save whose re-fetched content doesn't actually match, not just wrong count — content corruption/truncation is caught, not just row count", async () => {
    const corrupted = matchingRows();
    corrupted[1] = { ...corrupted[1]!, content: "WRONG TEXT — not what was submitted" };
    mock = makeMockSupabase([
      { data: { id: "book-1" }, error: null },
      { data: null, error: null }, // insert reports success
      { data: corrupted, error: null }, // but the re-fetched content doesn't match — right count, wrong text
    ]);
    await expect(publishBook(USER_ID, BASE_INPUT)).rejects.toThrow(ManuscriptSaveError);
  });
});

describe("publishBook — final submission-transition failure", () => {
  it("leaves the book as a valid, still-private draft when the in_review transition matches no rows", async () => {
    mock = makeMockSupabase([
      { data: { id: "book-1" }, error: null }, // books insert (always 'draft')
      { data: null, error: null }, // chunk insert succeeds
      { data: matchingRows(), error: null }, // validation: exact content matches
      { data: null, error: null }, // transition UPDATE matches zero rows
    ]);
    await expect(publishBook(USER_ID, { ...BASE_INPUT, status: "in_review" })).rejects.toThrow(
      /may already have been submitted|no longer yours/,
    );
    // The book row itself was inserted as 'draft' and never touched again
    // after the failed transition attempt — confirmed by the update call
    // having been made (the attempt) but no further insert/update after.
    expect(mock.updateSpy).toHaveBeenCalledTimes(1);
    expect(mock.updateSpy.mock.calls[0]![0]).toEqual({ status: "in_review" });
  });

  it("surfaces a real transition error without losing the draft", async () => {
    mock = makeMockSupabase([
      { data: { id: "book-1" }, error: null },
      { data: null, error: null },
      { data: matchingRows(), error: null },
      { data: null, error: { code: "40001", message: "could not serialize access" } },
    ]);
    await expect(publishBook(USER_ID, { ...BASE_INPUT, status: "in_review" })).rejects.toThrow(
      /Nothing was lost/,
    );
  });
});

describe("publishBook — retrying the same draft (manuscript UNCHANGED)", () => {
  it("reuses existingBookId instead of creating a second book, and skips re-inserting chunks that already saved", async () => {
    mock = makeMockSupabase([
      { data: { id: "book-1", author_id: USER_ID, status: "draft" }, error: null }, // fetch existing draft
      { data: matchingRows(), error: null }, // existing chunks — content matches this exact submission
      { data: { id: "book-1", status: "draft" }, error: null }, // final fetch (status stays draft here)
    ]);
    const result = await publishBook(USER_ID, BASE_INPUT, "book-1");
    expect(result.id).toBe("book-1");
    // No book row and no chunk rows were ever inserted on this call — the
    // only calls issued anywhere were reads. This is the "content
    // genuinely matches" case: the existing rows are reused as the final
    // validation too (no second fetch), which is why exactly 3 responses
    // — not 4 — were needed to satisfy this whole call.
    expect(mock.insertSpy).not.toHaveBeenCalled();
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });

  it("proceeds to submit for review on a resumed draft once chunks are confirmed present", async () => {
    mock = makeMockSupabase([
      { data: { id: "book-1", author_id: USER_ID, status: "draft" }, error: null },
      { data: matchingRows(), error: null },
      { data: { id: "book-1" }, error: null }, // transition succeeds
      { data: { id: "book-1", status: "in_review" }, error: null }, // final fetch
    ]);
    const result = await publishBook(USER_ID, { ...BASE_INPUT, status: "in_review" }, "book-1");
    expect(result.status).toBe("in_review");
    expect(mock.insertSpy).not.toHaveBeenCalled();
    expect(mock.updateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("publishBook — retrying the same draft after the manuscript was EDITED", () => {
  it("refuses the retry instead of silently keeping the old saved text", async () => {
    // The draft already has content saved (a prior attempt's chunks), but
    // it does not match what's in `input` now — simulating the author
    // having changed the manuscript text in the form between the failed
    // attempt and this retry.
    const staleRows = CHUNKS.map((content, i) => ({
      chunk_index: i,
      language: "English",
      content: `OLD VERSION: ${content}`,
    }));
    mock = makeMockSupabase([
      { data: { id: "book-1", author_id: USER_ID, status: "draft" }, error: null },
      { data: staleRows, error: null }, // existing content — does NOT match input.manuscript
    ]);
    await expect(publishBook(USER_ID, BASE_INPUT, "book-1")).rejects.toThrow(
      /doesn't match what's in the form now/,
    );
    // Refused before ever writing anything — no insert, no update, and
    // critically no silent "keep the old rows and return success" either
    // (the rejection above already proves that, but confirm no write
    // side-effect of any kind occurred).
    expect(mock.insertSpy).not.toHaveBeenCalled();
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });

  it("also refuses when only the chunk COUNT differs (a shorter or longer edit), not just changed text", async () => {
    const shorterStaleRows = [{ chunk_index: 0, language: "English", content: "Only one old chunk." }];
    mock = makeMockSupabase([
      { data: { id: "book-1", author_id: USER_ID, status: "draft" }, error: null },
      { data: shorterStaleRows, error: null },
    ]);
    await expect(publishBook(USER_ID, BASE_INPUT, "book-1")).rejects.toThrow(
      /doesn't match what's in the form now/,
    );
    expect(mock.insertSpy).not.toHaveBeenCalled();
  });

  it("does not confuse a genuine edit with a same-length coincidence: language mismatch is also caught", async () => {
    const wrongLanguageRows = CHUNKS.map((content, i) => ({ chunk_index: i, language: "Urdu", content }));
    mock = makeMockSupabase([
      { data: { id: "book-1", author_id: USER_ID, status: "draft" }, error: null },
      { data: wrongLanguageRows, error: null },
    ]);
    await expect(publishBook(USER_ID, BASE_INPUT, "book-1")).rejects.toThrow(
      /doesn't match what's in the form now/,
    );
  });
});

describe("publishBook — unauthorized draft modification", () => {
  it("refuses to resume a book id that isn't the caller's own (ownership enforced server-side)", async () => {
    // The fetch is filtered by .eq("author_id", userId) on top of RLS —
    // a book belonging to someone else (or that doesn't exist) comes back
    // as no row at all, exactly like a genuinely missing id. The mock
    // reflects this by returning a null row, matching what
    // books_read_access + the explicit filter would actually produce.
    mock = makeMockSupabase([{ data: null, error: null }]);
    await expect(publishBook(USER_ID, BASE_INPUT, "someone-elses-book")).rejects.toThrow(
      /couldn't be found, or isn't yours/,
    );
    expect(mock.insertSpy).not.toHaveBeenCalled();
    expect(mock.updateSpy).not.toHaveBeenCalled();
  });

  it("refuses to resume a book that is no longer a draft (already submitted/published/etc.)", async () => {
    mock = makeMockSupabase([{ data: { id: "book-1", author_id: USER_ID, status: "in_review" }, error: null }]);
    await expect(publishBook(USER_ID, BASE_INPUT, "book-1")).rejects.toThrow(/no longer a draft/);
    expect(mock.insertSpy).not.toHaveBeenCalled();
  });
});

describe("publishBook — attempted self-publication", () => {
  it("never writes status: 'published', even if a caller bypasses the type system", async () => {
    mock = makeMockSupabase([
      { data: { id: "book-1" }, error: null }, // books insert
      { data: null, error: null }, // chunk insert
      { data: matchingRows(), error: null }, // validation
      { data: { id: "book-1", status: "draft" }, error: null }, // final fetch
    ]);
    // `status` is typed as "draft" | "in_review" — this cast simulates a
    // caller that ignores the type system entirely.
    const forced = { ...BASE_INPUT, status: "published" as unknown as "draft" | "in_review" };
    const result = await publishBook(USER_ID, forced);

    // The insert always hardcodes 'draft' regardless of input.status —
    // confirmed by inspecting the actual payload sent, not just the
    // final result.
    const bookInsertPayload = mock.insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(bookInsertPayload["status"]).toBe("draft");
    // "published" only ever triggers the in_review branch via a strict
    // equality check — it does not match, so no transition UPDATE (the
    // only place any status change happens) was ever issued.
    expect(mock.updateSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("draft");
  });

  it("the in_review transition itself can never request 'published' — it's a hardcoded literal, not derived from input", async () => {
    mock = makeMockSupabase([
      { data: { id: "book-1" }, error: null },
      { data: null, error: null },
      { data: matchingRows(), error: null },
      { data: { id: "book-1" }, error: null },
      { data: { id: "book-1", status: "in_review" }, error: null },
    ]);
    await publishBook(USER_ID, { ...BASE_INPUT, status: "in_review" });
    expect(mock.updateSpy).toHaveBeenCalledWith({ status: "in_review" });
    expect(mock.updateSpy).not.toHaveBeenCalledWith({ status: "published" });
  });
});
