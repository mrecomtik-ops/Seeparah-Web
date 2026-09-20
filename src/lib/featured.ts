import type { Book } from "@/lib/data";
import { FEATURED_BOOK_ID } from "@/lib/covers";

/**
 * Picks a book to feature on the homepage/library, from a REAL fetched
 * books array only — never fabricates or falls back to demo data. Prefers
 * FEATURED_BOOK_ID if a real published book happens to have that id,
 * otherwise the first result; returns undefined on an empty catalog so
 * callers can render an honest empty state instead of a fake entry.
 */
export function pickFeaturedBook(books: Book[]): Book | undefined {
  return books.find((b) => b.id === FEATURED_BOOK_ID) ?? books[0];
}
