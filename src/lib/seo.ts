/** JSON safe to embed inside an HTML <script type="application/ld+json"> tag. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** The sacred detail route is the canonical public reference for all
 * religious editions; keep /book/:id usable for legacy links, but never
 * emit two competing canonical pages for a single sacred source. */
export function canonicalBookUrl(book: {
  id: string;
  content_classification?: string | null;
  categories?: readonly string[] | null;
}): string {
  const sacred = book.content_classification === "religious" ||
    (book.categories ?? []).includes("Religious");
  return `https://seeparah.com/${sacred ? "sacred-texts" : "book"}/${book.id}`;
}
