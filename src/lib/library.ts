import { supabase } from "@/integrations/supabase/client";
import {
  getReaderChunk as fetchReaderChunk,
  getReaderNavigation as fetchReaderNavigation,
  searchReaderBook as fetchReaderBookSearch,
  activateSubscription,
} from "@/lib/reader.functions";
import { splitManuscript } from "@/lib/manuscript";
import {
  DEMO_CHUNKS,
  demoStore,
  type Book,
  type Chunk,
  type Highlight,
  type Progress,
  type Subscription,
} from "@/lib/data";

export const DEMO_USER_ID = "demo-reader";

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function currentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

/**
 * The real, public catalog — always reflects the actual `books` table,
 * never silently substituted with the fixed demo/seed catalog
 * (`DEMO_BOOKS`). A genuinely empty result (a fresh backend with no
 * approved books yet) is returned as an empty array, not papered over —
 * showing fictional titles as if they were real, live content would
 * misrepresent what's actually published. A real connection/query error
 * is also surfaced as empty rather than silently substituted; the caller
 * (the library page) is responsible for its own loading/error UI, not
 * this function pretending a failure is "just an empty catalog with demo
 * placeholders."
 */
export async function listBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[listBooks] real catalog query failed:", error.message);
    return [];
  }
  return (data as Book[]) ?? [];
}

/** Same honesty guarantee as listBooks(): a real book id that doesn't
 * exist (or a real query error) returns null, never a demo placeholder
 * substituted in by coincidentally matching a seed book's fixed id. */
export async function getBook(id: string): Promise<Book | null> {
  const { data, error } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[getBook] real query failed:", error.message);
    return null;
  }
  return (data as Book | null) ?? null;
}

/**
 * Pure title/author search predicate — no Supabase import, unit-testable
 * without a database. Case-insensitive, partial-substring, and correct for
 * any script including Urdu/Arabic: JS's `toLowerCase()` + `includes()`
 * operate on Unicode code points, not Latin-specific casing/stemming
 * rules, so this needs no per-language configuration to work for RTL text.
 * Matches title OR author — the two fields the product rule names
 * explicitly — never anything else, so a search for "history" doesn't
 * surface unrelated genre matches under the "search" heading (genre/
 * description filtering is a separate, additional client-side facet in
 * the Library UI, not part of "search" itself).
 */
export function matchesBookSearch(book: Pick<Book, "title" | "author">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q);
}

/**
 * Server-side search by title or author — same matching rule as
 * matchesBookSearch, expressed as `ilike` so it scales past whatever's
 * already fetched to the client and works from a page that hasn't loaded
 * the full catalog. Goes through the plain (RLS-backed) client, exactly
 * like listBooks/getBook — never service-role — so an unpublished or
 * otherwise inaccessible book can never appear in a result: the SAME
 * `books_read_access` policy that already gates listBooks() gates this,
 * by construction, not by an extra filter this function has to remember
 * to apply.
 */
export async function searchBooks(query: string): Promise<Book[]> {
  const q = query.trim();
  if (!q) return [];
  const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .or(`title.ilike.%${escaped}%,author.ilike.%${escaped}%`)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[searchBooks] real query failed:", error.message);
    return [];
  }
  return (data as Book[]) ?? [];
}

export interface ReaderChunkResult {
  content: string | null;
  locked: boolean;
  reason?: "sign_in_required" | "subscription_required" | "translation_access_required" | "not_available";
}

function findDemoChunk(bookId: string, language: string, chunkIndex: number): Chunk | undefined {
  return (
    demoStore
      .getExtraChunks()
      .find(
        (c) =>
          c.book_id === bookId &&
          c.language === language &&
          c.chunk_index === chunkIndex,
      ) ??
    DEMO_CHUNKS.find(
      (c) =>
        c.book_id === bookId &&
        c.language === language &&
        c.chunk_index === chunkIndex,
    ) ??
    demoStore
      .getPublishedBooks()
      .find((p) => p.book.id === bookId)
      ?.chunks.find(
        (c) => c.language === language && c.chunk_index === chunkIndex,
      )
  );
}

