import { publicCatalogQaProjection } from "@/lib/catalog-qa-public";

const PAGE_SIZE = 500;
const MAX_PAGES = 40; // 20,000 rows; fail rather than truncate at larger size
const BOOK_FIELDS = "id,title,author,status,source_scan_id,source_language,source_version,original_publication_year,cover_url";
const REVIEW_FIELDS = "book_id,priority,status,source_chapter_pattern_chunks,stored_chapter_nodes,first_source_chapter_chunk,first_toc_chapter_chunk";

/** Public projection ONLY. The service-role client never leaves Cloudflare.
 * The publication-gated allowlist strips every private property before
 * serialization, including admin QA notes and old erroneous publication years.
 */
export async function servePublicCatalogQa(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from(table: string): any };
    async function readAll(table: string, columns: string, orderBy: string, status?: "published" | "reviewed") {
      const rows: Record<string, unknown>[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        let q = db.from(table).select(columns).order(orderBy, { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (status === "published") q = q.eq("status", "published");
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
