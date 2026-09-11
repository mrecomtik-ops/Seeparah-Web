import { supabase } from "@/integrations/supabase/client";
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

export async function currentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

function demoBooksMerged(): Book[] {
  const published = demoStore.getPublishedBooks().map((p) => p.book);
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
    return (data as Book[]) ?? [];
  } catch {
    return demoBooksMerged();
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

export async function getChunk(
  bookId: string,
  language: string,
  chunkIndex: number,
): Promise<Chunk | null> {
  try {
    const { data, error } = await supabase
      .from("book_chunks")
      .select("*")
      .eq("book_id", bookId)
      .eq("language", language)
      .eq("chunk_index", chunkIndex)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as Chunk;
  } catch {
    // fall through to demo
  }
  const demo =
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
      );
  return demo ?? null;
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
      if (!error) return;
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
    try {
      const { error } = await supabase.from("user_subscriptions").upsert(row);
      if (!error) return row;
    } catch {
      // fall through
    }
  }
  const rows = demoStore.getSubscriptions();
  rows.push(row);
  demoStore.setSubscriptions(rows);
  return row;
}

export interface PublishInput {
  title: string;
  authorName: string;
  sourceLanguage: string;
  summary: string;
  manuscript: string;
  isPaid: boolean;
  priceUsd: number | null;
}

export function splitManuscript(text: string): string[] {
  const byChapter = text
    .split(/\n(?=(?:chapter|باب|अध्याय|الفصل)\s)/im)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byChapter.length > 1) return byChapter;
  const paragraphs = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < paragraphs.length; i += 4) {
    chunks.push(paragraphs.slice(i, i + 4).join("\n\n"));
  }
  return chunks.length ? chunks : [text.trim()];
}

export async function publishBook(
  userId: string,
  input: PublishInput,
): Promise<Book> {
  const chunks = splitManuscript(input.manuscript);
  const book: Book = {
    id: crypto.randomUUID(),
    title: input.title,
    author: input.authorName,
    author_id: userId === DEMO_USER_ID ? null : userId,
    cover_url: null,
    available_languages: [input.sourceLanguage],
    total_chunks: chunks.length,
    source_language: input.sourceLanguage,
    description: input.summary,
    status: "published",
    access_type: input.isPaid ? "paid" : "free",
    subscription_price_usd: input.isPaid ? input.priceUsd : null,
    created_at: new Date().toISOString(),
  };

  if (userId !== DEMO_USER_ID) {
    try {
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
          status: "published",
          access_type: book.access_type,
          subscription_price_usd: book.subscription_price_usd,
        })
        .select()
        .single();
      if (error) throw error;
      const saved = data as Book;
      const { error: chunkError } = await supabase.from("book_chunks").insert(
        chunks.map((content, i) => ({
          book_id: saved.id,
          language: input.sourceLanguage,
          chunk_index: i,
          content,
        })),
      );
      if (chunkError) throw chunkError;
      return saved;
    } catch {
      // fall through to demo publish so the flow never crashes
    }
  }

  const published = demoStore.getPublishedBooks();
  published.push({
    book,
    chunks: chunks.map((content, i) => ({
      book_id: book.id,
      language: input.sourceLanguage,
      chunk_index: i,
      content,
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
