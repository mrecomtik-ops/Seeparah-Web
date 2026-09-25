import { classifyHeading } from "@/lib/reader-structure";

export interface ManuscriptStructureNode {
  nodeKey: string;
  parentNodeKey: string | null;
  nodeType: "front_matter" | "part" | "chapter" | "section";
  title: string;
  ordinal: number;
  depth: number;
  startChunkIndex: number;
  endChunkIndex: number;
}

export interface ParsedManuscript {
  chunks: string[];
  structure: ManuscriptStructureNode[];
  wordCount: number;
  estimatedReadingMinutes: number;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

function headingTitle(block: string): string {
  const lines = block
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  const second = lines[1] ?? "";
  if (
    second &&
    second.length <= 100 &&
    /^(?:part|book|volume|chapter|section|act|scene|story|poem|canto|stave)\b/i.test(first) &&
    !classifyHeading(second)
  ) {
    return `${first} — ${second}`;
  }
  return first;
}

function firstLine(block: string): string {
  return block.split("\n")[0]?.replace(/\s+/g, " ").trim() ?? "";
}

function fallbackGroups(blocks: string[]): Array<{ start: number; end: number }> {
  const groups: Array<{ start: number; end: number }> = [];
  let start = 0;
  let words = 0;
  let paragraphs = 0;

  for (let i = 0; i < blocks.length; i++) {
    words += wordCount(blocks[i] ?? "");
    paragraphs += 1;
    const shouldBreak = words >= 900 || paragraphs >= 12;
    if (shouldBreak) {
      groups.push({ start, end: i });
      start = i + 1;
      words = 0;
      paragraphs = 0;
    }
  }
  if (start < blocks.length) groups.push({ start, end: blocks.length - 1 });
  return groups;
}

function structuredGroups(
  blocks: string[],
  headings: Array<ReturnType<typeof classifyHeading>>,
): Array<{ start: number; end: number }> | null {
  const chapterStarts: number[] = [];
  const partStarts: number[] = [];

  headings.forEach((heading, i) => {
    if (!heading) return;
    if (heading.kind === "chapter") chapterStarts.push(i);
    if (heading.kind === "part") partStarts.push(i);
  });

  let starts: number[] = [];
  if (chapterStarts.length >= 2) {
    starts = chapterStarts.map((chapterIndex, chapterOrdinal) => {
      const previousChapter = chapterOrdinal === 0 ? -1 : chapterStarts[chapterOrdinal - 1]!;
      const immediatelyBefore = chapterIndex - 1;
      if (
        immediatelyBefore > previousChapter &&
        headings[immediatelyBefore]?.kind === "part"
      ) {
        return immediatelyBefore;
      }
      return chapterIndex;
    });
  } else if (partStarts.length >= 2) {
    starts = partStarts;
  } else {
    return null;
  }

  starts = [...new Set(starts)].sort((a, b) => a - b);
  const groups: Array<{ start: number; end: number }> = [];
  if (starts[0]! > 0) groups.push({ start: 0, end: starts[0]! - 1 });
  for (let i = 0; i < starts.length; i++) {
    groups.push({
      start: starts[i]!,
      end: (starts[i + 1] ?? blocks.length) - 1,
    });
  }
  return groups.filter((group) => group.end >= group.start);
}

/**
 * Parse plain text into reader-sized sections while preserving the original
 * text exactly (apart from outer whitespace). Strong literary headings are
 * preferred as boundaries. Manuscripts without reliable headings are grouped
 * into substantially larger reading sections than the old fixed four-
 * paragraph pages, which reduces page-turn churn without inventing chapters.
 */
export function parseManuscript(text: string): ParsedManuscript {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { chunks: [""], structure: [], wordCount: 0, estimatedReadingMinutes: 0 };
  }

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    const count = wordCount(normalized);
    return {
      chunks: [normalized],
      structure: [],
      wordCount: count,
      estimatedReadingMinutes: Math.max(1, Math.ceil(count / 225)),
    };
  }

  const headings = blocks.map((block) => classifyHeading(firstLine(block)));
  const groups = structuredGroups(blocks, headings) ?? fallbackGroups(blocks);

  const chunks = groups.map((group) => blocks.slice(group.start, group.end + 1).join("\n\n"));
  const blockToChunk = new Map<number, number>();
  groups.forEach((group, chunkIndex) => {
    for (let i = group.start; i <= group.end; i++) blockToChunk.set(i, chunkIndex);
  });

  const structure: ManuscriptStructureNode[] = [];
  let currentPart: string | null = null;
  let currentChapter: string | null = null;
  let ordinal = 0;

  headings.forEach((heading, blockIndex) => {
    if (!heading) return;
    const chunkIndex = blockToChunk.get(blockIndex);
    if (chunkIndex === undefined) return;

    const nodeType: ManuscriptStructureNode["nodeType"] =
      heading.kind === "part"
        ? "part"
        : heading.kind === "chapter"
          ? "chapter"
          : heading.kind === "front_matter"
            ? "front_matter"
            : "section";

    const nodeKey = `${nodeType}-${String(ordinal + 1).padStart(4, "0")}`;
    const title = headingTitle(blocks[blockIndex] ?? "");
    if (!title) return;

    let parentNodeKey: string | null = null;
    if (nodeType === "part") {
      currentPart = nodeKey;
      currentChapter = null;
    } else if (nodeType === "chapter") {
      parentNodeKey = currentPart;
      currentChapter = nodeKey;
    } else if (nodeType === "section") {
      parentNodeKey = currentChapter ?? currentPart;
    }

    structure.push({
      nodeKey,
      parentNodeKey,
      nodeType,
      title,
      ordinal,
      depth: nodeType === "part" ? 0 : nodeType === "chapter" ? 1 : nodeType === "section" ? 2 : 0,
      startChunkIndex: chunkIndex,
      endChunkIndex: chunkIndex,
    });
    ordinal += 1;
  });

  const count = wordCount(normalized);
  return {
    chunks: chunks.length ? chunks : [normalized],
    structure,
    wordCount: count,
    estimatedReadingMinutes: Math.max(1, Math.ceil(count / 225)),
  };
}

export function splitManuscript(text: string): string[] {
  return parseManuscript(text).chunks;
}
