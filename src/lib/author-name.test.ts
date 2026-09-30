import { describe, expect, it } from "vitest";
import { formatAuthorName } from "@/lib/author-name";

describe("formatAuthorName", () => {
  it("turns catalogue surname-first names into natural display names", () => {
    expect(formatAuthorName("Brontë, Emily, 1818-1848")).toBe("Emily Brontë");
    expect(formatAuthorName("Wells, H. G. (Herbert George), 1866-1946")).toBe(
      "H. G. (Herbert George) Wells",
    );
  });

  it("uses the primary author and leaves ordinary names unchanged", () => {
    expect(
      formatAuthorName("Dickens, Charles, 1812-1870; Leech, John, 1817-1864 [Illustrator]"),
    ).toBe("Charles Dickens");
    expect(formatAuthorName("Seeparah")).toBe("Seeparah");
  });
});