/**
 * Reads a reader page. For real (non-demo) books this goes through a
 * server function that checks subscription status itself — the client
 * never receives premium content it isn't entitled to, and never triggers
 * an AI translation as a side effect of reading.
 *
 * The on-device demo fallback (used when there's no backend, the book only
 * exists locally, or the server call itself failed — e.g. misconfiguration)
 * cannot verify a real subscription, so it fails CLOSED: a paid book still
 * only opens its first page for free in that fallback, exactly like the
 * real path. It only additionally honors a locally-recorded demo
 * subscription (the local "test-mode" subscribe flow), never anything more
 * permissive. A server failure must never be the reason premium content
 * becomes readable.
 */
export async function getReaderNavigation(bookId: string, language: string) {
  const token = await accessToken();
  try {
    return await fetchReaderNavigation({
      data: { bookId, language, accessToken: token },
    });
  } catch {
    return [];
  }
}

export async function searchReaderBook(bookId: string, language: string, query: string) {
  const token = await accessToken();
  if (query.trim().length < 2) return [];
  try {
    return await fetchReaderBookSearch({
      data: { bookId, language, query: query.trim(), accessToken: token },
    });
  } catch {
    return [];
  }
}

export async function getReaderChunk(
  bookId: string,
  language: string,
  chunkIndex: number,
): Promise<ReaderChunkResult> {
  try {
    const token = await accessToken();
    const result = await fetchReaderChunk({
      data: { bookId, language, chunkIndex, accessToken: token },
    });
    // A book unknown to the backend (locally-published demo book, or no
    // backend configured at all) falls back to on-device demo content. This
    // is distinct from a REAL book the backend found but refused (e.g. it
    // isn't published yet) — that case comes back as `locked: true` and
    // must never fall through to demo content, or a draft/rejected book's
    // gate could be bypassed by a client that only checks the reason string.
    if (result.reason === "not_available" && !result.locked) {
      return await demoFallback(bookId, language, chunkIndex);
    }
    return result;
  } catch {
    return await demoFallback(bookId, language, chunkIndex);
  }
}

async function demoFallback(
  bookId: string,
  language: string,
  chunkIndex: number,
): Promise<ReaderChunkResult> {
  const demo = findDemoChunk(bookId, language, chunkIndex);
  const book = await getBook(bookId);
  const isPaid = book?.access_type === "paid";
  const isFreePreview = chunkIndex === 0;
  const hasLocalSubscription = demoStore
    .getSubscriptions()
    .some((s) => s.book_id === bookId && s.user_id === DEMO_USER_ID && s.status === "active");

  if (isPaid && !isFreePreview && !hasLocalSubscription) {
    return { content: null, locked: true, reason: "subscription_required" };
  }
  return { content: demo?.content ?? null, locked: false };
}

export async function saveProgress(
  userId: string,
  bookId: string,
  language: string,
  lastChunkIndex: number,
) {
  const row: Progress = {
    user_id: userId,
    book_id: bookId,
    language,
    last_chunk_index: lastChunkIndex,
    updated_at: new Date().toISOString(),
  };
  if (userId !== DEMO_USER_ID) {
    try {
      const { error } = await supabase.from("reading_progress").upsert(row);
      if (!error) return { synced: true as const };
    } catch {
      // fall through to local
    }
  }
  const rows = demoStore.getProgress();
  const i = rows.findIndex(
    (r) =>
      r.book_id === bookId && r.language === language && r.user_id === userId,
  );
  if (i >= 0) rows[i] = row;
  else rows.push(row);
  demoStore.setProgress(rows);
  return { synced: false as const };
}

export async function listProgress(userId: string): Promise<Progress[]> {
  if (userId !== DEMO_USER_ID) {
    try {
      const { data, error } = await supabase
        .from("reading_progress")
        .select("*")
        .eq("user_id", userId);
      if (!error) return (data as Progress[]) ?? [];
    } catch {
      // fall through
    }
  }
  return demoStore.getProgress().filter((r) => r.user_id === userId);
}

