import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "@/lib/sitemap";

describe("buildSitemapXml", () => {
  it("escapes values, normalizes lastmod, sorts, and de-duplicates URLs", () => {
    const xml = buildSitemapXml([
      {
        loc: "https://seeparah.com/insights/b",
        lastmod: "2026-09-29T12:34:56.000Z",
        priority: 0.8,
      },
      {
        loc: "https://seeparah.com/book/a?x=1&y=2",
        lastmod: "not-a-date",
        changefreq: "weekly",
      },
      {
        loc: "https://seeparah.com/insights/b",
        lastmod: "2026-09-30",
        priority: 2,
      },
    ]);

    expect(xml).toContain("https://seeparah.com/book/a?x=1&amp;y=2");
    expect(xml).toContain("<lastmod>2026-09-30</lastmod>");
    expect(xml).toContain("<priority>1.0</priority>");
    expect(xml.match(/https:\/\/seeparah\.com\/insights\/b/g)).toHaveLength(1);
    expect(xml.indexOf("/book/a")).toBeLessThan(xml.indexOf("/insights/b"));
  });

  it("always returns a valid sitemap envelope", () => {
    expect(buildSitemapXml([])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "</urlset>\n",
    );
  });
});
