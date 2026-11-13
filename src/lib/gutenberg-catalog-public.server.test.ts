import { describe, expect, it } from "vitest";
import {
  GUTENBERG_CATALOG_PAGE_SIZE,
  parseGutenbergCatalogQuery,
} from "./gutenberg-catalog-public.server";

const parse = (query: string) =>
  parseGutenbergCatalogQuery(new URLSearchParams(query));

describe("Public Gutenberg catalogue safety and pagination", () => {
  it("paginates the full 78k+ identity collection rather than limiting to 20k", () => {
    expect(GUTENBERG_CATALOG_PAGE_SIZE).toBe(32);
    expect(parse("page=2454").page).toBe(2454);
  });
  it("accepts multilingual author/title names without data changes", () => {
    expect(parse("q=%D8%A7%D9%84%D9%82%D8%B1%D8%A2%D9%86&lang=ar"))
      .toEqual({ page: 1, search: "القرآن", language: "ar" });
    expect(parse("q=Anthony%20%20Trollope&page=3"))
      .toEqual({ page: 3, search: "Anthony Trollope", language: null });
    expect(parse("q=Vol.+I%3A+An+Essay&lang=en").search)
      .toBe("Vol. I: An Essay");
  });
  it("rejects PostgREST expression delimiters and wildcard injection", () => {
    expect(() => parse("q=%25")).toThrow();
    expect(() => parse("q=foo%2Ctitle.ilike.%25")).toThrow();
    expect(() => parse("q=foo%28bar%29")).toThrow();
    expect(() => parse("q=a_b")).toThrow();
    expect(() => parse("lang=en%2Cauthor")).toThrow();
  });
  it("rejects invalid page, oversized inputs, and unsupported language codes", () => {
    for (const query of [
      "page=0",
      "page=4001",
      "page=-4",
      "page=7.2",
      "q=" + "A".repeat(81),
      "lang=javascript",
    ]) expect(() => parse(query)).toThrow();
  });
});
