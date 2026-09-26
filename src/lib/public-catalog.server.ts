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

export async function searchPublicBooks(query: string): Promise<Book[]> {
  const q = query.trim();
  if (!q) return [];
  const escaped = q.replace(/[%_]/g, (char) => `\\${char}`);
  const db = await admin();
  const { data, error } = await db
    .from("books")
    .select(PUBLIC_BOOK_COLUMNS)
    .eq("status", "published")
    .or(`title.ilike.%${escaped}%,author.ilike.%${escaped}%`)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(asPublicBook);
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
