// Server-only public catalog boundary.
// Public readers never query public.books directly. This module returns only
// reader-safe bibliographic fields and deliberately excludes rights/review,
// operator notes, reviewer ids, rejection reasons and other internal columns.
import type { Book } from "@/lib/data";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const PUBLIC_BOOK_COLUMNS = [
  "id",
  "title",
  "author",
  "author_id",
  "cover_url",
  "available_languages",
  "total_chunks",
  "source_language",
  "description",
  "genre",
  "categories",
  "status",
  "access_type",
  "subscription_price_usd",
  "created_at",
  "edition_title",
  "edition_year",
  "publisher",
  "isbn",
  "original_publication_year",
  "word_count",
  "estimated_reading_minutes",
  "content_classification",
  "typography_profile",
  "authenticity_notes",
].join(",");

function asPublicBook(row: unknown): Book {
  return row as Book;
}

export async function listPublicBooks(): Promise<Book[]> {
  const db = await admin();
  const { data, error } = await db
    .from("books")
    .select(PUBLIC_BOOK_COLUMNS)
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(asPublicBook);
}

export async function getPublicBook(bookId: string): Promise<Book | null> {
  const db = await admin();
  const { data, error } = await db
    .from("books")
    .select(PUBLIC_BOOK_COLUMNS)
    .eq("id", bookId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asPublicBook(data) : null;
}

export function literalIlikePattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

export async function searchPublicBooks(query: string): Promise<Book[]> {
  const q = query.trim();
  if (!q) return [];

  // Supabase .or() accepts raw PostgREST filter syntax. User punctuation
  // such as commas/parentheses can therefore become filter grammar if
  // interpolated into .or(). Use two ordinary ilike filters instead and
  // merge the rows server-side so reader input is always a value, never
  // executable filter syntax.
  const pattern = literalIlikePattern(q);
  const db = await admin();
  const [titleResult, authorResult] = await Promise.all([
    db
      .from("books")
      .select(PUBLIC_BOOK_COLUMNS)
      .eq("status", "published")
      .ilike("title", pattern)
      .order("created_at", { ascending: true }),
    db
      .from("books")
      .select(PUBLIC_BOOK_COLUMNS)
      .eq("status", "published")
      .ilike("author", pattern)
      .order("created_at", { ascending: true }),
  ]);

  if (titleResult.error) throw new Error(titleResult.error.message);
  if (authorResult.error) throw new Error(authorResult.error.message);

  const rows = new Map<string, Book>();
  for (const row of [...(titleResult.data ?? []), ...(authorResult.data ?? [])]) {
    const book = asPublicBook(row);
    rows.set(book.id, book);
  }

  return [...rows.values()].sort((a, b) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
  );
}


export async function listPublicBooksByAuthorId(authorId: string): Promise<Book[]> {
  const db = await admin();
  const { data, error } = await db
    .from("books")
    .select(PUBLIC_BOOK_COLUMNS)
    .eq("author_id", authorId)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(asPublicBook);
}
