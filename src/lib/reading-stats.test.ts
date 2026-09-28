import { describe, expect, it } from "vitest";
import { countPagesRead } from "@/lib/reading-stats";

describe("countPagesRead", () => {
  it("returns 0 for no progress", () => {
    expect(countPagesRead([])).toBe(0);
    expect(countPagesRead(undefined)).toBe(0);
  });

  it("counts the furthest position per book, not every language row", () => {
    expect(
      countPagesRead([
        { book_id: "a", last_chunk_index: 63 },
        { book_id: "a", last_chunk_index: 10 },
        { book_id: "b", last_chunk_index: 0 },
      ]),
    ).toBe(64 + 1);
  });
});
