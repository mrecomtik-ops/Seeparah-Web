import { describe, expect, it } from "vitest";
import { splitManuscript } from "@/lib/manuscript";

describe("splitManuscript", () => {
  it("splits on chapter headings when present", () => {
    const text = "Chapter 1\n\nFirst.\n\nChapter 2\n\nSecond.";
    expect(splitManuscript(text)).toEqual(["Chapter 1\n\nFirst.", "Chapter 2\n\nSecond."]);
  });

  it("falls back to paragraph grouping when there are no chapter headings", () => {
    const paragraphs = Array.from({ length: 9 }, (_, i) => `Paragraph ${i + 1}.`);
    const text = paragraphs.join("\n\n");
    const chunks = splitManuscript(text);
    expect(chunks).toHaveLength(3); // 9 paragraphs / 4 per chunk, rounded up
    expect(chunks[0]).toContain("Paragraph 1.");
    expect(chunks[2]).toContain("Paragraph 9.");
  });

  it("never returns an empty array for non-empty input", () => {
    expect(splitManuscript("Just one line, no blank lines at all.")).toHaveLength(1);
  });
});
