// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Highlight } from "./data";
import {
  captureSacredHighlightSelection,
  sacredSavedHighlightRanges,
} from "./sacred-highlight-selection";

function selectionOf(range: Range): Selection {
  return { rangeCount: 1, isCollapsed: false, getRangeAt: () => range } as unknown as Selection;
}
function saved(text: string, chunkIndex: number, start: number, end: number): Highlight {
  return {
    id: "hl", user_id: "demo-reader", book_id: "quran", language: "Arabic",
    chunk_index: chunkIndex, highlight_text: text, start_offset: start,
    end_offset: end, created_at: new Date().toISOString(), note: null,
  };
}

describe("sacred-text source-only highlights", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("anchors exact original Arabic source text without reading the ayah reference", () => {
    const root = document.createElement("section");
    root.innerHTML = '<article data-sacred-visible-chunk="9">' +
      '<span lang="ar" data-sacred-source-text>بِسْمِ اللَّهِ الرَّحْمَٰنِ</span>' +
      '<sup lang="en" aria-label="Ayah 1:1">﴾1:1﴿</sup></article>';
    document.body.append(root);
    const text = root.querySelector("[data-sacred-source-text]")!.firstChild!;
    const value = text.textContent!;
    const at = value.indexOf("اللَّهِ");
    const range = document.createRange();
    range.setStart(text, at);
    range.setEnd(text, at + "اللَّهِ".length);
    expect(captureSacredHighlightSelection(selectionOf(range), root)).toEqual({
      chunkIndex: 9, startOffset: at, endOffset: at + "اللَّهِ".length,
      text: "اللَّهِ",
    });
    const ranges = sacredSavedHighlightRanges(root, [saved("اللَّهِ", 9, at, at + "اللَّهِ".length)]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.toString()).toBe("اللَّهِ");
    expect(root.querySelectorAll("mark")).toHaveLength(0);
    expect(text.textContent).toBe(value);
  });

  it("retains the original phrase after source markup reflows", () => {
    const root = document.createElement("section");
    root.innerHTML = '<article data-sacred-visible-chunk="12">' +
      '<p data-sacred-source-text><strong>Chapter.</strong> The quick brown fox.</p></article>';
    document.body.append(root);
    const ranges = sacredSavedHighlightRanges(root, [saved("quick brown", 12, 0, 11)]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.toString()).toBe("quick brown");
  });

  it("rejects cross-verse, reference-only, and external text selection", () => {
    const root = document.createElement("section");
    root.innerHTML = '<article data-sacred-visible-chunk="1">' +
      '<span data-sacred-source-text>Source verse one</span><sup>1:1</sup></article>' +
      '<article data-sacred-visible-chunk="2">' +
      '<span data-sacred-source-text>Source verse two</span></article>';
    document.body.append(root);
    const spans = root.querySelectorAll("[data-sacred-source-text]");
    const range = document.createRange();
    range.setStart(spans[0]!.firstChild!, 0);
    range.setEnd(spans[1]!.firstChild!, 6);
    expect(captureSacredHighlightSelection(selectionOf(range), root)).toBeNull();
    const ref = root.querySelector("sup")!.firstChild!;
    const refOnly = document.createRange();
    refOnly.setStart(ref, 0);
    refOnly.setEnd(ref, 3);
    expect(captureSacredHighlightSelection(selectionOf(refOnly), root)).toBeNull();
    expect(sacredSavedHighlightRanges(root, [saved("Source verse one", 22, 0, 16)])).toHaveLength(0);
  });
});