export async function addHighlight(
  userId: string,
  bookId: string,
  language: string,
  chunkIndex: number,
  text: string,
  startOffset: number | null = null,
  endOffset: number | null = null,
): Promise<Highlight> {
  const row: Highlight = {
    id: crypto.randomUUID(),
    user_id: userId,
    book_id: bookId,
    language,
    chunk_index: chunkIndex,
    highlight_text: text,
    start_offset: startOffset,
    end_offset: endOffset,
    created_at: new Date().toISOString(),
    note: null,
  };
  if (userId !== DEMO_USER_ID) {
    try {
      const { error } = await supabase.from("book_highlights").insert(row);
      if (!error) return row;
    } catch {
      // fall through
    }
  }
  const rows = demoStore.getHighlights();
  rows.push(row);
  demoStore.setHighlights(rows);
  return row;
}

export async function removeHighlight(userId: string, highlightId: string): Promise<void> {
  if (userId !== DEMO_USER_ID) {
    try {
      const { error } = await supabase
        .from("book_highlights")
        .delete()
        .eq("id", highlightId)
        .eq("user_id", userId);
      if (!error) return;
    } catch {
      // fall through
    }
  }
  demoStore.setHighlights(demoStore.getHighlights().filter((h) => h.id !== highlightId));
}

export async function updateHighlightNote(
  userId: string,
  highlightId: string,
  note: string,
): Promise<void> {
  if (userId !== DEMO_USER_ID) {
    try {
      const { error } = await supabase
        .from("book_highlights")
        .update({ note })
        .eq("id", highlightId)
        .eq("user_id", userId);
      if (!error) return;
    } catch {
      // fall through
    }
  }
  const rows = demoStore.getHighlights();
  const existing = rows.find((h) => h.id === highlightId);
  if (existing) {
    existing.note = note;
    demoStore.setHighlights(rows);
  }
}

export async function listHighlights(userId: string): Promise<Highlight[]> {
  if (userId !== DEMO_USER_ID) {
    try {
      const { data, error } = await supabase
        .from("book_highlights")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (!error) return (data as Highlight[]) ?? [];
    } catch {
      // fall through
    }
  }
  return demoStore
    .getHighlights()
    .filter((h) => h.user_id === userId)
    .reverse();
}

export async function listSubscriptions(
  userId: string,
): Promise<Subscription[]> {
  if (userId !== DEMO_USER_ID) {
    try {
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active");
      if (!error) return (data as Subscription[]) ?? [];
    } catch {
      // fall through
    }
  }
  return demoStore
    .getSubscriptions()
    .filter((s) => s.user_id === userId && s.status === "active");
}

/**
 * Test-mode only — there is no Stripe (or other payment provider)
 * integration in this codebase. For a signed-in user this still goes
 * through a server function that verifies their identity and writes the
 * subscription row itself (see src/lib/reader.server.ts), rather than
 * letting the browser write "active" directly to the database. Demo mode
 * (no account) keeps a local-only simulated subscription, which was already
 * the existing behavior and is clearly labeled as such in the UI.
 */
export async function subscribeToBook(
  userId: string,
  book: Book,
): Promise<Subscription> {
  const row: Subscription = {
    id: crypto.randomUUID(),
    user_id: userId,
    book_id: book.id,
    status: "active",
    monthly_price_usd: book.subscription_price_usd ?? 0,
    starts_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    renewed_at: null,
    created_at: new Date().toISOString(),
  };
  if (userId !== DEMO_USER_ID) {
    const token = await accessToken();
    if (token) {
      const sub = await activateSubscription({ data: { bookId: book.id, accessToken: token } });
      return sub as Subscription;
    }
  }
  const rows = demoStore.getSubscriptions();
  rows.push(row);
  demoStore.setSubscriptions(rows);
  return row;
}

export type BookStatus = "draft" | "in_review" | "published" | "unpublished";

