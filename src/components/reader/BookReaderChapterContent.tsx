import type { ReactNode } from "react";
import type { Highlight } from "@/lib/data";
import type { ReaderChapter, ReaderSourceBlock } from "@/lib/reader-book-layout";

/** Source-preserving chapter markup, isolated from pagination and navigation state. */
function mergeHighlightRanges(text: string, absoluteStart: number, highlights: Highlight[]) {
  const absoluteEnd = absoluteStart + text.length;
  const ranges: Array<{ start: number; end: number }> = [];
  for (const highlight of highlights) {
    if (highlight.start_offset != null && highlight.end_offset != null) {
      if (highlight.end_offset > absoluteStart && highlight.start_offset < absoluteEnd) {
        ranges.push({
          start: Math.max(0, highlight.start_offset - absoluteStart),
          end: Math.min(text.length, highlight.end_offset - absoluteStart),
        });
      }
      continue;
    }
    const legacy = highlight.highlight_text.trim();
    const exact = legacy ? text.indexOf(legacy) : -1;
    if (exact >= 0) ranges.push({ start: exact, end: exact + legacy.length });
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else if (range.end > range.start) merged.push({ ...range });
  }
  return merged;
}

function renderHighlights(text: string, absoluteStart: number, highlights: Highlight[]): ReactNode {
  const ranges = mergeHighlightRanges(text, absoluteStart, highlights);
  if (!ranges.length) return text;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(
      <mark
        key={String(range.start) + ":" + String(range.end) + ":" + String(index)}
        className="reader-highlight"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function sceneBreak(text: string): boolean {
  return /^(?:\*\s*){3,}$|^⁂$/u.test(text.trim());
}

function looksLikeLetterSignature(text: string): boolean {
  const value = text
    .trim()
    .replace(/^[“”"'‘’]+/u, "")
    .replace(/[“”"'‘’]+$/u, "");
  return (
    value.length <= 48 &&
    /\.$/u.test(value) &&
    /^[A-Z][A-Z .’'-]+\.$/u.test(value) &&
    !/^(CHAPTER|BOOK|PART|ACT)\b/u.test(value)
  );
}

function ReaderAnchor(props: {
  text: string;
  block: ReaderSourceBlock;
  chapterIndex: number;
  chapterOffset: number;
  highlights: Highlight[];
}) {
  const chunkHighlights = props.highlights.filter(
    (item) => item.chunk_index === props.block.sourceChunkIndex,
  );
  return (
    <span
      data-reader-text-start={props.block.sourceTextStart}
      data-reader-chunk-index={props.block.sourceChunkIndex}
      data-reader-chapter-index={props.chapterIndex}
      data-chapter-offset={props.chapterOffset}
    >
      {renderHighlights(props.text, props.block.sourceTextStart, chunkHighlights)}
    </span>
  );
}

export function BookReaderChapterContent(props: {
  chapter: ReaderChapter;
  chapterIndex: number;
  highlights: Highlight[];
}) {
  const chapter = props.chapter;
  return (
    <>
      <div
        className="reader-v3-chapter-opening"
        data-reader-chapter-opening={props.chapterIndex}
        data-chapter-title={chapter.title}
      >
        <div className="reader-v3-chapter-label">
          {chapter.kind === "chapter" && chapter.chapterNumber
            ? "CHAPTER " + String(chapter.chapterNumber)
            : chapter.kind.toUpperCase()}
        </div>
        <h2>{chapter.title}</h2>
      </div>
      {chapter.blocks.map((block, blockIndex) => {
        const key = String(props.chapterIndex) + ":" + String(blockIndex);
        if (block.kind === "list") {
          let chapterCursor = block.chapterTextStart;
          return (
            <ul key={key}>
              {(block.items ?? []).map((item, itemIndex) => {
                const sourceStart = block.sourceItemStarts?.[itemIndex] ?? block.sourceTextStart;
                const fakeBlock = { ...block, sourceTextStart: sourceStart };
                const offset = chapterCursor;
                chapterCursor += item.length + 2;
                return (
                  <li key={itemIndex}>
                    <ReaderAnchor
                      text={item}
                      block={fakeBlock}
                      chapterIndex={props.chapterIndex}
                      chapterOffset={offset}
                      highlights={props.highlights}
                    />
                  </li>
                );
              })}
            </ul>
          );
        }
        if (sceneBreak(block.text))
          return (
            <div key={key} className="reader-v3-scene-break" aria-label="Scene break">
              ⁂
            </div>
          );
        const anchor = (
          <ReaderAnchor
            text={block.text}
            block={block}
            chapterIndex={props.chapterIndex}
            chapterOffset={block.chapterTextStart}
            highlights={props.highlights}
          />
        );
        if (block.kind === "heading") {
          if (looksLikeLetterSignature(block.text))
            return (
              <p key={key} className="reader-v3-signature">
                {anchor}
              </p>
            );
          return (
            <h3 key={key} className="reader-v3-internal-heading">
              {anchor}
            </h3>
          );
        }
        if (block.kind === "quote") return <blockquote key={key}>{anchor}</blockquote>;
        if (block.kind === "principle") return <aside key={key}>{anchor}</aside>;
        return <p key={key}>{anchor}</p>;
      })}
      <div className="reader-v3-chapter-ornament" aria-hidden="true">
        ❧
      </div>
    </>
  );
}

