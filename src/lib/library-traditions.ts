import { isReligiousBook, type Book } from "@/lib/data";

/** Verified live Seeparah tradition labels, distinct from source collections
 * (Tanakh, Torah, Dhammapada) and literary theme categories.
 * Do not infer a religion from an author's name or unverified metadata.
 */
export const KNOWN_SACRED_TRADITIONS = [
  "Islam", "Christianity", "Judaism", "Buddhism", "Hinduism",
  "Daoism", "Confucian traditions", "Latter-day Saint tradition",
] as const;

export function publishedTraditions(books: readonly Book[]): string[] {
  return KNOWN_SACRED_TRADITIONS.filter((tradition) =>
    books.some((book) =>
      isReligiousBook(book) && (book.categories ?? []).includes(tradition)));
}

export function matchesPublishedTradition(book: Book, tradition: string | null): boolean {
  return !tradition || (isReligiousBook(book) &&
    (book.categories ?? []).includes(tradition) &&
    (KNOWN_SACRED_TRADITIONS as readonly string[]).includes(tradition));
}
