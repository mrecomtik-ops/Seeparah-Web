import type { Book } from "@/lib/data";
import { canonicalAuthorKey } from "@/lib/author-name";

/** Distinct Gutenberg source editions can be legitimate. Group likely
 * duplicates for human review and clearly label them in Library; never
 * unpublish, merge, or overwrite a rights-reviewed source automatically. */
export function publishedEditionVariantCounts(
  books: ReadonlyArray<Pick<Book,"id"|"title"|"author"|"source_edition_id">>,
): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const book of books) {
    if (!/^gutenberg:\d+$/i.test(book.source_edition_id ?? "")) continue;
    const title = book.title.normalize("NFKD").toLocaleLowerCase()
      .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
    const author = canonicalAuthorKey(book.author);
    if (title.length < 8 || author.length < 3) continue;
    const key = title + ":" + author;
    const list = groups.get(key) ?? [];
    list.push(book.id);
    groups.set(key, list);
  }
  const result = new Map<string, number>();
  for (const ids of groups.values()) if (ids.length > 1)
    for (const id of ids) result.set(id, ids.length);
  return result;
}
