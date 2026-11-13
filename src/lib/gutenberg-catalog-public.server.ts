/**
 * Public, read-only Gutenberg discovery catalogue.
 *
 * This endpoint makes the already-imported 78k+ bibliographic identities
 * discoverable without misrepresenting metadata as hosted full manuscripts.
 * Books without an independently approved Seeparah publication link only to
 * the official Gutenberg ebook landing page. No rights or admin data leak.
 */
export const GUTENBERG_CATALOG_PAGE_SIZE = 32;

export function parseGutenbergCatalogQuery(
  searchParams: URLSearchParams,
): { page: number; search: string; language: string | null } {
  const rawPage = searchParams.get("page") ?? "1";
  const rawSearch = (searchParams.get("q") ?? "").trim().replace(/\s+/gu, " ");
  const rawLanguage = (searchParams.get("lang") ?? "").trim().toLowerCase();
  if (!/^[1-9]\d{0,3}$/u.test(rawPage) || Number(rawPage) > 4000) {
    throw new Error("Invalid Gutenberg catalogue page");
  }
  // Only allow ordinary bibliographic characters in the PostgREST OR filter.
  // Percent, underscores, commas, parentheses and separators cannot become
  // wildcard expressions or alter the query grammar.
  if (rawSearch.length > 80 ||
      (rawSearch && !/^[\p{L}\p{N}\s.'’:\-]+$/u.test(rawSearch))) {
    throw new Error("Invalid Gutenberg catalogue search");
  }
  if (rawLanguage && !/^[a-z]{2,3}(?:-[a-z]{2,4})?$/u.test(rawLanguage)) {
    throw new Error("Invalid Gutenberg catalogue language");
  }
  return {
    page: Number(rawPage),
    search: rawSearch,
    language: rawLanguage || null,
  };
}

type InventoryRow = {
  gutenberg_id: number;
  title: string;
  author_raw: string;
  language_codes: string[];
  catalog_issued: string | null;
  subjects: string | null;
};
type HostedRow = { id: string; source_scan_id: string | null };
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function serveGutenbergCatalog(request: Request): Promise<Response> {
  let filters: ReturnType<typeof parseGutenbergCatalogQuery>;
  try {
    filters = parseGutenbergCatalogQuery(new URL(request.url).searchParams);
  } catch {
    return json({ error: "Invalid catalogue search or page" }, 400);
  }

  const { supabaseAdmin } = await import("./integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from(table: string): any };
  let query = db.from("gutenberg_catalog_inventory")
    .select("gutenberg_id,title,author_raw,language_codes,catalog_issued,subjects", {
      count: "exact",
    });
  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,author_raw.ilike.%${filters.search}%`,
    );
  }
  if (filters.language) {
    query = query.contains("language_codes", [filters.language]);
  }
  const offset = (filters.page - 1) * GUTENBERG_CATALOG_PAGE_SIZE;
  const { data, error, count } = await query
    .order("gutenberg_id", { ascending: true })
    .range(offset, offset + GUTENBERG_CATALOG_PAGE_SIZE - 1);
  if (error) {
    console.error("[gutenberg-catalog] public catalog query failed", error.message);
    return json({ error: "Gutenberg catalogue temporarily unavailable" }, 503);
  }

  const entries = (data ?? []) as InventoryRow[];
  const sourceIds = entries.map((row) => "gutenberg:" + row.gutenberg_id);
  const hosted = new Map<string, string>();
  if (sourceIds.length) {
    // Only confirm titles that are ACTUALLY published. Never leak private
    // in-review book IDs, rights flags, queued jobs or staff records.
    const { data: books, error: booksError } = await db.from("books")
      .select("id,source_scan_id")
      .eq("status", "published")
      .in("source_scan_id", sourceIds);
    if (booksError) {
      console.error("[gutenberg-catalog] hosted book lookup failed", booksError.message);
      return json({ error: "Published book cross-check unavailable" }, 503);
    }
    for (const book of (books ?? []) as HostedRow[]) {
      if (book.source_scan_id) hosted.set(book.source_scan_id, book.id);
    }
  }
  return json({
    page: filters.page,
    pageSize: GUTENBERG_CATALOG_PAGE_SIZE,
    total: count ?? 0,
    hasMore: offset + entries.length < (count ?? 0),
    items: entries.map((item) => ({
      id: item.gutenberg_id,
      title: item.title || "Untitled Gutenberg record",
      author: item.author_raw || "Author not listed",
      languages: item.language_codes ?? [],
      issued: item.catalog_issued,
      subjects: item.subjects,
      seeparahBookId: hosted.get("gutenberg:" + item.gutenberg_id) ?? null,
    })),
  });
}
