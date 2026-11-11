import { describe, expect, it } from "vitest";
import { canonicalAuthorKey, formatAuthorName } from "@/lib/author-name";

describe("formatAuthorName", () => {
  it("turns catalogue surname-first names into natural display names", () => {
    expect(formatAuthorName("Brontë, Emily, 1818-1848")).toBe("Emily Brontë");
    expect(formatAuthorName("Wells, H. G. (Herbert George), 1866-1946")).toBe("H. G. Wells");
  });

  it("uses the primary author and leaves ordinary names unchanged", () => {
    expect(
      formatAuthorName("Dickens, Charles, 1812-1870; Leech, John, 1817-1864 [Illustrator]"),
    ).toBe("Charles Dickens");
    expect(formatAuthorName("Seeparah")).toBe("Seeparah");
    expect(formatAuthorName("H. G. (Herbert George) Wells")).toBe("H. G. Wells");
    expect(formatAuthorName("L. M. (Lucy Maud) Montgomery")).toBe("L. M. Montgomery");
  });
});

describe("canonical author facets", () => {
  it("combines catalog honorifics and middle-name aliases", () => {
    expect(canonicalAuthorKey("Scott, Sir Walter")).toBe(canonicalAuthorKey("Walter Scott"));
    expect(canonicalAuthorKey("Gaskell, Elizabeth Cleghorn")).toBe(canonicalAuthorKey("Elizabeth Gaskell"));
    expect(canonicalAuthorKey("Dickens, Charles")).toBe(canonicalAuthorKey("Charles Dickens"));
  });
  it("does not combine authors with different first or family names", () => {
    expect(canonicalAuthorKey("Henry James")).not.toBe(canonicalAuthorKey("William James"));
  });
});

describe("QA-014 authoritative display aliases (source metadata untouched)", () => {
  it("fixes uppercase catalogue names and historical name order", () => {
    expect(formatAuthorName("ADAM SMITH")).toBe("Adam Smith");
    expect(formatAuthorName("Henry Mrs. Wood")).toBe("Mrs. Henry Wood");
    expect(formatAuthorName("Wood, Mrs. Henry, 1814-1887")).toBe("Mrs. Henry Wood");
    expect(formatAuthorName("Sacred text")).toBe("Sacred Text");
  });
  it("unifies known author display variants without changing source spelling", () => {
    expect(formatAuthorName("Scott, Sir Walter")).toBe("Walter Scott");
    expect(formatAuthorName("Gaskell, Elizabeth Cleghorn")).toBe("Elizabeth Gaskell");
    expect(canonicalAuthorKey("Scott, Sir Walter")).toBe(canonicalAuthorKey("Walter Scott"));
    expect(canonicalAuthorKey("Gaskell, Elizabeth Cleghorn")).toBe(canonicalAuthorKey("Elizabeth Gaskell"));
    expect(formatAuthorName("القرآن الكريم")).toBe("القرآن الكريم");
  });
});
