// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BookReaderChapterContent } from "./BookReaderChapterContent";
import type { Highlight } from "@/lib/data";
import type { ReaderChapter, ReaderSourceBlock } from "@/lib/reader-book-layout";

afterEach(cleanup);

function block(kind: ReaderSourceBlock["kind"], text: string, index = 3): ReaderSourceBlock {
  return {
    kind,
    text,
    sourceChunkIndex: index,
    sourceTextStart: 0,
    sourceTextEnd: text.length,
    chapterTextStart: 0,
  };
}

function chapter(blocks: ReaderSourceBlock[]): ReaderChapter {
  return {
    key: "chapter:0",
    title: "Chapter One",
    kind: "chapter",
    chapterNumber: 1,
    startChunkIndex: 3,
    blocks,
    textLength: blocks.reduce((length, entry) => length + entry.text.length, 0),
  };
}

describe("Source-preserving chapter content extraction (SP-36)", () => {
  it("retains chapter markers, paragraph text, offsets and exact highlight spans", () => {
    const highlight: Highlight = {
      id: "h1", user_id: "u", book_id: "b", language: "English",
      chunk_index: 3, highlight_text: "world", start_offset: 6, end_offset: 11,
      note: null, created_at: "2026-11-02T00:00:00Z",
    };
    const { container } = render(
      <BookReaderChapterContent
        chapter={chapter([block("paragraph", "Hello world.")])}
        chapterIndex={0}
        highlights={[highlight]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Chapter One" })).toBeTruthy();
    expect(container.querySelector('[data-reader-chapter-opening="0"]')).toBeTruthy();
    expect(container.querySelector('[data-reader-text-start="0"][data-reader-chunk-index="3"]')?.textContent).toBe("Hello world.");
    expect(container.querySelector("mark.reader-highlight")?.textContent).toBe("world");
    expect(container.textContent).toContain("CHAPTER 1");
  });

  it("preserves source list anchors, letter signatures and explicit scene ornaments", () => {
    const list = {
      ...block("list", ""),
      items: ["First item", "Second item"],
      sourceItemStarts: [0, 12],
      chapterTextStart: 0,
    };
    const { container } = render(
      <BookReaderChapterContent
        chapter={chapter([list, block("heading", "J. DOE."), block("paragraph", "***")])}
        chapterIndex={2}
        highlights={[]}
      />,
    );
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector('[data-reader-text-start="12"]')?.textContent).toBe("Second item");
    expect(container.querySelector(".reader-v3-signature")?.textContent).toBe("J. DOE.");
    expect(container.querySelector(".reader-v3-scene-break")?.textContent).toContain("⁂");
  });
});
