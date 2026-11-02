// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findReaderSourceAnchor } from "./reader-position-anchor";

function anchor(chunk: number, start: number, text: string): HTMLElement {
  const element = document.createElement("span");
  element.dataset["readerChunkIndex"] = String(chunk);
  element.dataset["chapterOffset"] = String(start);
  element.textContent = text;
  return element;
}

describe("book reader source position after reflow (SP-16/SP-29)", () => {
  it("restores the same character within many paragraphs sharing ONE imported chunk", () => {
    const anchors = [anchor(4, 0, "First paragraph."), anchor(4, 20, "Second paragraph."),
      anchor(4, 42, "Third paragraph.")];
    const found = findReaderSourceAnchor(anchors, { chunkIndex: 4, charOffset: 27 });
    expect(found?.anchor).toBe(anchors[1]);
    expect(found?.relative).toBe(7);
  });

  it("keeps canonical ?page= source-chunk links even if their initial char offset is zero", () => {
    const anchors = [anchor(3, 0, "Previous chunk."), anchor(7, 24, "Requested source chunk.")];
    const found = findReaderSourceAnchor(anchors, { chunkIndex: 7, charOffset: 0 });
    expect(found?.anchor).toBe(anchors[1]);
    expect(found?.relative).toBe(0);
  });

  it("clamps an offset after the last paragraph and never returns the first chunk", () => {
    const anchors = [anchor(4, 0, "First."), anchor(4, 16, "Last paragraph.")];
    const found = findReaderSourceAnchor(anchors, { chunkIndex: 4, charOffset: 200 });
    expect(found?.anchor).toBe(anchors[1]);
    expect(found?.relative).toBe("Last paragraph.".length - 1);
  });

  it("retains chapter offset if a previous imported chunk key disappeared", () => {
    const anchors = [anchor(3, 0, "A short opening."), anchor(5, 20, "Still present.")];
    const found = findReaderSourceAnchor(anchors, { chunkIndex: 9, charOffset: 24 });
    expect(found?.anchor).toBe(anchors[1]);
    expect(found?.relative).toBe(4);
  });

  it("reports absent anchors without inventing a reading position", () => {
    expect(findReaderSourceAnchor([], { chunkIndex: 0, charOffset: 10 })).toBeNull();
  });
});
