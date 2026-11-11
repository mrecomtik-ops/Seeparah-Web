import { describe, expect, it } from "vitest";
import { buildSitemapIndexXml, sitemapPageBounds, sitemapPageCount } from "./sitemap-index";
describe("QA-003 scalable sitemap partitioning",()=>{
  it("does not silently truncate at 1,000 books, including exactly 10,000",()=>{
    expect(sitemapPageCount(0)).toBe(0);
    expect(sitemapPageCount(500)).toBe(1);
    expect(sitemapPageCount(1001)).toBe(3);
    expect(sitemapPageCount(10000)).toBe(20);
    expect(sitemapPageBounds(20)).toEqual({start:9500,end:9999});
    expect(()=>sitemapPageBounds(0)).toThrow("Invalid sitemap");
  });
  it("builds a valid sitemap index with deduplicated URLs and an origin guard",()=>{
    const index=buildSitemapIndexXml(["https://seeparah.com/sitemaps/static.xml",
      "https://seeparah.com/sitemaps/books-1.xml",
      "https://seeparah.com/sitemaps/books-1.xml"]);
    expect(index).toContain("<sitemapindex");
    expect(index.match(/books-1\.xml/g)).toHaveLength(1);
    expect(()=>buildSitemapIndexXml(["https://untrusted.example/sitemap.xml"])).toThrow();
  });
  it("rejects unbounded or fractional offsets",()=>{
    expect(()=>sitemapPageCount(-1)).toThrow();
    expect(()=>sitemapPageCount(300000)).toThrow();
    expect(()=>sitemapPageBounds(1.5)).toThrow();
  });
});