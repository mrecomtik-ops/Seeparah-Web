import { describe, expect, it } from "vitest";
import { literalIlikePattern } from "@/lib/public-catalog.server";

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
