/** Only allowlisted bibliographic fields of ALREADY PUBLISHED books.
 * Never serialize raw Supabase rows, unpublished titles, user identifiers,
 * rights dossiers, private QA notes, original metadata backups, or secrets.
 */
type DatabaseRow = Record<string, unknown>;
const reviewStates = new Set(["requires_manual_source_review","navigation_repaired_pending_visual_qa"]);
const asString = (v: unknown): string => typeof v === "string" ? v : "";
const asNullableString = (v: unknown): string | null => typeof v === "string" ? v : null;
const asInt = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) ? v : null;

export function publicCatalogQaProjection(source: {
  books: DatabaseRow[];
  reviews: DatabaseRow[];
  oldYears: DatabaseRow[];
  importer: DatabaseRow | null;
}) {
  if (!source.importer || !Array.isArray(source.books) || source.books.length === 0)
    throw new Error("Production catalogue or importer settings unavailable");
  const books = source.books.filter(b => b.status === "published" && typeof b.id === "string")
    .map(b => ({
      id: asString(b.id), title: asString(b.title), author: asString(b.author),
      status: "published" as const, source_scan_id: asNullableString(b.source_scan_id),
      source_language: asNullableString(b.source_language), source_version: asInt(b.source_version),
      original_publication_year: asInt(b.original_publication_year),
      cover_url: asNullableString(b.cover_url),
    }));
  if (!books.length) throw new Error("No published catalogue rows");
  const visibleIds = new Set(books.map(b => b.id));
  const reviews = source.reviews.filter(r => visibleIds.has(asString(r.book_id)) &&
    reviewStates.has(asString(r.status))).map(r => ({
    book_id: asString(r.book_id),
    book_title: books.find(b => b.id === r.book_id)?.title ?? "",
    priority: asString(r.priority), status: asString(r.status),
    source_chapter_pattern_chunks: asInt(r.source_chapter_pattern_chunks),
    stored_chapter_nodes: asInt(r.stored_chapter_nodes),
    first_source_chapter_chunk: asInt(r.first_source_chapter_chunk),
    first_toc_chapter_chunk: asInt(r.first_toc_chapter_chunk),
  }));
  const oldYears = source.oldYears.filter(y => visibleIds.has(asString(y.book_id)))
    .map(y => ({ book_id: asString(y.book_id) }));
  const i = source.importer;
  return { version: 1, scope: "published-catalogue-only" as const,
    books, reviews, oldYears, importer: {
      enabled: i.enabled === true,
      target_published: asInt(i.target_published) ?? 0,
      batch_size: asInt(i.batch_size) ?? 0,
    },
  };
}
