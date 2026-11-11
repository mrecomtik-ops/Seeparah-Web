import { findTextAnchor, textOffsetWithinAnchor } from "./reader-v3-helpers";

/**
 * Persist the exact paragraph-local source offsets before mobile selection
 * handles or toolbar focus can collapse the browser's transient DOM Selection.
 * Source text is never altered.
 */
export type ReaderHighlightSelection = {
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
};

export function captureReaderHighlightSelection(
  selection: Selection | null,
  readerRoot: HTMLElement | null,
): ReaderHighlightSelection | null {
  if (!readerRoot || !selection || selection.rangeCount === 0 || selection.isCollapsed)
    return null;

  const range = selection.getRangeAt(0);
  const startAnchor = findTextAnchor(range.startContainer);
  const endAnchor = findTextAnchor(range.endContainer);
  if (
    !startAnchor ||
    !endAnchor ||
    !readerRoot.contains(startAnchor) ||
    !readerRoot.contains(endAnchor)
  ) return null;

  const chunkIndex = Number(startAnchor.dataset["readerChunkIndex"]);
  const endChunk = Number(endAnchor.dataset["readerChunkIndex"]);
  const startBase = Number(startAnchor.dataset["readerTextStart"]);
  const endBase = Number(endAnchor.dataset["readerTextStart"]);
  if (
    !Number.isFinite(chunkIndex) ||
    !Number.isFinite(endChunk) ||
    chunkIndex !== endChunk ||
    !Number.isFinite(startBase) ||
    !Number.isFinite(endBase)
  ) return null;

  let startOffset =
    startBase + textOffsetWithinAnchor(startAnchor, range.startContainer, range.startOffset);
  let endOffset =
    endBase + textOffsetWithinAnchor(endAnchor, range.endContainer, range.endOffset);
  let text = range.toString().replace(/\s+/gu, " ").trim();
  if (!text || !Number.isFinite(startOffset) || !Number.isFinite(endOffset) ||
      endOffset <= startOffset) return null;

  // A selection within a single source paragraph often starts and ends in
  // the middle of words on mobile. Expand only its persisted offsets; never
  // modify the archived source text or fabricate cross-paragraph offsets.
  if (startAnchor === endAnchor) {
    const source = startAnchor.textContent ?? "";
    let left = startOffset - startBase;
    let right = endOffset - endBase;
    const isWord = (char: string) => /[\p{L}\p{M}\p{N}]/u.test(char);
    if (left >= 0 && right <= source.length && right > left) {
      while (left > 0 && isWord(source[left - 1] ?? "")) left--;
      while (right < source.length && isWord(source[right] ?? "")) right++;
      startOffset = startBase + left;
      endOffset = endBase + right;
      text = source.slice(left, right).replace(/\s+/gu, " ").trim();
    }
  }
  if (!text) return null;
  return { chunkIndex, startOffset, endOffset, text };
}
