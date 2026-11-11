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

  it("keeps real chapters before a repeated contents label later in the book", () => {
    const content = [
      "CONTENTS",
      "CHAPTER I",
      "First chapter introduction. " + "Ordinary prose that establishes a long chapter. ".repeat(220),
      "CHAPTER II",
      "Second chapter introduction. " + "Ordinary prose in the body of the novel. ".repeat(220),
      "CHAPTER III",
      "A third chapter begins with regular narrative paragraphs. ".repeat(220),
      "CHAPTER I",
      "The label can repeat in a later volume without deleting the preceding chapters.",
    ].join("\n\n");
    const parsed = parseManuscript(content);
    expect(parsed.structure.filter((n) => n.nodeType === "chapter").map((n) => n.title))
      .toEqual(["CHAPTER I", "CHAPTER II", "CHAPTER III", "CHAPTER I"]);
  });

  it("preserves short source chapters before repeated volume chapter numbers", () => {
    // Previously 3 short chapters under the fixed 1,500-word threshold were
    // silently removed because a later volume restarted Chapter I.
    const content = [
      "CONTENTS",
      "CHAPTER I",
      ("First chapter's real original prose. ").repeat(35),
      "CHAPTER II",
      ("Second chapter's real original prose. ").repeat(35),
      "CHAPTER III",
      ("Third chapter's real original prose. ").repeat(35),
      "CHAPTER I",
      ("Volume two's real original opening. ").repeat(35),
    ].join("\n\n");
    const parsed = parseManuscript(content);
    expect(parsed.structure.filter((node) => node.nodeType === "chapter").map((node) => node.title))
      .toEqual(["CHAPTER I", "CHAPTER II", "CHAPTER III", "CHAPTER I"]);
    expect(parsed.chunks.join("\n\n")).toContain("First chapter's real original prose.");
  });

  it("still excludes a genuinely concise printed contents list", () => {
    const content = [
      "CONTENTS",
      "CHAPTER I", "The Beginning — 1",
      "CHAPTER II", "The Return — 7",
      "CHAPTER I", ("This is the true first chapter. ").repeat(35),
      "CHAPTER II", ("This is the true second chapter. ").repeat(35),
    ].join("\n\n");
    const parsed = parseManuscript(content);
    expect(parsed.structure.filter((node) => node.nodeType === "chapter").map((node) => node.title))
      .toEqual(["CHAPTER I", "CHAPTER II"]);
  });

  it("clips illustrations front matter before the first actual chapter", () => {
    const input=[
      "TABLE OF CONTENTS",
      "CHAPTER I. The beginning of a book",
      "CHAPTER II. The second chapter",
      "LIST OF ILLUSTRATIONS",
      "1. Cover image",
      "2. Title-page illustration",
      "CHAPTER I.",
      "A narrative passage that begins the actual first chapter.",
      "CHAPTER II.",
      "Another narrative passage from the next chapter.",
    ].join("\n\n");
    const parsed=parseManuscript(input);
    const front=parsed.structure.find((n) => n.title==="LIST OF ILLUSTRATIONS");
    const chapters=parsed.structure.filter((n) => n.nodeType==="chapter");
    expect(front).toBeDefined();
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(front!.endChunkIndex).toBeLessThanOrEqual(chapters.at(-2)!.startChunkIndex);
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
