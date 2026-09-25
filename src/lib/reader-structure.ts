export type ReaderBlockKind = "heading" | "paragraph" | "quote" | "list" | "principle";

export interface ReaderBlock {
  kind: ReaderBlockKind;
  text: string;
  level?: 1 | 2 | 3;
  items?: string[];
}

export interface ReaderNavigationItem {
  index: number;
  title: string;
  kind: "part" | "chapter" | "section" | "front_matter" | "reading";
  depth: number;
}

const STRUCTURAL_HEADING =
  /^(?:part|book|volume|chapter|section|act|scene|story|poem|canto|stave|preface|foreword|introduction|dedication|prologue|epilogue|appendix|conclusion|contents)\b/i;
const PRINCIPLE_HEADING = /^(?:principle|rule|key idea|lesson)\b/i;

function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isAllCapsHeading(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4 || value.length > 100) return false;
  return letters === letters.toUpperCase();
}

export function classifyHeading(value: string): {
  kind: ReaderNavigationItem["kind"];
  level: 1 | 2 | 3;
} | null {
  const line = cleanLine(value);
  if (!line || line.length > 140) return null;
  if (/^(?:part|book|volume)\b/i.test(line)) return { kind: "part", level: 1 };
  if (/^(?:chapter|act|story|poem|canto|stave)\b/i.test(line)) {
    return { kind: "chapter", level: 2 };
  }
  if (/^(?:section|scene|appendix)\b/i.test(line)) return { kind: "section", level: 3 };
  if (/^(?:preface|foreword|introduction|dedication|prologue|contents)\b/i.test(line)) {
    return { kind: "front_matter", level: 2 };
  }
  if (STRUCTURAL_HEADING.test(line) || isAllCapsHeading(line)) {
    return { kind: "section", level: 3 };
  }
  return null;
}

/**
 * Turns one legacy text chunk into display blocks without changing the text.
 * This is deliberately conservative: only strong source-shaped signals become
 * headings/callouts; everything else stays a paragraph.
 */
export function parseReadableBlocks(content: string): ReaderBlock[] {
  const rawBlocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return rawBlocks.map((text) => {
    const lines = text.split("\n").map(cleanLine).filter(Boolean);
    const first = lines[0] ?? "";

    if (PRINCIPLE_HEADING.test(first) && text.length <= 500) {
      return { kind: "principle", text };
    }

    const heading = classifyHeading(first);
    if (lines.length === 1 && heading) {
      return { kind: "heading", text: first, level: heading.level };
    }

    const listItems = lines
      .map((line) => line.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/)?.[1]?.trim())
      .filter((item): item is string => Boolean(item));
    if (lines.length >= 2 && listItems.length === lines.length) {
      return { kind: "list", text, items: listItems };
    }

    if (
      text.length <= 700 &&
      (/^[“"]/u.test(first) || /^['‘]/u.test(first)) &&
      (/[”"]$/u.test(text) || /[’']$/u.test(text))
    ) {
      return { kind: "quote", text };
    }

    return { kind: "paragraph", text };
  });
}

function bestHeadingFromChunk(content: string): {
  title: string;
  kind: ReaderNavigationItem["kind"];
  depth: number;
} | null {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, 6);

  for (const block of blocks) {
    const first = cleanLine(block.split("\n")[0] ?? "");
    const match = classifyHeading(first);
    if (match) {
      return { title: first, kind: match.kind, depth: match.level - 1 };
    }
  }
  return null;
}

/**
 * Fallback navigation for legacy books that do not yet have semantic
 * structure rows. We surface detected literary headings; if a manuscript
 * has no reliable headings at all, we provide a small set of neutral
 * "Reading section" waypoints rather than hundreds of meaningless numbers.
 */
export function buildFallbackNavigation(
  rows: Array<{ chunk_index: number; content: string }>,
): ReaderNavigationItem[] {
  const sorted = [...rows].sort((a, b) => a.chunk_index - b.chunk_index);
  const detected: ReaderNavigationItem[] = [];
  let previousTitle = "";

  for (const row of sorted) {
    const heading = bestHeadingFromChunk(row.content);
    if (!heading) continue;
    const normalized = heading.title.toLowerCase();
    if (normalized === previousTitle) continue;
    previousTitle = normalized;
    detected.push({
      index: row.chunk_index,
      title: heading.title,
      kind: heading.kind,
      depth: heading.depth,
    });
  }

  if (detected.length >= 2) {
    if (detected.length <= 80) return detected;
    const strong = detected.filter(
      (item) => item.kind === "part" || item.kind === "chapter" || item.kind === "front_matter",
    );
    if (strong.length >= 2 && strong.length <= 80) return strong;
    const source = strong.length >= 2 ? strong : detected;
    const stride = Math.ceil(source.length / 60);
    return source.filter((_, i) => i % stride === 0).slice(0, 60);
  }

  if (sorted.length === 0) return [];
  const targetWaypoints = Math.min(20, sorted.length);
  const step = Math.max(1, Math.ceil(sorted.length / targetWaypoints));
  const fallback: ReaderNavigationItem[] = [];
  for (let i = 0; i < sorted.length; i += step) {
    fallback.push({
      index: sorted[i]!.chunk_index,
      title: `Reading section ${fallback.length + 1}`,
      kind: "reading",
      depth: 0,
    });
  }
  return fallback;
}
