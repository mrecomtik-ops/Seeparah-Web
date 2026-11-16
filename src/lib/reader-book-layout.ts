import {
  parseReadableBlocks,
  type ReaderBlock,
  type ReaderNavigationItem,
} from "@/lib/reader-structure";

export interface ReaderSourceBlock extends ReaderBlock {
  sourceChunkIndex: number;
  sourceTextStart: number;
  sourceTextEnd: number;
  sourceItemStarts?: number[];
  chapterTextStart: number;
}

export interface ReaderChapter {
  key: string;
  title: string;
  kind: "chapter" | "part" | "book" | "act";
  chapterNumber: number | null;
  startChunkIndex: number;
  blocks: ReaderSourceBlock[];
  textLength: number;
}

type SourceChunk = { chunkIndex: number; content: string };

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’‘]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function withSourceOffsets(chunk: SourceChunk): ReaderSourceBlock[] {
  const blocks = parseReadableBlocks(chunk.content);
  let cursor = 0;

  return blocks.map((block) => {
    if (block.kind === "list") {
      const starts: number[] = [];
      let first = cursor;
      for (const item of block.items ?? []) {
        starts.push(cursor);
        first = starts[0] ?? cursor;
        cursor += item.length + 2;
      }
      return {
        ...block,
        sourceChunkIndex: chunk.chunkIndex,
        sourceTextStart: first,
        sourceTextEnd: Math.max(first, cursor - 2),
        sourceItemStarts: starts,
        chapterTextStart: 0,
      };
    }

    const start = cursor;
    cursor += block.text.length + 2;
    return {
      ...block,
      sourceChunkIndex: chunk.chunkIndex,
      sourceTextStart: start,
      sourceTextEnd: start + block.text.length,
      chapterTextStart: 0,
    };
  });
}

function isBookBoundary(item: ReaderNavigationItem): item is ReaderNavigationItem & {
  kind: "chapter" | "part" | "book" | "act";
} {
  return (
    item.kind === "chapter" || item.kind === "part" || item.kind === "book" || item.kind === "act"
  );
}

type ChapterBoundary = { blockIndex: number; preserveBlock: boolean };

function sourceLabel(value: string): string {
  // Source structure may say "CHAPTER I" while typography prints
  // "CHAPTER I." followed by an all-caps subtitle. Ignore punctuation
  // at the very end of the label, but NEVER treat I as a prefix of II.
  return normalizeTitle(value.split(/\\s+[—–]\\s+/u)[0] ?? value)
    .replace(/[.,:;!?。]+$/u, "").trim();
}

/** A paragraph can contain a real source-backed chapter heading on its
 * first line (e.g. "CHAPTER I\\nTHE ONE THING NEEDFUL"). It must stay
 * readable; dropping the whole paragraph would silently delete text.
 * Limit this fallback to the exact independently verified source chunk.
 */
function isSourceLineBoundary(block: ReaderSourceBlock, item: ReaderNavigationItem): boolean {
  if (block.kind !== "heading" && block.kind !== "paragraph") return false;
  if (block.sourceChunkIndex !== item.index) return false;
  const firstLine = block.text.split(/\\r?\\n/u).find(line => line.trim()) ?? "";
  if (!firstLine || firstLine.length > 180) return false;
  return sourceLabel(firstLine) === sourceLabel(item.title);
}

function locateBoundary(
  blocks: ReaderSourceBlock[],
  item: ReaderNavigationItem,
  after: number,
): ChapterBoundary | null {
  const title = normalizeTitle(item.title);
  const candidates: Array<{ blockIndex: number; distance: number }> = [];

  for (let i = Math.max(0, after + 1); i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.kind !== "heading") continue;
    const actualTitle = normalizeTitle(block.text);
    const titleMatches =
      actualTitle === title ||
      (["chapter", "part", "book", "act"].includes(item.kind) &&
        actualTitle.startsWith(title + " — "));
    if (!titleMatches) continue;
    candidates.push({
      blockIndex: i,
      distance: Math.abs(block.sourceChunkIndex - item.index),
    });
  }

  const nearby = candidates.filter(candidate => candidate.distance <= 1)
    .sort((a, b) => a.distance - b.distance || a.blockIndex - b.blockIndex);
  if (nearby.length) return { blockIndex: nearby[0]!.blockIndex, preserveBlock: false };

  // A source-backed body paragraph or punctuated subtitle must beat a
  // distant similarly named heading in a different work/TOC page.
  for (let i = Math.max(0, after + 1); i < blocks.length; i++) {
    const block = blocks[i]!;
    if (isSourceLineBoundary(block, item)) {
      return { blockIndex: i, preserveBlock: block.kind !== "heading" };
    }
  }

  // Keep historical exact-heading behavior if the imported structure's
  // chunk boundary differs from the source parser's chunk segmentation.
  candidates.sort((a, b) => a.distance - b.distance || a.blockIndex - b.blockIndex);
  if (candidates.length) return { blockIndex: candidates[0]!.blockIndex, preserveBlock: false };
  return null;
}

