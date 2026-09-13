import { supabase } from "@/integrations/supabase/client";
import { getReaderChunk as fetchReaderChunk, activateSubscription } from "@/lib/reader.functions";
import { splitManuscript } from "@/lib/manuscript";
import { dedupeAgainstSeed } from "@/lib/catalog";
import {
  DEMO_BOOKS,
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
 * Merges locally-published demo books with the fixed seed catalog. A
 * locally-published book that matches a seed title+author exactly (e.g. the
 * "Load sample book" button was used) is treated as a duplicate of the seed
 * entry, not a second catalog listing — the richer seed entry (real cover,
 * consistent access terms) wins. This does not touch any real user data;
 * it only dedupes the on-device demo store against the fixed demo catalog.
 */
function demoBooksMerged(): Book[] {
  const published = dedupeAgainstSeed(DEMO_BOOKS, demoStore.getPublishedBooks().map((p) => p.book));
  return [...published, ...DEMO_BOOKS];
}

export async function listBooks(): Promise<Book[]> {
  try {
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = (data as Book[]) ?? [];
    return rows.length ? rows : demoBooksMerged().filter((b) => b.status === "published");
  } catch {
    return demoBooksMerged().filter((b) => b.status === "published");
  }
}

export async function getBook(id: string): Promise<Book | null> {
  try {
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as Book;
  } catch {
    // fall through to demo
  }
  return demoBooksMerged().find((b) => b.id === id) ?? null;
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
): Promise<Highlight> {
  const row: Highlight = {
    id: crypto.randomUUID(),
    user_id: userId,
    book_id: bookId,
    language,
    chunk_index: chunkIndex,
    highlight_text: text,
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
 * Creates or replaces a book's draft/submission. Draft and in-review saves
 * never touch a book that's already published — publishing an edit is a
 * separate, explicit action (see setBookStatus), so a work-in-progress
 * revision can never leak into what readers currently see.
 *
 * For a signed-in (non-demo) author, a real database failure is surfaced as
 * an error rather than silently falling back to on-device demo storage —
 * silently saving "published" work only in the author's own browser would
 * misrepresent what actually happened.
 */
export async function publishBook(userId: string, input: PublishInput): Promise<Book> {
  if (input.status !== "draft" && !input.rightsConfirmed) {
    throw new Error("Rights confirmation is required before submitting for review");
  }
  const chunks = splitManuscript(input.manuscript);
  const book: Book = {
    id: crypto.randomUUID(),
    title: input.title,
    author: input.authorName,
    author_id: userId === DEMO_USER_ID ? null : userId,
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

  if (userId !== DEMO_USER_ID) {
    const { data, error } = await supabase
      .from("books")
      .insert({
        title: book.title,
        author: book.author,
        author_id: userId,
        available_languages: book.available_languages,
        total_chunks: book.total_chunks,
        source_language: book.source_language,
        description: book.description,
        ...(book.genre ? { genre: book.genre } : {}),
        ...(book.cover_url ? { cover_url: book.cover_url } : {}),
        status: book.status,
        access_type: book.access_type,
        subscription_price_usd: book.subscription_price_usd,
      })
      .select()
      .single();
    if (error) throw new Error(`Couldn't save the book: ${error.message}`);
    const saved = data as Book;
    const { error: chunkError } = await supabase.from("book_chunks").insert(
      chunks.map((content, i) => ({
        book_id: saved.id,
        language: input.sourceLanguage,
        chunk_index: i,
        content,
        status: "published",
      })),
    );
    if (chunkError) throw new Error(`Book saved, but the manuscript text failed to save: ${chunkError.message}`);
    return saved;
  }

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
