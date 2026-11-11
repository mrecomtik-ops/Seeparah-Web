import type { Book } from "@/lib/data";

/** Genre labels may originate from the library's broad genre field or a
 * verified, explicitly assigned category. Do not infer genres from book text. */
export function matchesLibraryGenre(
  book: Pick<Book, "genre" | "categories">,
  selected: string | null | undefined,
): boolean {
  if (!selected) return true;
  return book.genre === selected || (book.categories ?? []).includes(selected);
}

/** Only offer genres/subjects that already occur on published books; this
 * avoids dead-end genre filters for editorial topics not yet stocked. */
export function publishedGenreFacetCounts(
  books: ReadonlyArray<Pick<Book, "genre" | "categories">>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const book of books) {
    const labels = new Set<string>();
    if (book.genre?.trim()) labels.add(book.genre.trim());
    for (const topic of book.categories ?? []) {
      if (topic.trim() && topic !== "Religious") labels.add(topic.trim());
    }
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}
