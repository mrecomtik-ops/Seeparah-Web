/** 500 URL book pages avoid one heavy 10,000-book Workers request.
 * Every URL in the generated sitemap index has a matching bounded route. */
export const SITEMAP_BOOK_PAGE_SIZE = 500;
export const MAX_SITEMAP_PAGES = 500;

export function sitemapPageCount(total: number): number {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("Invalid sitemap catalogue count");
  const pages = Math.ceil(total / SITEMAP_BOOK_PAGE_SIZE);
  if (pages > MAX_SITEMAP_PAGES) throw new Error("Sitemap exceeded its configured index limit");
  return pages;
}

export function sitemapPageBounds(page: number): { start: number; end: number } {
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_SITEMAP_PAGES)
    throw new Error("Invalid sitemap page number");
  const start = (page - 1) * SITEMAP_BOOK_PAGE_SIZE;
  return { start, end: start + SITEMAP_BOOK_PAGE_SIZE - 1 };
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildSitemapIndexXml(locations: readonly string[]): string {
  const unique = [...new Set(locations)];
  if (unique.some((loc) => !/^https:\/\/seeparah\.com\/[^\s<>]*$/.test(loc)))
    throw new Error("Sitemap index contains an untrusted or invalid URL");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...unique.map((loc) => `  <sitemap><loc>${escapeXml(loc)}</loc></sitemap>`),
    '</sitemapindex>',
    '',
  ].join("\n");
}
