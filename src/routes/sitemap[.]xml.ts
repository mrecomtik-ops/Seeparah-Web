import { createFileRoute } from "@tanstack/react-router";
import { INSIGHT_ARTICLES } from "@/lib/insights";
import { buildSitemapXml, type SitemapEntry } from "@/lib/sitemap";

const ORIGIN = "https://seeparah.com";

// This route is discovered by the Vite router plugin during build. The checked-in
// route tree can be one generation behind a newly-added escaped-dot route, so keep
// the literal here while allowing the generator to register it on the build pass.
export const Route = createFileRoute("/sitemap.xml" as any)({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { loc: `${ORIGIN}/`, changefreq: "weekly", priority: 1 },
          { loc: `${ORIGIN}/library`, changefreq: "daily", priority: 0.9 },
          { loc: `${ORIGIN}/sacred-texts`, changefreq: "daily", priority: 0.9 },
          { loc: `${ORIGIN}/insights`, changefreq: "weekly", priority: 0.9 },
          { loc: `${ORIGIN}/research`, changefreq: "weekly", priority: 0.8 },
          ...INSIGHT_ARTICLES.map((article) => ({
            loc: `${ORIGIN}/insights/${article.slug}`,
            lastmod: article.updatedAt,
            changefreq: "monthly" as const,
            priority: 0.8,
          })),
        ];

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const [booksResult, papersResult] = await Promise.all([
            supabaseAdmin
              .from("books")
              .select("id,author_id,content_classification,created_at")
              .eq("status", "published"),
            supabaseAdmin
              .from("research_paper_versions")
              .select("paper_id,published_at"),
          ]);

          if (!booksResult.error) {
            const authorIds = new Set<string>();
            for (const book of booksResult.data ?? []) {
              entries.push({
                loc: `${ORIGIN}/book/${book.id}`,
                lastmod: book.created_at,
                changefreq: "weekly",
                priority: 0.8,
              });
              if (book.content_classification === "religious") {
                entries.push({
                  loc: `${ORIGIN}/sacred-texts/${book.id}`,
                  lastmod: book.created_at,
                  changefreq: "weekly",
                  priority: 0.9,
                });
              }
              if (book.author_id) authorIds.add(book.author_id);
            }
            for (const authorId of authorIds) {
              entries.push({
                loc: `${ORIGIN}/author/${authorId}`,
                changefreq: "weekly",
                priority: 0.7,
              });
            }
          }

          if (!papersResult.error) {
            for (const paper of papersResult.data ?? []) {
              entries.push({
                loc: `${ORIGIN}/research/${paper.paper_id}`,
                lastmod: paper.published_at,
                changefreq: "monthly",
                priority: 0.7,
              });
            }
          }
        } catch (error) {
          console.error(
            "[sitemap] Dynamic catalog entries unavailable:",
            error instanceof Error ? error.message : String(error),
          );
        }

        return new Response(buildSitemapXml(entries), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=3600",
          },
        });
      },
    },
  },
});
