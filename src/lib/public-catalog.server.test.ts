import { describe, expect, it } from "vitest";
import { literalIlikePattern, sanitizedPublicBook } from "@/lib/public-catalog.server";
import type { Book } from "@/lib/data";

describe("literalIlikePattern", () => {
  it.each([
    "hello,world",
    "(test)",
    "O'Reilly",
    "العربية",
    "اردو کتاب",
  ])("treats punctuation and Unicode as literal search text: %s", (query) => {
    expect(literalIlikePattern(query)).toBe(`%${query}%`);
  });

  it("escapes SQL LIKE wildcard and escape characters", () => {
    const pattern = literalIlikePattern(String.raw`100%_off\sale`);
    expect(pattern.startsWith("%")).toBe(true);
    expect(pattern.endsWith("%")).toBe(true);
    expect(pattern).toContain("\\%");
    expect(pattern).toContain("\\_");
    expect(pattern).toContain("\\\\");
  });
});

describe("unverified Gutenberg metadata display", () => {
  it("never publishes a placeholder year as a historical fact in the public projection", () => {
    const book = {
      id: "test", title: "Lorna Doone", author: "Blackmore, R. D.",
      original_publication_year: 1656,
      description: "Lorna Doone by Blackmore, R. D., first published in 1656. This sourced English-language reading edition presents the full original work. Source subject classifications: Fiction.",
    } as unknown as Book;
    const shown = sanitizedPublicBook(book);
    expect(shown.original_publication_year).toBeNull();
    expect(shown.description).not.toContain("1656");
    expect(shown.title).toBe(book.title);
    expect(book.original_publication_year).toBe(1656);
  });
  it("never modifies original, accurately reviewed or sacred book descriptions", () => {
    const book = { title: "A verified edition", description: "Original bibliographic statement", original_publication_year: 1879 } as Book;
    expect(sanitizedPublicBook(book)).toBe(book);
  });
});

describe("QA-013 source-aware bibliographic author presentation", () => {
  it("displays archival inverted author names naturally, without editing the book or claiming a year", () => {
    const item = {
      title: "A Danish Parsonage",
      author: "Vicary, John Fulford",
      original_publication_year: null,
      description: "A Danish Parsonage by Vicary, John Fulford. Its first-publication year has not been independently corroborated. This reading edition is based on archived Project Gutenberg source text.",
    } as Book;
    const shown = sanitizedPublicBook(item);
    expect(shown.description).toContain("by John Fulford Vicary.");
    expect(shown.description).not.toContain("by Vicary, John Fulford");
    expect(shown.original_publication_year).toBeNull();
    expect(item.description).toContain("by Vicary, John Fulford");
  });
  it("keeps suffix and non-inverted author names readable", () => {
    const item = {
      title: "A Cousin's Conspiracy",
      author: "Alger, Horatio, Jr.",
      original_publication_year: null,
      description: "A Cousin's Conspiracy by Alger, Horatio, Jr.. Its first-publication year has not been independently corroborated.",
    } as Book;
    const shown = sanitizedPublicBook(item);
    expect(shown.description).toContain("by Horatio Alger, Jr.");
    expect(shown.description).not.toContain("Jr..");
    const natural = { ...item, author: "Mark Twain",
      description: "A Cousin's Conspiracy by Mark Twain. Its first-publication year has not been independently corroborated." };
    expect(sanitizedPublicBook(natural).description).toContain("by Mark Twain.");
  });
});

describe("QA-001 production neutralization", () => {
  it("redacts the numeric year alongside neutral public metadata", () => {
    const book = {
      title: "Unverified Gutenberg novel",
      original_publication_year: 1800,
      description: "Its first-publication year has not been independently corroborated. This reading edition is based on archived Project Gutenberg source text.",
    } as Book;
    const projected = sanitizedPublicBook(book);
    expect(projected.original_publication_year).toBeNull();
    expect(projected.description).toBe(book.description);
    expect(book.original_publication_year).toBe(1800);
  });
});
