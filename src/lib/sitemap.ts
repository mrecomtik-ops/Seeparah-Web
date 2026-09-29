export interface SitemapEntry {
  loc: string;
  lastmod?: string | null;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatLastmod(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const unique = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    const loc = entry.loc.trim();
    if (!loc) continue;
    unique.set(loc, { ...entry, loc });
  }

  const rows = [...unique.values()]
    .sort((a, b) => a.loc.localeCompare(b.loc))
    .map((entry) => {
      const lastmod = formatLastmod(entry.lastmod);
      return [
        "  <url>",
        `    <loc>${xmlEscape(entry.loc)}</loc>`,
        ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
        ...(entry.changefreq ? [`    <changefreq>${entry.changefreq}</changefreq>`] : []),
        ...(entry.priority !== undefined
          ? [`    <priority>${Math.max(0, Math.min(1, entry.priority)).toFixed(1)}</priority>`]
          : []),
        "  </url>",
      ].join("\n");
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rows,
    "</urlset>",
    "",
  ].join("\n");
}
