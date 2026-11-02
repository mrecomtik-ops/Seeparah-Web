import { describe, expect, it } from "vitest";
import { isProgressiveDighaSource, sourcePreviewEnd, LARGE_SOURCE_LIMIT } from "./source-preview";

describe("lossless Dīgha source transport", () => {
  it("never truncates other traditions, unwindowed calls or ordinary paragraphs", () => {
    const giant = "x".repeat(LARGE_SOURCE_LIMIT + 1);
    expect(isProgressiveDighaSource("Genesis", giant, 32)).toBe(false);
    expect(isProgressiveDighaSource("Dīgha Nikāya", giant, undefined)).toBe(false);
    expect(isProgressiveDighaSource("Dīgha Nikāya", "short", 32)).toBe(false);
    expect(isProgressiveDighaSource("Dīgha Nikāya", giant, 32)).toBe(true);
  });
  it("chooses the exact Unicode-safe original prefix without changing remaining bytes", () => {
    const original = "A".repeat(5999) + "😀" + "B".repeat(13000);
    const end = sourcePreviewEnd(original);
    expect(original.slice(0, end) + original.slice(end)).toBe(original);
    expect(end).toBe(5999);
  });
});
