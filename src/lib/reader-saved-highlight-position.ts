import type { Highlight } from "@/lib/data";
import type { ReaderChapter } from "@/lib/reader-book-layout";
import { findReaderChapterByChunk } from "@/lib/reader-book-layout";
import type { ReaderPosition } from "@/lib/reader-v3-helpers";

/** Restore the exact source excerpt, not its old screen page number.
 * Character offsets remain valid after typography/pagination changes. */
export function positionForSavedHighlight(
  chapters: ReaderChapter[],
  flow: HTMLElement | null,
  highlight: Highlight,
): ReaderPosition {
  const chapterIndex = findReaderChapterByChunk(chapters, highlight.chunk_index);
  const anchors = Array.from(
    flow?.querySelectorAll<HTMLElement>(
      '[data-reader-chapter-index="' + String(chapterIndex) +
      '"][data-reader-chunk-index="' + String(highlight.chunk_index) + '"]',
    ) ?? [],
  );
  const desiredOffset = highlight.start_offset ?? 0;
  const matched = anchors.find((item) => {
    const start = Number(item.dataset["readerTextStart"] ?? 0);
    return desiredOffset >= start &&
      desiredOffset <= start + (item.textContent?.length ?? 0);
  }) ?? anchors[0];
  const sourceStart = Number(matched?.dataset["readerTextStart"] ?? 0);
  const chapterStart = Number(matched?.dataset["chapterOffset"] ?? 0);
  return {
    chapterIndex,
    chunkIndex: highlight.chunk_index,
    charOffset: chapterStart + Math.max(0, desiredOffset - sourceStart),
  };
}
