import { INSIGHT_ARTICLES } from "@/lib/insights";
import { buildSitemapXml, type SitemapEntry } from "@/lib/sitemap";
import { buildSitemapIndexXml, sitemapPageBounds, sitemapPageCount } from "@/lib/sitemap-index";

const ROOT = "https://seeparah.com";
const headers = { "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, max-age=300, s-maxage=3600" };
function xml(data: string): Response { return new Response(data, { headers }); }
function unavailable(error: unknown): Response {
  console.error("[sitemap] fetch failed", error);
  return new Response("Sitemap temporarily unavailable", {
    status: 503, headers: { "retry-after": "300", "cache-control": "no-store" },
  });
}

/** 10k books => 20 independently fetched 500-row sitemap pages.
 * No more full-catalogue Supabase scan on every /sitemap.xml request. */
export async function getSitemapIndex(): Promise<Response> {
  try {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [books, papers] = await Promise.all([
      db.from("books").select("id", { head: true, count: "exact" }).eq("status", "published"),
      db.from("research_paper_versions").select("id", { head: true, count: "exact" })
        .not("published_at", "is", null).eq("withdrawn", false),
    ]);
    if (books.error || papers.error) throw new Error(books.error?.message ?? papers.error?.message);
    const urls = [`${ROOT}/sitemaps/static.xml`];
    for (let n = 1; n <= sitemapPageCount(books.count ?? 0); n++)
      urls.push(`${ROOT}/sitemaps/books-${n}.xml`);
    for (let n = 1; n <= sitemapPageCount(papers.count ?? 0); n++)
      urls.push(`${ROOT}/sitemaps/research-${n}.xml`);
    return xml(buildSitemapIndexXml(urls));
  } catch (error) { return unavailable(error); }
}

export function getStaticSitemap(): Response {
  const entries: SitemapEntry[] = [
    { loc: `${ROOT}/`, changefreq: "weekly", priority: 1 },
    { loc: `${ROOT}/library`, changefreq: "daily", priority: 0.9 },
    { loc: `${ROOT}/sacred-texts`, changefreq: "daily", priority: 0.9 },
    { loc: `${ROOT}/insights`, changefreq: "weekly", priority: 0.9 },
    { loc: `${ROOT}/research`, changefreq: "weekly", priority: 0.8 },
    ...INSIGHT_ARTICLES.map((a) => ({ loc: `${ROOT}/insights/${a.slug}`,
      lastmod: a.updatedAt, changefreq: "monthly" as const, priority: 0.8 })),
  ];
  return xml(buildSitemapXml(entries));
}

export async function getSitemapPartition(kind: "books" | "research", page: number): Promise<Response> {
  let start: number, end: number;
  try { ({ start, end } = sitemapPageBounds(page)); }
  catch { return new Response("Unknown sitemap page", { status: 404 }); }
  try {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const entries: SitemapEntry[] = [];
    if (kind === "books") {
      const { data, error } = await db.from("books")
        .select("id,author_id,content_classification,created_at")
        .eq("status", "published").order("id").range(start, end);
      if (error) throw new Error(error.message);
      if (!data?.length) return new Response("Unknown sitemap page", { status: 404 });
      const authors = new Set<string>();
      for (const b of data) {
        const sacred = b.content_classification === "religious";
        entries.push({ loc: `${ROOT}/${sacred ? "sacred-texts" : "book"}/${b.id}`,
          lastmod: b.created_at, changefreq: "weekly", priority: sacred ? 0.9 : 0.8 });
        if (b.author_id) authors.add(b.author_id);
      }
      for (const id of authors)
        entries.push({ loc: `${ROOT}/author/${id}`, changefreq: "weekly", priority: 0.7 });
    } else {
      const { data, error } = await db.from("research_paper_versions")
        .select("paper_id,published_at").not("published_at", "is", null)
        .eq("withdrawn", false).order("id").range(start, end);
      if (error) throw new Error(error.message);
      if (!data?.length) return new Response("Unknown sitemap page", { status: 404 });
      for (const p of data) entries.push({ loc: `${ROOT}/research/${p.paper_id}`,
        lastmod: p.published_at, changefreq: "monthly", priority: 0.7 });
    }
    return xml(buildSitemapXml(entries));
  } catch (error) { return unavailable(error); }
}
