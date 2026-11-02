/** Pure pagination and DOM-anchor utilities shared by literature reader. */
export type LogicalBookPage = { rawPage: number | null };

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function buildLogicalBookPages(
  rawPageCount: number,
  rawChapterStarts: number[],
): {
  pages: LogicalBookPage[];
  chapterStarts: number[];
  rawToLogical: number[];
} {
  const pages: LogicalBookPage[] = [];
  const chapterStarts = Array.from({ length: rawChapterStarts.length }, () => 0);
  const rawToLogical = Array.from({ length: rawPageCount }, () => 0);
  const chapterAtRaw = new Map<number, number[]>();
  rawChapterStarts.forEach((rawPage, chapterIndex) => {
    const existing = chapterAtRaw.get(rawPage) ?? [];
    existing.push(chapterIndex);
    chapterAtRaw.set(rawPage, existing);
  });

  for (let rawPage = 0; rawPage < rawPageCount; rawPage += 1) {
    const startingChapters = chapterAtRaw.get(rawPage) ?? [];
    if (startingChapters.length && pages.length % 2 === 1) pages.push({ rawPage: null });
    startingChapters.forEach((chapterIndex) => {
      chapterStarts[chapterIndex] = pages.length;
    });
    rawToLogical[rawPage] = pages.length;
    pages.push({ rawPage });
  }

  return { pages, chapterStarts, rawToLogical };
}

export type FrontPage =
  | { kind: "title" }
  | {
      kind: "contents";
      entries: Array<{ chapterIndex: number; title: string; page: number }>;
      continued: boolean;
    }
  | { kind: "summary"; text: string; continued: boolean };

export type ReaderPosition = { chapterIndex: number; charOffset: number; chunkIndex: number };

export function toRoman(value: number): string {
  const pairs: Array<[number, string]> = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let n = Math.max(1, value);
  let result = "";
  for (const [amount, symbol] of pairs) {
    while (n >= amount) {
      result += symbol;
      n -= amount;
    }
  }
  return result;
}



export function scriptureFontFamily(language: string): string | undefined {
  const stacks: Record<string, string> = {
    Arabic: "'Noto Naskh Arabic', 'Traditional Arabic', serif",
    Urdu: "'Noto Nastaliq Urdu', 'Urdu Typesetting', serif",
    Hebrew: "'Noto Serif Hebrew', 'Times New Roman', serif",
    Greek: "'Noto Serif', 'Times New Roman', serif",
    Pali: "'Noto Serif', 'Times New Roman', serif",
    Tibetan: "'Noto Serif Tibetan', 'Microsoft Himalaya', serif",
    Sanskrit: "'Noto Serif Devanagari', 'Nirmala UI', serif",
    Hindi: "'Noto Serif Devanagari', 'Nirmala UI', serif",
    Chinese: "'Noto Serif CJK SC', 'Songti SC', SimSun, serif",
  };
  return stacks[language];
}

export function splitSummary(summary: string): string[] {
  const words = summary.trim().split(/\s+/u);
  if (!words.length) return [];
  const pages: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? current + " " + word : word;
    if (next.length > 900 && current) {
      pages.push(current);
      current = word;
    } else current = next;
  }
  if (current) pages.push(current);
  return pages;
}

export function findTextAnchor(node: Node | null): HTMLElement | null {
  const element =
    node instanceof HTMLElement
      ? node
      : node?.parentElement instanceof HTMLElement
        ? node.parentElement
        : null;
  return element?.closest<HTMLElement>("[data-reader-text-start]") ?? null;
}

export function textOffsetWithinAnchor(
  anchor: HTMLElement,
  boundaryNode: Node,
  boundaryOffset: number,
): number {
  const range = document.createRange();
  range.selectNodeContents(anchor);
  try {
    range.setEnd(boundaryNode, boundaryOffset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

export function textBoundaryAt(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (remaining <= node.data.length) return { node, offset: remaining };
    remaining -= node.data.length;
    node = walker.nextNode() as Text | null;
  }
  return null;
}

export function pageForBoundary(
  flow: HTMLElement,
  boundary: { node: Text; offset: number },
  pageWidth: number,
): number {
  const range = document.createRange();
  range.setStart(boundary.node, boundary.offset);
  range.setEnd(boundary.node, Math.min(boundary.node.length, boundary.offset + 1));
  const rect = range.getBoundingClientRect();
  const flowRect = flow.getBoundingClientRect();
  return Math.max(0, Math.round((rect.left - flowRect.left) / pageWidth));
}

