import { describe, expect, it } from "vitest";
import {
  buildFallbackNavigation,
  classifyHeading,
  parseReadableBlocks,
} from "@/lib/reader-structure";

describe("reader structure helpers", () => {
  it("classifies strong literary headings without treating ordinary prose as headings", () => {
    expect(classifyHeading("PART ONE")).toEqual({ kind: "part", level: 1 });
    expect(classifyHeading("Chapter 3 — The First Lighting")).toEqual({
      kind: "chapter",
      level: 2,
    });
    expect(classifyHeading("This is an ordinary sentence in the book.")).toBeNull();
  });

  it("recognizes common multilingual structural headings", () => {
    expect(classifyHeading("Chapitre III")).toEqual({ kind: "chapter", level: 2 });
    expect(classifyHeading("Teil Zwei")).toEqual({ kind: "part", level: 1 });
    expect(classifyHeading("Глава 4")).toEqual({ kind: "chapter", level: 2 });
    expect(classifyHeading("الفصل الثالث")).toEqual({ kind: "chapter", level: 2 });
    expect(classifyHeading("باب دوم")).toEqual({ kind: "chapter", level: 2 });
    expect(classifyHeading("अध्याय ५")).toEqual({ kind: "chapter", level: 2 });
    expect(classifyHeading("第十二章")).toEqual({ kind: "chapter", level: 2 });
  });

  it("renders headings, principles, lists, quotes, and ordinary paragraphs conservatively", () => {
    const blocks = parseReadableBlocks(
      [
        "CHAPTER ONE",
        "This is an ordinary paragraph that should remain ordinary.",
        "PRINCIPLE 1\nRemember the person's name.",
        "- First point\n- Second point",
        "\"A short quotation.\"",
      ].join("\n\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "principle",
      "list",
      "quote",
    ]);
  });

  it("builds a named TOC from detected headings", () => {
    const nav = buildFallbackNavigation([
      { chunk_index: 0, content: "PREFACE\n\nOpening text" },
      { chunk_index: 1, content: "CHAPTER ONE\n\nBody" },
      { chunk_index: 2, content: "More body text" },
      { chunk_index: 3, content: "PART TWO\n\nBody" },
    ]);
    expect(nav.map((n) => [n.index, n.title])).toEqual([
      [0, "PREFACE"],
      [1, "CHAPTER ONE"],
      [3, "PART TWO"],
    ]);
  });

  it("falls back to a small number of neutral waypoints instead of hundreds of page numbers", () => {
    const rows = Array.from({ length: 475 }, (_, i) => ({
      chunk_index: i,
      content: `Ordinary paragraph ${i} without a heading.`,
    }));
    const nav = buildFallbackNavigation(rows);
    expect(nav.length).toBeLessThanOrEqual(20);
    expect(nav[0]?.title).toBe("Reading section 1");
  });
});