/**
 * Thrown when a book's row saved successfully but its manuscript text did
 * not. Carries `bookId` so the caller can point the author at the specific
 * (now-private) draft to retry, instead of resubmitting the whole form and
 * creating a second, unrelated book. Deliberately a distinct class — a
 * plain `Error` with this message would be indistinguishable from any
 * other publishBook failure to a caller that wanted to branch on it later.
 */
export class ManuscriptSaveError extends Error {
  readonly bookId: string;
  constructor(bookId: string, cause: string) {
    super(
      `Your book record was saved as a private draft, but the manuscript text failed to save (${cause}). ` +
        `Open it from My Books to add the text again — submitting this form again would create a second, separate book.`,
    );
    this.name = "ManuscriptSaveError";
    this.bookId = bookId;
  }
}

/**
 * True only for the one specific, already-diagnosed failure this file
 * knows how to work around: a PostgREST "column not found" rejection
 * (`PGRST204`) naming the exact column we expect might be missing, on the
 * exact table we expect it from. Deliberately narrow — this must never
 * match an authorization failure (`42501`/RLS `403`), a validation/check-
 * constraint failure (`23514`), a missing-table failure (`PGRST205`), or
 * any other error shape, all of which need to reach the caller unchanged,
 * not be silently retried with a smaller payload.
 */
export function isMissingColumnError(
  err: { code?: string | null; message?: string | null } | null | undefined,
  column: string,
  table: string,
): boolean {
  if (!err || err.code !== "PGRST204") return false;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes(`'${column.toLowerCase()}'`) && msg.includes(table.toLowerCase());
}

interface SavedChunkRow {
  chunk_index: number;
  language: string;
  content: string;
}

/**
 * True only if `rows` is EXACTLY the expected saved state for `chunks` in
 * `language` — the right count, no missing/duplicate indexes (every index
 * 0..chunks.length-1 present exactly once), every row in the requested
 * language, non-empty content, and content matching byte-for-byte.
 * Deliberately an exact-match check, not a count or length check: a
 * matching row count alone does not prove the saved text is this
 * submission's text — this is what actually distinguishes "this draft's
 * saved content genuinely is this manuscript" from "something with the
 * right number of rows happens to be there," which both the resume path
 * (deciding whether it's safe to skip a re-insert) and the pre-transition
 * validation (deciding whether it's safe to let a book reach the review
 * queue) need — not just a total row count.
 */
function savedChunksMatch(rows: SavedChunkRow[], chunks: string[], language: string): boolean {
  if (rows.length !== chunks.length) return false;
  const byIndex = new Map(rows.map((r) => [r.chunk_index, r]));
  for (let i = 0; i < chunks.length; i++) {
    const row = byIndex.get(i);
    if (!row) return false; // missing index, or a duplicate collapsed onto another — either way, wrong
    if (row.language !== language) return false;
    if (!row.content || row.content.length === 0) return false;
    if (row.content !== chunks[i]) return false;
  }
  return true;
}

/** `chunk_index`/`language`/`content` all predate migration 0001 — this
 * read never needs the schema-tolerant fallback the write side does. */
async function fetchSavedChunks(bookId: string): Promise<SavedChunkRow[]> {
  const { data, error } = await supabase
    .from("book_chunks")
    .select("chunk_index, language, content")
    .eq("book_id", bookId);
  if (error) throw new Error(`Couldn't verify the manuscript saved correctly: ${error.message}`);
  return (data ?? []) as SavedChunkRow[];
}

export interface PublishInput {
  title: string;
  authorName: string;
  sourceLanguage: string;
  summary: string;
  manuscript: string;
  isPaid: boolean;
  priceUsd: number | null;
  genre: string | null;
  coverUrl: string | null;
  status: BookStatus;
  rightsConfirmed: boolean;
}

export { splitManuscript } from "@/lib/manuscript";


