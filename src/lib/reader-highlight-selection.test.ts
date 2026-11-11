// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { captureReaderHighlightSelection } from "./reader-highlight-selection";

function fakeSelection(range: Range, collapsed = false): Selection {
  return {
    rangeCount: 1,
    isCollapsed: collapsed,
    getRangeAt: () => range,
  } as unknown as Selection;
}

describe("SP-HL literature reader selection anchoring", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("captures the exact Unicode-safe source offsets before toolbar focus clears the selection", () => {
    const reader = document.createElement("main");
    reader.innerHTML =
      '<span data-reader-text-start="100" data-reader-chunk-index="3">Hello <mark>world</mark> again.</span>';
    document.body.append(reader);
    const markedText = reader.querySelector("mark")!.firstChild!;
    const range = document.createRange();
    range.setStart(markedText, 1);
    range.setEnd(markedText, 5);
    expect(captureReaderHighlightSelection(fakeSelection(range), reader)).toEqual({
      chunkIndex: 3,
      startOffset: 106,
      endOffset: 111,
      text: "world",
    });
    // The persisted source tuple, rather than the DOM Range, survives a
    // later native selection collapse or a toolbar focus change.
    expect(captureReaderHighlightSelection(null, reader)).toBeNull();
  });

  it("rounds a mid-word source selection to complete words", () => {
    const reader = document.createElement("main");
    reader.innerHTML = '<span data-reader-text-start="20" data-reader-chunk-index="4">There were only two readers.</span>';
    document.body.append(reader);
    const source = reader.querySelector("span")!.firstChild!;
    const range = document.createRange();
    range.setStart(source, 7); // "ere" in were
    range.setEnd(source, 13); // "o" in only
    expect(captureReaderHighlightSelection(fakeSelection(range), reader)).toEqual({
      chunkIndex: 4, startOffset: 26, endOffset: 35, text: "were only",
    });
  });

  it("rejects selection that originates outside the actual book page", () => {
    const reader = document.createElement("main");
    const outside = document.createElement("span");
    outside.dataset["readerTextStart"] = "0";
    outside.dataset["readerChunkIndex"] = "2";
    outside.textContent = "Outside the reader";
    document.body.append(reader, outside);
    const range = document.createRange();
    range.setStart(outside.firstChild!, 0);
    range.setEnd(outside.firstChild!, 7);
    expect(captureReaderHighlightSelection(fakeSelection(range), reader)).toBeNull();
  });

  it("rejects a cross-chunk highlight rather than saving incorrect offsets", () => {
    const reader = document.createElement("main");
    reader.innerHTML =
      '<span data-reader-text-start="0" data-reader-chunk-index="2">First paragraph</span>' +
      '<span data-reader-text-start="0" data-reader-chunk-index="3">Second paragraph</span>';
    document.body.append(reader);
    const spans = reader.querySelectorAll("span");
    const range = document.createRange();
    range.setStart(spans[0]!.firstChild!, 1);
    range.setEnd(spans[1]!.firstChild!, 6);
    expect(captureReaderHighlightSelection(fakeSelection(range), reader)).toBeNull();
  });

  it("ignores collapsed selections and empty or missing anchors", () => {
    const reader = document.createElement("main");
    reader.innerHTML = '<span data-reader-text-start="0" data-reader-chunk-index="1">Some text</span>';
    document.body.append(reader);
    const range = document.createRange();
    range.setStart(reader.firstChild!.firstChild!, 1);
    range.setEnd(reader.firstChild!.firstChild!, 5);
    expect(captureReaderHighlightSelection(fakeSelection(range, true), reader)).toBeNull();
    expect(captureReaderHighlightSelection(null, reader)).toBeNull();
  });
});
