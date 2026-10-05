import type { ReaderBlock, ReaderNavigationItem } from "@/lib/reader-structure";

export type ReaderFrontPage =
  | {
      kind: "summary";
      title: string;
      body: string;
      pageNumber: number;
      pageCount: number;
    }
  | {
      kind: "contents";
      title: string;
      items: ReaderNavigationItem[];
      pageNumber: number;
      pageCount: number;
    };

const CONTENTS_ITEMS_PER_PAGE = 10;
const SUMMARY_CHARACTERS_PER_PAGE = 1000;

function splitSummary(summary: string): string[] {
  const paragraphs = summary
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/u)
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .filter(Boolean);

  const pages: string[] = [];
  let current = "";

  const flush = () => {
    if (!current.trim()) return;
    pages.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    for (const word of paragraph.split(/\s+/u)) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > SUMMARY_CHARACTERS_PER_PAGE && current) flush();
      current = current ? `${current} ${word}` : word;
    }
    if (current && current.length >= SUMMARY_CHARACTERS_PER_PAGE * 0.8) flush();
  }

  flush();
  return pages.length ? pages : [summary.trim()];
}

export function buildReaderFrontPages(
  description: string | null | undefined,
  navigation: ReaderNavigationItem[],
): ReaderFrontPage[] {
  const pages: ReaderFrontPage[] = [];

  if (navigation.length > 0) {
    const pageCount = Math.max(1, Math.ceil(navigation.length / CONTENTS_ITEMS_PER_PAGE));
    for (let pageNumber = 0; pageNumber < pageCount; pageNumber++) {
      pages.push({
        kind: "contents",
        title: pageNumber === 0 ? "Contents" : "Contents — continued",
        items: navigation.slice(
          pageNumber * CONTENTS_ITEMS_PER_PAGE,
          (pageNumber + 1) * CONTENTS_ITEMS_PER_PAGE,
        ),
        pageNumber,
        pageCount,
      });
    }
  }

  const summary = description?.trim();
  if (summary) {
    const summaryPages = splitSummary(summary);
    summaryPages.forEach((body, pageNumber) => {
      pages.push({
        kind: "summary",
        title: pageNumber === 0 ? "About this book" : "About this book — continued",
        body,
        pageNumber,
        pageCount: summaryPages.length,
      });
    });
  }

  return pages;
}

export function blockStartsFreshBookPage(block: ReaderBlock, blockIndex: number): boolean {
  if (blockIndex === 0 || block.kind !== "heading") return false;
  return (
    block.navigationKind === "chapter" ||
    block.navigationKind === "part" ||
    block.navigationKind === "book" ||
    block.navigationKind === "act"
  );
}