/**
 * Find the original source character after a book reader reflows.
 *
 * A single imported chunk frequently contains many paragraph anchors.
 * Finding the FIRST matching chunk discards the in-chapter offset and
 * returns the reader to page one after a font-size change.
 *
 * Chunk identity is still authoritative for direct ?page= links; within
 * that chunk choose the anchor at the recorded chapter-wide char offset.
 */
export type ChapterTextPosition = { charOffset: number; chunkIndex: number };

export function findReaderSourceAnchor(
  anchors: readonly HTMLElement[],
  position: ChapterTextPosition,
): { anchor: HTMLElement; relative: number } | null {
  if (!anchors.length) return null;

  const sourceAnchors = anchors.filter(
    (anchor) => Number(anchor.dataset["readerChunkIndex"] ?? -1) === position.chunkIndex,
  );
  const candidates = sourceAnchors.length ? sourceAnchors : anchors;
  const offset = Math.max(0, position.charOffset);

  const startAt = (anchor: HTMLElement) =>
    Number(anchor.dataset["chapterOffset"] ?? 0);

  // Always consider chapter offset EVEN WHEN chunk keys are equal.
  // Prefer the specific paragraph that contains the original character.
  let anchor = candidates.find((item) => {
    const start = startAt(item);
    const length = item.textContent?.length ?? 0;
    return length > 0 && offset >= start && offset < start + length;
  });

  // Gaps between paragraphs or a stale offset settle at the nearest
  // previous anchor, never an unrelated first paragraph by default.
  if (!anchor) {
    for (const item of candidates) {
      if (startAt(item) <= offset) anchor = item;
      else break;
    }
  }
  anchor ??= candidates[0]!;
  const length = anchor.textContent?.length ?? 0;
  return {
    anchor,
    relative: Math.max(0, Math.min(Math.max(0, length - 1), offset - startAt(anchor))),
  };
}