function assignChapterOffsets(blocks: ReaderSourceBlock[]): {
  blocks: ReaderSourceBlock[];
  length: number;
} {
  let cursor = 0;
  const next = blocks.map((block) => {
    const chapterTextStart = cursor;
    if (block.kind === "list") {
      for (const item of block.items ?? []) cursor += item.length + 2;
    } else {
      cursor += block.text.length + 2;
    }
    return { ...block, chapterTextStart };
  });
  return { blocks: next, length: Math.max(0, cursor - 2) };
}

export function buildReaderChapters(
  chunks: SourceChunk[],
  navigation: ReaderNavigationItem[],
): ReaderChapter[] {
  const parsed = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex).flatMap(withSourceOffsets);

  const structural = navigation.filter(isBookBoundary);
  if (!parsed.length) return [];

  if (!structural.length) {
    const assigned = assignChapterOffsets(parsed);
    return [
      {
        key: "reading-0",
        title: navigation[0]?.title ?? "Reading",
        kind: "chapter",
        chapterNumber: 1,
        startChunkIndex: parsed[0]!.sourceChunkIndex,
        blocks: assigned.blocks,
        textLength: assigned.length,
      },
    ];
  }

  const boundaries: Array<{
    item: (typeof structural)[number];
    blockIndex: number;
    preserveBlock: boolean;
    chapterNumber: number | null;
  }> = [];
  let previous = -1;
  let chapterCounter = 0;

  for (const item of structural) {
    const found = locateBoundary(parsed, item, previous);
    if (!found) continue;
    if (item.kind === "chapter") chapterCounter += 1;
    boundaries.push({
      item,
      blockIndex: found.blockIndex,
      preserveBlock: found.preserveBlock,
      chapterNumber: item.kind === "chapter" ? chapterCounter : null,
    });
    previous = found.blockIndex;
  }

  if (!boundaries.length) {
    const assigned = assignChapterOffsets(parsed);
    return [
      {
        key: "reading-0",
        title: navigation[0]?.title ?? "Reading",
        kind: "chapter",
        chapterNumber: 1,
        startChunkIndex: parsed[0]!.sourceChunkIndex,
        blocks: assigned.blocks,
        textLength: assigned.length,
      },
    ];
  }

  return boundaries.map((boundary, index) => {
    const nextBoundary = boundaries[index + 1];
    const body = parsed.slice(
      boundary.blockIndex + (boundary.preserveBlock ? 0 : 1),
      nextBoundary ? nextBoundary.blockIndex : parsed.length,
    );
    const assigned = assignChapterOffsets(body);

    return {
      key: `${boundary.item.kind}:${index}:${boundary.item.index}`,
      title: boundary.item.title,
      kind: boundary.item.kind,
      chapterNumber: boundary.chapterNumber,
      startChunkIndex: boundary.item.index,
      blocks: assigned.blocks,
      textLength: assigned.length,
    };
  });
}

export function findReaderChapterByChunk(chapters: ReaderChapter[], chunkIndex: number): number {
  let match = 0;
  chapters.forEach((chapter, index) => {
    if (chapter.startChunkIndex <= chunkIndex) match = index;
  });
  return match;
}

export function chapterTextFromBlocks(chapter: ReaderChapter): string {
  return chapter.blocks
    .flatMap((block) => (block.kind === "list" ? (block.items ?? []) : [block.text]))
    .join("\n\n");
}