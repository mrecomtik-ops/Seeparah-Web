import { describe, expect, it } from "vitest";
import { buildLogicalBookPages, clamp, scriptureFontFamily, splitSummary, toRoman } from "./reader-v3-helpers";

describe("SP-36 literature reader extracted pagination helpers", () => {
  it("keeps chapter starts on facing-page boundaries without losing source pages", () => {
    const x = buildLogicalBookPages(4, [0, 1, 3]);
    expect(x.pages.map((p) => p.rawPage)).toEqual([0, null, 1, 2, 3]);
    expect(x.chapterStarts).toEqual([0, 2, 4]);
    expect(x.rawToLogical).toEqual([0, 2, 3, 4]);
  });
  it("bounds reader settings and formats roman front-matter page numbers", () => {
    expect(clamp(5, 8, 12)).toBe(8);
    expect(clamp(15, 8, 12)).toBe(12);
    expect(toRoman(14)).toBe("xiv");
    expect(toRoman(0)).toBe("i");
  });
  it("preserves chapter summary words while splitting long summaries", () => {
    const words = Array.from({ length: 270 }, (_, i) => "paragraph" + i);
    const result = splitSummary(words.join(" "));
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((page) => page.length <= 900)).toBe(true);
    expect(result.join(" ")).toBe(words.join(" "));
  });
  it("retains distinct original Unicode script font choices", () => {
    expect(scriptureFontFamily("Arabic")).toContain("Noto Naskh Arabic");
    expect(scriptureFontFamily("Greek")).toContain("Noto Serif");
    expect(scriptureFontFamily("Chinese")).toContain("Songti SC");
  });
});