/**
 * Creates (or resumes) a book's draft, then optionally submits it for
 * review — always as two separate, explicit steps, never bundled into one
 * write. Every NEW book is inserted with `status: 'draft'` regardless of
 * what the author ultimately asked for; moving to `'in_review'` only ever
 * happens afterward, in its own statement, and only once the manuscript's
 * chunks are confirmed present by an actual re-count (never assumed from
 * "the insert didn't error"). Consequence: a failure at any point before
 * that final step leaves an ordinary, recoverable private draft — because
 * the row was never anything else. There is no separate "demote back to
 * draft" step for this to depend on.
 *
 * Draft and in-review saves never touch a book that's already published —
 * publishing an edit is a separate, explicit action (see setBookStatus),
 * so a work-in-progress revision can never leak into what readers
 * currently see.
 *
 * `existingBookId`: pass this (from a caught `ManuscriptSaveError.bookId`)
 * to resume a draft whose manuscript text failed to save last time,
 * instead of creating a second, unrelated book. Ownership and status are
 * re-checked here against the database, never assumed from what the
 * caller passes in: the lookup is itself RLS-scoped to the caller's own
 * rows (`books_read_access`), and is additionally filtered by
 * `author_id`/`status` explicitly as a second, redundant check — a forged
 * or stale id can touch neither someone else's book nor one that isn't
 * (still) a draft. If the draft already has SOME saved chunk content, it
 * is compared byte-for-byte (`savedChunksMatch`) against the manuscript in
 * `input` before deciding what to do: identical content is treated as
 * already-saved (skip re-inserting — true idempotency); content that
 * doesn't match — e.g. the author edited the manuscript since the failed
 * attempt that produced this id — is refused outright rather than
 * silently kept (the author would wrongly believe their edit saved) or
 * silently overwritten (book_chunks has no UPDATE/DELETE grant for
 * `authenticated` at all today, so an in-place fix isn't even possible
 * through this path, and a second raw INSERT over the same rows risks a
 * constraint violation or real duplicates depending on the live schema).
 *
 * For a signed-in (non-demo) author, a real database failure is surfaced
 * as an error rather than silently falling back to on-device demo
 * storage — silently saving "published" work only in the author's own
 * browser would misrepresent what actually happened.
 */
