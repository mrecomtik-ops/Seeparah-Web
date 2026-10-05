import { describe, expect, it } from "vitest";
import { blockStartsFreshBookPage, buildReaderFrontPages } from "@/lib/reader-pagination";
import type { ReaderNavigationItem } from "@/lib/reader-structure";

describe("reader pagination", () => {
  it("puts a summary on its own front page when available", () => {
    const pages = buildReaderFrontPages("A short summary.", []);
    expect(pages).toEqual([
      {
        kind: "summary",
        title: "About this book",
        body: "A short summary.",
        pageNumber: 0,
        pageCount: 1,
      },
    ]);
  });

  it("splits a long summary across standard front pages", () => {
    const longSummary = Array.from({ length: 400 }, () => "summary").join(" ");
    const pages = buildReaderFrontPages(longSummary, []);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.kind === "summary")).toBe(true);
    expect(
      pages.map((page) => (page.kind === "summary" ? page.body : "")).join(" ").length,
    ).toBeGreaterThan(2500);
  });

  it("splits a long table of contents over stable book pages", () => {
    const items: ReaderNavigationItem[] = Array.from({ length: 29 }, (_, i) => ({
      index: i,
      title: `Chapter ${i + 1}`,
      kind: "chapter",
      depth: 0,
    }));
    const pages = buildReaderFrontPages(null, items);
    expect(pages).toHaveLength(3);
    expect(pages[0]?.kind).toBe("contents");
    expect(pages[0]?.kind === "contents" ? pages[0].items : []).toHaveLength(10);
    expect(pages[2]?.kind === "contents" ? pages[2].items : []).toHaveLength(9);
  });

  it("forces later chapter/part headings onto a fresh physical page", () => {
    expect(
      blockStartsFreshBookPage(
        { kind: "heading", text: "CHAPTER II.", level: 2, navigationKind: "chapter" },
        3,
      ),
    ).toBe(true);
    expect(
      blockStartsFreshBookPage(
        { kind: "heading", text: "CHAPTER I.", level: 2, navigationKind: "chapter" },
        0,
      ),
    ).toBe(false);
    expect(blockStartsFreshBookPage({ kind: "paragraph", text: "Body" }, 4)).toBe(false);
  });

  it("does not force printed contents entries unless they are real navigation starts", () => {
    const chapter = {
      kind: "heading" as const,
      text: "CHAPTER I.",
      level: 2 as const,
      navigationKind: "chapter" as const,
    };
    expect(blockStartsFreshBookPage(chapter, 5, ["CHAPTER II."])).toBe(false);
    expect(blockStartsFreshBookPage(chapter, 5, ["  chapter   i.  "])).toBe(true);
  });
});