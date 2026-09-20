import { describe, expect, it } from "vitest";
import { pickFeaturedBook } from "@/lib/featured";
import { FEATURED_BOOK_ID } from "@/lib/covers";
import type { Book } from "@/lib/data";

// Regression coverage for the bug found in live preview testing on commit
// 40d96dd: the homepage rendered a hardcoded "Pride and Prejudice" entry
// (id 11111111-1111-1111-1111-111111111111) that 404'd on a fresh, empty
// catalog. The featured-book area must be driven entirely by real fetched
// books, and show an honest empty state — never a fabricated one — when
// none exist.

function realBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "a1b2c3d4-0000-4000-8000-000000000001",
    title: "A Real Published Book",
    author: "A Real Author",
    author_id: "00000000-0000-4000-8000-000000000099",
    cover_url: null,
    available_languages: ["English"],
    total_chunks: 10,
    source_language: "English",
    description: "",
    status: "published",
    access_type: "free",
    subscription_price_usd: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("pickFeaturedBook", () => {
  it("returns undefined on an empty catalog — the honest-empty-state case", () => {
    expect(pickFeaturedBook([])).toBeUndefined();
  });

  it("never returns the hardcoded demo id unless a REAL book happens to have it", () => {
    const onlyBook = realBook({ id: "a1b2c3d4-0000-4000-8000-000000000002" });
    const result = pickFeaturedBook([onlyBook]);
    expect(result?.id).not.toBe(FEATURED_BOOK_ID);
    expect(result?.id).toBe(onlyBook.id);
  });

  it("picks the first real book when none match the preferred id", () => {
    const books = [
      realBook({ id: "a1b2c3d4-0000-4000-8000-000000000010", title: "First" }),
      realBook({ id: "a1b2c3d4-0000-4000-8000-000000000011", title: "Second" }),
    ];
    expect(pickFeaturedBook(books)?.title).toBe("First");
  });

  it("prefers the FEATURED_BOOK_ID entry only when it is an actual row in the real array", () => {
    const preferred = realBook({ id: FEATURED_BOOK_ID, title: "Preferred" });
    const other = realBook({ id: "a1b2c3d4-0000-4000-8000-000000000020", title: "Other" });
    expect(pickFeaturedBook([other, preferred])?.title).toBe("Preferred");
  });

  it("the fixture set never itself relies on the hardcoded demo id to produce a result", () => {
    // Guards against silently reintroducing a dependency on the fake
    // catalog id: with a books array that intentionally excludes it,
    // selection must still succeed using only real data.
    const books = [realBook()];
    expect(books.some((b) => b.id === FEATURED_BOOK_ID)).toBe(false);
    expect(pickFeaturedBook(books)).toBeDefined();
  });
});