export async function publishBook(
  userId: string,
  input: PublishInput,
  existingBookId?: string,
): Promise<Book> {
  if (input.status !== "draft" && !input.rightsConfirmed) {
    throw new Error("Rights confirmation is required before submitting for review");
  }
  const chunks = splitManuscript(input.manuscript);

  if (userId === DEMO_USER_ID) {
    const book: Book = {
      id: crypto.randomUUID(),
      title: input.title,
      author: input.authorName,
      author_id: null,
      cover_url: input.coverUrl,
      available_languages: [input.sourceLanguage],
      total_chunks: chunks.length,
      source_language: input.sourceLanguage,
      description: input.summary,
      genre: input.genre,
      status: input.status,
      access_type: input.isPaid ? "paid" : "free",
      subscription_price_usd: input.isPaid ? input.priceUsd : null,
      created_at: new Date().toISOString(),
    };
    const published = demoStore.getPublishedBooks();
    published.push({
      book,
      chunks: chunks.map((content, i) => ({
        book_id: book.id,
        language: input.sourceLanguage,
        chunk_index: i,
        content,
        status: "published",
        source_version: 1,
        job_id: null,
        model: null,
        prompt_version: null,
        updated_at: new Date().toISOString(),
      })),
    });
    demoStore.setPublishedBooks(published);
    return book;
  }

  let bookId: string;
  let skipChunkInsert = false;
  let verifiedRows: SavedChunkRow[] | undefined;

  if (existingBookId) {
    const { data: existing, error: fetchError } = await supabase
      .from("books")
      .select("id, author_id, status")
      .eq("id", existingBookId)
      .eq("author_id", userId) // redundant with RLS below — explicit, not trusted
      .maybeSingle();
    if (fetchError) throw new Error(`Couldn't load the draft to retry: ${fetchError.message}`);
    if (!existing) throw new Error("That draft couldn't be found, or isn't yours to edit.");
    if (existing.status !== "draft") {
      throw new Error(
        "That book is no longer a draft, so it can't be resumed this way — start a new submission instead.",
      );
    }
    bookId = existing.id;

    const existingRows = await fetchSavedChunks(bookId);
    if (existingRows.length > 0) {
      if (savedChunksMatch(existingRows, chunks, input.sourceLanguage)) {
        // Genuinely the same submission already fully saved — skip
        // re-inserting (true idempotency), and reuse this read as the
        // final validation below rather than fetching it twice.
        skipChunkInsert = true;
        verifiedRows = existingRows;
      } else {
        // Something is already saved on this draft, but it does not match
        // this submission byte-for-byte — most likely the manuscript was
        // edited since the attempt that produced this id. Refused, not
        // silently resolved either direction: see the function doc above
        // for why neither "keep the old text" nor "overwrite it" is safe
        // to do automatically here.
        throw new Error(
          "This draft already has saved manuscript text that doesn't match what's in the form now — it looks like it was edited since the last attempt. To avoid silently keeping the old text, this retry was refused. Start a new submission instead, or check My Books to see exactly what's saved on this draft.",
        );
      }
    }
  } else {
    // Every NEW book starts as a private draft — full stop, regardless of
    // what input.status ultimately asks for. `books_author_insert` (RLS)
    // would refuse anything outside draft/in_review/unpublished here
    // anyway, but this function no longer even offers 'in_review' at
    // insert time: review is always the later, separate, validated step
    // below, never a value baked into the very first write.
    const { data, error } = await supabase
      .from("books")
      .insert({
        title: input.title,
        author: input.authorName,
        author_id: userId,
        available_languages: [input.sourceLanguage],
        total_chunks: chunks.length,
        source_language: input.sourceLanguage,
        description: input.summary,
        ...(input.genre ? { genre: input.genre } : {}),
        ...(input.coverUrl ? { cover_url: input.coverUrl } : {}),
        status: "draft",
        access_type: input.isPaid ? "paid" : "free",
        subscription_price_usd: input.isPaid ? input.priceUsd : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Couldn't save the book: ${error.message}`);
    bookId = (data as { id: string }).id;
  }

  if (!skipChunkInsert) {
    // Single statement, one array body → one SQL multi-row INSERT, which
    // Postgres executes atomically: either every chunk row is written or
    // none are. There is no partial-insert case to account for below, and
    // this can never produce duplicate rows as long as it only ever runs
    // against a book confirmed (just above) to have zero chunks yet.
    const chunkRows = chunks.map((content, i) => ({
      book_id: bookId,
      language: input.sourceLanguage,
      chunk_index: i,
      content,
      status: "published",
    }));
    let { error: chunkError } = await supabase.from("book_chunks").insert(chunkRows);

    if (chunkError && isMissingColumnError(chunkError, "status", "book_chunks")) {
      // `book_chunks.status` doesn't exist until migration 0001 is applied.
      // Narrowly scoped to exactly this signature (PGRST204 naming this
      // column on this table) — an authorization rejection, a check-
      // constraint violation, or any other failure shape falls through
      // unchanged to the handling below instead of being retried, and this
      // fallback never omits anything except the one column already known
      // to not exist yet; it does not touch `status`'s security-relevant
      // counterpart (there isn't one here — book_chunks has no RLS clause
      // that reads its own `status` until migration 0007, only the parent
      // book's `status`/`author_id`, both still enforced identically by
      // this insert's own RLS policy either way). Mirrors the same
      // schema-tolerant retry already used on the read side
      // (src/lib/reader.server.ts's getReaderChunk). Once migration 0001
      // lands, the first attempt above succeeds and this branch stops
      // running.
      ({ error: chunkError } = await supabase.from("book_chunks").insert(
        chunkRows.map(({ status: _status, ...rest }) => rest),
      ));
    }

    if (chunkError) {
      // The manuscript text genuinely did not save. The book row above —
      // whether freshly created or resumed via existingBookId — is left
      // exactly as it already was: 'draft'. It was never anything else,
      // so there is nothing to demote and nothing that depends on a
      // second operation succeeding. Never deleted, never silently
      // retried with different content — the author retries deliberately,
      // by passing this same bookId back in, once whatever caused this
      // (a genuinely different failure than the known schema gap above,
      // or that fallback itself failing) has been addressed.
      throw new ManuscriptSaveError(bookId, chunkError.message);
    }
  }

  // Validate before transitioning — re-fetch and exactly compare against
  // the database rather than trusting "the insert above didn't error".
  // Checks every expected index is present exactly once, the language
  // matches, content is non-empty, and content matches byte-for-byte —
  // not just a total row count, which a same-count-but-wrong-content
  // state (extremely unlikely from this function's own atomic insert, but
  // not something to simply assume) would otherwise pass silently.
  if (!verifiedRows) verifiedRows = await fetchSavedChunks(bookId);
  if (!savedChunksMatch(verifiedRows, chunks, input.sourceLanguage)) {
    const detail =
      verifiedRows.length !== chunks.length
        ? `only ${verifiedRows.length} of ${chunks.length} pages saved`
        : "saved content doesn't match what was submitted";
    throw new ManuscriptSaveError(bookId, detail);
  }

  if (input.status === "in_review") {
    // The only place `status` ever moves to 'in_review' for an author's
    // own write — a separate, explicit, already-validated step, never
    // bundled into the original insert or run before the check above.
    // `.eq("status", "draft")` makes this a compare-and-swap: it can only
    // ever move a book OUT of 'draft', never re-trigger from any other
    // state, and matching zero rows (already transitioned, or no longer
    // owned) is treated as a real failure, not silently ignored. Self-
    // publication remains structurally impossible here regardless: RLS
    // (`books_author_update`'s WITH CHECK) only ever allows an author to
    // set `status` to draft/in_review/unpublished — 'published' is never
    // a value this function, or any author-facing code path, can write.
    const { data: transitioned, error: transitionError } = await supabase
      .from("books")
      .update({ status: "in_review" })
      .eq("id", bookId)
      .eq("author_id", userId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (transitionError) {
      throw new Error(
        `Your manuscript is saved as a draft, but couldn't be submitted for review: ${transitionError.message}. Nothing was lost — try submitting again from My Books.`,
      );
    }
    if (!transitioned) {
      throw new Error(
        "Couldn't submit for review — this draft may already have been submitted, or is no longer yours.",
      );
    }
  }

  const { data: finalRow, error: finalError } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single();
  if (finalError || !finalRow) {
    throw new Error(`Saved, but couldn't confirm the final state: ${finalError?.message ?? "not found"}`);
  }
  return finalRow as Book;
}

export async function listMyBooks(userId: string): Promise<Book[]> {
  if (userId !== DEMO_USER_ID) {
    try {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("author_id", userId)
        .order("created_at", { ascending: false });
      if (!error) return (data as Book[]) ?? [];
    } catch {
      // fall through
    }
  }
  return demoStore.getPublishedBooks().map((p) => p.book);
}

export async function setBookStatus(
  userId: string,
  bookId: string,
  status: "published" | "unpublished" | "draft" | "in_review",
): Promise<void> {
  if (userId === DEMO_USER_ID) {
    const published = demoStore.getPublishedBooks();
    const entry = published.find((p) => p.book.id === bookId);
    if (entry) {
      entry.book.status = status;
      demoStore.setPublishedBooks(published);
    }
    return;
  }
  const { error } = await supabase
    .from("books")
    .update({ status })
    .eq("id", bookId)
    .eq("author_id", userId);
  if (error) throw new Error(error.message);
}

export interface AuthorBookMetadataPatch {
  title?: string;
  author?: string;
  description?: string;
  genre?: string | null;
  coverUrl?: string | null;
}

// Statuses an author can already write to directly, per RLS
// (books_author_update's WITH CHECK, migration 0007) — the resulting row's
// status must be one of these no matter what changed. Anything else
// (published, approved, rejected, changes_requested) is not
// self-updatable by design: this is exactly why a metadata edit on one of
// those states must ALSO move status to 'in_review' in the same
// statement, below, or the whole update is refused by the database.
const AUTHOR_EDITABLE_STATUSES = new Set(["draft", "in_review", "unpublished"]);

/**
 * Author-facing metadata edit — title/author/description/genre/cover only,
 * matching exactly the column list migration 0011 grants `authenticated`
 * on `books` (access_type, subscription_price_usd, and every rights/review
 * column are excluded from that grant entirely, so an author literally
 * cannot set them through this or any other client call, regardless of
 * what this function's own TypeScript signature does or doesn't allow —
 * the database is the real boundary, not this file).
 *
 * "An edit to a published book's content or rights-sensitive metadata must
 * return it to review before the changed version can be published": since
 * RLS already refuses ANY author update that would leave status outside
 * draft/in_review/unpublished, a book currently published (or approved,
 * rejected, changes_requested — every other post-review state) can only
 * be edited by this function if the SAME update also moves status to
 * 'in_review' — so that's exactly what happens here, automatically,
 * whenever the book isn't already in one of the three self-editable
 * states. There is no path through this function that leaves a
 * previously-published book both edited AND still published.
 */
export async function editBookMetadata(
  userId: string,
  bookId: string,
  patch: AuthorBookMetadataPatch,
): Promise<void> {
  if (userId === DEMO_USER_ID) {
    const published = demoStore.getPublishedBooks();
    const entry = published.find((p) => p.book.id === bookId);
    if (entry) {
      if (patch.title !== undefined) entry.book.title = patch.title;
      if (patch.author !== undefined) entry.book.author = patch.author;
      if (patch.description !== undefined) entry.book.description = patch.description;
      if (patch.genre !== undefined) entry.book.genre = patch.genre;
      if (patch.coverUrl !== undefined) entry.book.cover_url = patch.coverUrl;
      demoStore.setPublishedBooks(published);
    }
    return;
  }

  const { data: current, error: readError } = await supabase
    .from("books")
    .select("status")
    .eq("id", bookId)
    .eq("author_id", userId)
    .single();
  if (readError) throw new Error(`Couldn't load this book: ${readError.message}`);

  const payload: {
    title?: string;
    author?: string;
    description?: string;
    genre?: string | null;
    cover_url?: string | null;
    status?: string;
  } = {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.author !== undefined ? { author: patch.author } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.genre !== undefined ? { genre: patch.genre } : {}),
    ...(patch.coverUrl !== undefined ? { cover_url: patch.coverUrl } : {}),
  };
  if (Object.keys(payload).length === 0) {
    throw new Error("No changes to save.");
  }
  if (!AUTHOR_EDITABLE_STATUSES.has(current.status)) {
    payload.status = "in_review";
  }

  const { error } = await supabase
    .from("books")
    .update(payload)
    .eq("id", bookId)
    .eq("author_id", userId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Author profiles (pen name, bio, avatar — public author page)
// ---------------------------------------------------------------------------

export interface AuthorProfile {
  user_id: string;
  pen_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

export async function getAuthorProfile(userId: string): Promise<AuthorProfile | null> {
  try {
    const { data, error } = await supabase
      .from("author_profiles")
      .select("user_id, pen_name, bio, avatar_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error) return (data as AuthorProfile | null) ?? null;
  } catch {
    // fall through
  }
  return null;
}

export async function saveAuthorProfile(
  userId: string,
  patch: Partial<Pick<AuthorProfile, "pen_name" | "bio" | "avatar_url">>,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const { error } = await supabase
      .from("author_profiles")
      .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save profile" };
  }
}

export async function listBooksByAuthorId(authorId: string): Promise<Book[]> {
  try {
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("author_id", authorId)
      .eq("status", "published");
    if (!error) return (data as Book[]) ?? [];
  } catch {
    // fall through
  }
  return [];
}
