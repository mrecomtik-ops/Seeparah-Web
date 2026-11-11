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
  "source_url",
  "source_edition_id",
  "attribution",
  "translator",
  "editor",
  "source_revision",
  "reuse_notice",
].join(",");

/** Facet/search metadata only. Full edition/citation fields for the visible
 * 24 cards are requested separately, avoiding an unbounded full-card payload.
 * Server-side publication gate remains the same as all public catalog views.
 */
const LIBRARY_INDEX_COLUMNS = [
  "id", "title", "author", "cover_url", "source_edition_id",
  "available_languages", "total_chunks", "source_language",
  // Summaries are often the largest bibliographic field and do not affect
  // filtering; fetch them only for a visible 24-card page or featured title.
  "genre", "categories", "status", "access_type",
  "content_classification", "created_at",
].join(",");

/** Fetch every page deterministically; never silently truncate at Supabase's 1,000-row limit. */
async function pagedPublishedBooks(
  columns: string,
  options: { authorId?: string; authorSearch?: string; titleSearch?: string; descending?: boolean } = {},
): Promise<Book[]> {
  const db = await admin();
  const books: Book[] = [];
  const pageSize = 500;
  for (let start = 0; start < 100_000; start += pageSize) {
    let query = db.from("books").select(columns).eq("status", "published");
    if (options.authorId) query = query.eq("author_id", options.authorId);
    if (options.authorSearch) query = query.ilike("author", options.authorSearch);
    if (options.titleSearch) query = query.ilike("title", options.titleSearch);
    const { data, error } = await query
      .order("created_at", { ascending: !options.descending })
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw new Error(error.message);
    books.push(...(data ?? []).map(asPublicBook));
    if ((data ?? []).length < pageSize) return books;
  }
  throw new Error("Published catalogue exceeds the configured pagination safety limit.");
}

export async function listPublicLibraryIndex(): Promise<Book[]> {
  return pagedPublishedBooks(LIBRARY_INDEX_COLUMNS);
}

/** Exact bounded materialization of one 24-card Library page.
 * Preserve the caller's stable filtered/sorted order and never return
 * unpublished titles, even if an ID is supplied directly.
 */
export async function getPublicLibraryPage(ids: string[]): Promise<Book[]> {
  if (ids.length === 0) return [];
  if (ids.length > 24) throw new Error("A Library page may contain at most 24 books.");
  const db = await admin();
  const { data, error } = await db.from("books")
    .select(PUBLIC_BOOK_COLUMNS)
    .eq("status", "published")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const rows = new Map<string, Book>();
  for (const raw of data ?? []) {
    const book = asPublicBook(raw);
    rows.set(book.id, book);
  }
  return ids.flatMap((id) => rows.has(id) ? [rows.get(id)!] : []);
}

/** Do not present a guessed first-print date as verified.
 * The automated Gutenberg importer used one unreliable Open Library field:
 * internal provenance must be independently re-audited before a date is
 * restored to the public catalogue. This projection changes no stored data. */
export function sanitizedPublicBook(row: Book): Book {
  const description = String(row.description ?? "");
  // QA-001 bulk remediation removed fabricated prose without inventing a
  // replacement year. The stored numeric year is also uncorroborated and
  // must not be sent to readers as if it were a verified fact.
  if (/first-publication year has not been independently corroborated/i.test(description)) {
    return { ...row, original_publication_year: null };
  }
  if (!/This sourced English-language reading edition presents the full original work\.\s+Source subject classifications:/i.test(description)) {
    return row;
  }
  const author = String(row.author ?? "").replace(/^([^,]+),\s*([^,(]+).*$/, "$2 $1").trim();
  return {
    ...row,
    original_publication_year: null,
    description: `${row.title} by ${author}. This source-based reading edition preserves the acquired text; the original publication date and edition details require independent bibliographic verification. Source: Project Gutenberg.`,
  };
}

function asPublicBook(row: unknown): Book {
  return sanitizedPublicBook(row as Book);
}

export async function listPublicBooks(): Promise<Book[]> {
  return pagedPublishedBooks(PUBLIC_BOOK_COLUMNS);
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
  // Use the family-name token for index lookups, then check the complete
  // normalized display name. "Charles Dickens" must match "Dickens, Charles".
  const authorToken = (q.includes(",") ? q.split(",")[0] : q.split(/\s+/).at(-1))?.trim() ?? q;
  const [titleRows, authorRows] = await Promise.all([
    pagedPublishedBooks(PUBLIC_BOOK_COLUMNS, { titleSearch: pattern }),
    pagedPublishedBooks(PUBLIC_BOOK_COLUMNS, { authorSearch: literalIlikePattern(authorToken) }),
  ]);
  const { formatAuthorName } = await import("@/lib/author-name");
  const normalized = (value: string) =>
    value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const needle = normalized(q);
  const rows = new Map<string, Book>();
  for (const book of [...titleRows, ...authorRows]) {
    if (normalized(book.title).includes(needle) ||
        normalized(book.author).includes(needle) ||
        normalized(formatAuthorName(book.author)).includes(needle)) {
      rows.set(book.id, book);
    }
  }
  return [...rows.values()].sort((a, b) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
  );
}


/** Only opt-in public author presentation, not the underlying account UUID.
 * Anonymous users must not access author_profiles directly; public profile
 * projection is available only after a published book references this author.
 * The separate owner editing workflow continues to use its own RLS account. */
export type PublicAuthorProfile = {
  pen_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

/** Never project authentication IDs or unpublished account metadata. */
export function asPublicAuthorProfile(value: Record<string, unknown>): PublicAuthorProfile {
  return {
    pen_name: typeof value["pen_name"] === "string" ? value["pen_name"] : null,
    bio: typeof value["bio"] === "string" ? value["bio"] : null,
    avatar_url: typeof value["avatar_url"] === "string" ? value["avatar_url"] : null,
  };
}

export async function getPublicAuthorProfile(authorId: string): Promise<PublicAuthorProfile | null> {
  const db = await admin();
  const { data: published, error: publicationError } = await db.from("books")
    .select("id")
    .eq("author_id", authorId)
    .eq("status", "published")
    .limit(1).maybeSingle();
  if (publicationError) throw new Error(publicationError.message);
  if (!published) return null;
  const { data, error } = await db.from("author_profiles")
    .select("pen_name,bio,avatar_url")
    .eq("user_id", authorId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asPublicAuthorProfile(data) : null;
}

export async function listPublicBooksByAuthorId(authorId: string): Promise<Book[]> {
  return pagedPublishedBooks(PUBLIC_BOOK_COLUMNS, { authorId, descending: true });
}
