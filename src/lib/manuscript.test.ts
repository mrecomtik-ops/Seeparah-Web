import { describe, expect, it } from "vitest";
import { parseManuscript, splitManuscript } from "@/lib/manuscript";

describe("splitManuscript", () => {
  it("splits on chapter headings when present", () => {
    const text = "Chapter 1\n\nFirst.\n\nChapter 2\n\nSecond.";
    expect(splitManuscript(text)).toEqual(["Chapter 1\n\nFirst.", "Chapter 2\n\nSecond."]);
  });

  it("keeps a Part heading with the following chapter instead of making a one-line page", () => {
    const text = [
      "Title page",
      "PART ONE",
      "Chapter 1",
      "First chapter body.",
      "Chapter 2",
      "Second chapter body.",
    ].join("\n\n");
    const chunks = splitManuscript(text);
    expect(chunks[0]).toBe("Title page");
    expect(chunks[1]).toContain("PART ONE\n\nChapter 1");
    expect(chunks[2]).toContain("Chapter 2");
  });

  it("uses larger reading sections when reliable chapter headings are absent", () => {
    const paragraphs = Array.from(
      { length: 25 },
      (_, i) => `Paragraph ${i + 1} with enough ordinary prose to represent a paragraph.`,
    );
    const chunks = splitManuscript(paragraphs.join("\n\n"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(7); // old 4-paragraph paging would produce 7
    expect(chunks.join("\n\n")).toBe(paragraphs.join("\n\n"));
  });

  it("produces semantic structure metadata alongside chunks", () => {
    const parsed = parseManuscript(
      [
        "PREFACE",
        "Opening words.",
        "PART ONE",
        "Chapter 1",
        "First.",
        "Chapter 2",
        "Second.",
      ].join("\n\n"),
    );
    expect(parsed.structure.map((n) => n.nodeType)).toContain("front_matter");
    expect(parsed.structure.map((n) => n.nodeType)).toContain("part");
    expect(parsed.structure.filter((n) => n.nodeType === "chapter")).toHaveLength(2);
    expect(parsed.wordCount).toBeGreaterThan(0);
    expect(parsed.estimatedReadingMinutes).toBeGreaterThan(0);
  });

  it("never returns an empty array for non-empty input", () => {
    expect(splitManuscript("Just one line, no blank lines at all.")).toHaveLength(1);
  });
});


describe("parseManuscript preservation mode", () => {
  it("preserves intentional lineation for religious/scripture source editions", () => {
    const source =
      "SECTION ONE\n\nLine one with diacritics: اَلْحَمْدُ\nLine two remains separate\nLine three remains separate";
    const parsed = parseManuscript(source, { preserveLineation: true });
    expect(parsed.chunks.join("\n\n")).toContain(
      "Line one with diacritics: اَلْحَمْدُ\nLine two remains separate\nLine three remains separate",
    );
  });

  it("still reflows hard-wrapped prose in normal mode", () => {
    const source = "A sentence that was wrapped\nacross several source lines\nby a PDF extractor.";
    const parsed = parseManuscript(source);
    expect(parsed.chunks[0]).toContain(
      "A sentence that was wrapped across several source lines by a PDF extractor.",
    );
  });
});
