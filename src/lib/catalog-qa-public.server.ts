import { publicCatalogQaProjection } from "@/lib/catalog-qa-public";

const PAGE_SIZE = 500;
const MAX_PAGES = 40; // 20,000 rows; fail rather than truncate at larger size
const BOOK_FIELDS = "id,title,author,status,source_scan_id,source_language,source_version,original_publication_year,cover_url";
const REVIEW_FIELDS = "book_id,priority,status,source_chapter_pattern_chunks,stored_chapter_nodes,first_source_chapter_chunk,first_toc_chapter_chunk";

/** V2 paginated, publication-filtered QA response. This avoids loading 75k
 * book rows into one Worker response and never exposes private SQL evidence. */
async function servePagedCatalogQa(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const pageRaw = params.get("page") ?? "1";
  if (!["books", "reviews", "years", "inventory"].includes(kind ?? "") ||
      !/^[1-9]\d{0,3}$/u.test(pageRaw)) {
    return new Response("Invalid QA page", { status: 400 });
  }
  const page = Number(pageRaw);
  if (kind === "inventory" && page !== 1) {
    return new Response("Invalid inventory page", { status: 400 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from(table: string): any };
  const { data: importer, error: stateError } = await db
    .from("gutenberg_autopilot_settings")
    .select("enabled,target_published,batch_size").eq("id", 1).single();
  if (stateError || !importer) throw new Error("Publication pause state unavailable");

  if (kind === "inventory") {
    const statuses = ["queued", "processing", "in_review", "failed", "published", "skipped"];
    const [count, progress, ...jobResults] = await Promise.all([
      db.from("gutenberg_catalog_inventory").select("gutenberg_id", { count: "exact", head: true }),
      db.from("gutenberg_discovery_state").select(
        "enabled,catalog_offset,processed_rows,completed_at,last_success_at,last_error,batch_size"
      ).eq("id", 1).maybeSingle(),
      ...statuses.map((status) => db.from("gutenberg_import_jobs")
        .select("id", { count: "exact", head: true }).eq("status", status)),
    ]);
    if (count.error || progress.error || !progress.data || jobResults.some((r) => r.error))
      throw new Error("Gutenberg inventory checkpoint / queue metrics unavailable");
    const queue = Object.fromEntries(statuses.map((name, i) =>
      [name, Number(jobResults[i]?.count ?? 0)]));
    return jsonQa({
      version: 2, scope: "published-catalogue-page", kind, page, hasMore: false,
      rows: [], importer: {
        enabled: importer.enabled === true,
        target_published: Number(importer.target_published || 0),
        batch_size: Number(importer.batch_size || 0),
      },
      discovery: {
        enabled: progress.data.enabled === true,
        inventoryRecords: Number(count.count ?? 0),
        catalogOffset: Number(progress.data.catalog_offset ?? 0),
        processedRows: Number(progress.data.processed_rows ?? 0),
        completed: Boolean(progress.data.completed_at),
        batchSize: Number(progress.data.batch_size ?? 0),
        hasError: Boolean(progress.data.last_error),
      },
      queue,
    });
  }

  const start = (page - 1) * PAGE_SIZE;
  let result: { data: any[] | null; error: { message: string } | null };
  if (kind === "books") {
    result = await db.from("books").select(BOOK_FIELDS)
      .eq("status", "published").order("id").range(start, start + PAGE_SIZE - 1);
  } else if (kind === "reviews") {
    result = await db.from("qa_20261110_gutenberg_structure_candidates")
      .select(REVIEW_FIELDS)
      .in("status", ["requires_manual_source_review", "navigation_repaired_pending_visual_qa"])
      .order("book_id").range(start, start + PAGE_SIZE - 1);
  } else {
    result = await db.from("qa_20261111_unverified_publication_year_backups")
      .select("book_id").is("verified_at", null)
      .order("book_id").range(start, start + PAGE_SIZE - 1);
  }
  if (result.error || !Array.isArray(result.data))
    throw new Error("Published QA page unavailable");

  const candidates = result.data;
  let published = kind === "books" ? candidates : [];
  if (kind !== "books" && candidates.length) {
    const ids = candidates.map((r) => r.book_id).filter((id) => typeof id === "string");
    const found = await db.from("books").select(BOOK_FIELDS).eq("status", "published").in("id", ids);
    if (found.error || !Array.isArray(found.data)) throw new Error("Published review join failed");
    published = found.data;
  }

  const visible = published.length
    ? publicCatalogQaProjection({
      books: published,
      reviews: kind === "reviews" ? candidates : [],
      oldYears: kind === "years" ? candidates : [],
      importer,
    })
    : { books: [], reviews: [], oldYears: [] };
  const rows = kind === "books" ? visible.books
    : kind === "reviews" ? visible.reviews : visible.oldYears;
  return jsonQa({
    version: 2, scope: "published-catalogue-page",
    kind, page, hasMore: candidates.length === PAGE_SIZE,
    rows, hiddenUnpublishedYearRows: kind === "years" ? candidates.length - rows.length : 0,
  });
}

function jsonQa(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=120",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Public projection ONLY. The service-role client never leaves Cloudflare.
 * The publication-gated allowlist strips every private property before
 * serialization, including admin QA notes and old erroneous publication years.
 */
export async function servePublicCatalogQa(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  }
  try {
    if (new URL(request.url).searchParams.has("kind")) {
      return await servePagedCatalogQa(request);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from(table: string): any };
    async function readAll(table: string, columns: string, orderBy: string, status?: "published" | "reviewed") {
      const rows: Record<string, unknown>[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        let q = db.from(table).select(columns).order(orderBy, { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (status === "published") q = q.eq("status", "published");
        if (table === "qa_20261111_unverified_publication_year_backups") q = q.is("verified_at", null);
        if (status === "reviewed") q = q.in("status",
          ["requires_manual_source_review", "navigation_repaired_pending_visual_qa"]);
        const result = await q;
        if (result.error) throw new Error("QA publication snapshot unavailable: " + result.error.message);
        if (!Array.isArray(result.data)) throw new Error("QA query returned invalid data");
        rows.push(...result.data);
        if (result.data.length < PAGE_SIZE) return rows;
      }
      throw new Error("QA snapshot safety bound exceeded for " + table);
    }
    const [books, reviews, oldYears, settings] = await Promise.all([
      readAll("books", BOOK_FIELDS, "id", "published"),
      readAll("qa_20261110_gutenberg_structure_candidates", REVIEW_FIELDS, "book_id", "reviewed"),
      readAll("qa_20261111_unverified_publication_year_backups", "book_id", "book_id"),
      db.from("gutenberg_autopilot_settings").select("id,enabled,target_published,batch_size")
        .eq("id", 1).single(),
    ]);
    if (settings.error) throw new Error("Importer state query failed: " + settings.error.message);
    const body = publicCatalogQaProjection({ books, reviews, oldYears, importer: settings.data });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[catalog-qa] Public projection failed:", error instanceof Error ? error.message : "Unknown error");
    return new Response(JSON.stringify({ error: "QA summary temporarily unavailable" }), {
      status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
