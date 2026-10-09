[Reading 1000 lines from start (total: 1588 lines, 588 remaining)]

import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  List,
  Loader2,
  Settings2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  addHighlight,
  getReaderBookContent,
  getReaderNavigation,
  listHighlights,
  listProgress,
  saveProgress,
} from "@/lib/library";
import {
  buildReaderChapters,
  findReaderChapterByChunk,
  type ReaderChapter,
  type ReaderSourceBlock,
} from "@/lib/reader-book-layout";
import { formatAuthorName } from "@/lib/author-name";
import { displayTitleCase } from "@/lib/display-text";
import { getPrefs, setPrefs, type ReaderTheme } from "@/lib/prefs";
import { useAuth } from "@/lib/use-auth";
import { ShelfButtons } from "@/components/ShelfButtons";
import {
  REQUESTABLE_TRANSLATION_LANGUAGES,
  RTL_LANGUAGES,
  type Book,
  type Highlight,
} from "@/lib/data";
import { requestBookTranslationAccess } from "@/lib/admin/translation-access.functions";
import { supabase } from "@/integrations/supabase/client";

const CONTENTS_PER_PAGE = 14;
const PHYSICAL_PAGE_GUTTER = 10;
const SPREAD_SPINE_GAP = 10;

type LogicalBookPage = { rawPage: number | null };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function buildLogicalBookPages(
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

type FrontPage =
  | { kind: "title" }
  | {
      kind: "contents";
      entries: Array<{ chapterIndex: number; title: string; page: number }>;
      continued: boolean;
    }
  | { kind: "summary"; text: string; continued: boolean };

type ReaderPosition = { chapterIndex: number; charOffset: number; chunkIndex: number };

function toRoman(value: number): string {
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

function languageToBcp47(language: string): string {
  const map: Record<string, string> = {
    English: "en",
    Urdu: "ur",
    Hindi: "hi",
    Arabic: "ar",
    Chinese: "zh-CN",
    Spanish: "es",
    French: "fr",
    German: "de",
    Russian: "ru",
    Portuguese: "pt",
    Bengali: "bn",
    Japanese: "ja",
    Korean: "ko",
    Indonesian: "id",
    Turkish: "tr",
    Persian: "fa",
    Punjabi: "pa",
    Italian: "it",
    Dutch: "nl",
    Polish: "pl",
    Ukrainian: "uk",
  };
  return map[language] ?? language.toLowerCase().slice(0, 2);
}

function splitSummary(summary: string): string[] {
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

function findTextAnchor(node: Node | null): HTMLElement | null {
  const element =
    node instanceof HTMLElement
      ? node
      : node?.parentElement instanceof HTMLElement
        ? node.parentElement
        : null;
  return element?.closest<HTMLElement>("[data-reader-text-start]") ?? null;
}

function textOffsetWithinAnchor(
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

function textBoundaryAt(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
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

function pageForBoundary(
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

function sceneBreak(text: string): boolean {
  return /^(?:\*\s*){3,}$|^⁂$/u.test(text.trim());
}

function looksLikeLetterSignature(text: string): boolean {
  const value = text.trim();
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

function ChapterBlocks(props: {
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

export function BookReaderV3({
  book,
  initialLanguage,
}: {
  book: Book;
  initialLanguage?: string | undefined;
}) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const prefs = useMemo(() => getPrefs(), []);
  const [language, setLanguage] = useState(
    initialLanguage && book.available_languages.includes(initialLanguage)
      ? initialLanguage
      : prefs.language && book.available_languages.includes(prefs.language)
        ? prefs.language
        : book.source_language,
  );
  const initialFontSize = Math.min(20, Math.max(16, prefs.fontSize || 18));
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [fontSizeDraft, setFontSizeDraft] = useState(initialFontSize);
  const [theme, setTheme] = useState<ReaderTheme>(prefs.theme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [requestLanguage, setRequestLanguage] = useState("");
  const [requestingTranslation, setRequestingTranslation] = useState(false);
  const [frontIndex, setFrontIndex] = useState<number | null>(0);
  const [bodyPage, setBodyPage] = useState(0);
  const [rawPageCount, setRawPageCount] = useState(1);
  const [rawChapterStartPages, setRawChapterStartPages] = useState<number[]>([]);
  const [pageSize, setPageSize] = useState({ width: 360, height: 540 });
  const [contentSize, setContentSize] = useState({ width: 280, height: 410 });
  const pageStride = contentSize.width + PHYSICAL_PAGE_GUTTER;
  const [mobileViewport, setMobileViewport] = useState(false);
  const [spreadMode, setSpreadMode] = useState(false);
  const [layoutMeasured, setLayoutMeasured] = useState(false);
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const [contentsReturnPosition, setContentsReturnPosition] = useState<ReaderPosition | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<ReaderPosition | null>(null);
  const pendingRestoreRef = useRef<ReaderPosition | null>(null);
  const capturePositionFnRef = useRef<(() => ReaderPosition | null) | null>(null);
  const fontChangeAnchorRef = useRef<ReaderPosition | null>(null);
  const fontApplyTimerRef = useRef<number | null>(null);
  const fontChangeTimerRef = useRef<number | null>(null);
  const lastPageSizeRef = useRef({ width: 360, height: 540 });
  const touchStartRef = useRef<number | null>(null);
  const seededKeyRef = useRef<string | null>(null);

  const contentQuery = useQuery({
    queryKey: ["reader-book-content", book.id, language],
    queryFn: () => getReaderBookContent(book.id, language),
  });
  const navigationQuery = useQuery({
    queryKey: ["reader-navigation", book.id, language],
    queryFn: () => getReaderNavigation(book.id, language),
  });
  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId),
  });
  const highlightsQuery = useQuery({
    queryKey: ["highlights", userId],
    queryFn: () => listHighlights(userId),
  });

  const chapters = useMemo(
    () => buildReaderChapters(contentQuery.data?.chunks ?? [], navigationQuery.data ?? []),
    [contentQuery.data?.chunks, navigationQuery.data],
  );
  const highlights = useMemo(
    () =>
      (highlightsQuery.data ?? []).filter(
        (item) => item.book_id === book.id && item.language === language,
      ),
    [book.id, highlightsQuery.data, language],
  );
  const requestableLanguages = useMemo(
    () =>
      REQUESTABLE_TRANSLATION_LANGUAGES.filter(
        (item) => item !== book.source_language && !book.available_languages.includes(item),
      ),
    [book.available_languages, book.source_language],
  );

  const logicalLayout = useMemo(
    () => buildLogicalBookPages(rawPageCount, rawChapterStartPages),
    [rawChapterStartPages, rawPageCount],
  );
  const logicalPages = logicalLayout.pages;
  const chapterStartPages = logicalLayout.chapterStarts;
  const bodyPageCount = logicalPages.length;
  const displayBookTitle = useMemo(() => displayTitleCase(book.title), [book.title]);

  const frontPages = useMemo<FrontPage[]>(() => {
    const pages: FrontPage[] = [{ kind: "title" }];
    for (let start = 0; start < chapters.length; start += CONTENTS_PER_PAGE) {
      pages.push({
        kind: "contents",
        continued: start > 0,
        entries: chapters.slice(start, start + CONTENTS_PER_PAGE).map((chapter, local) => {
          const chapterIndex = start + local;
          return {
            chapterIndex,
            title: chapter.title,
            page: (chapterStartPages[chapterIndex] ?? 0) + 1,
          };
        }),
      });
    }
    const summary = book.description?.trim();
    if (summary)
      splitSummary(summary).forEach((text, index) =>
        pages.push({ kind: "summary", text, continued: index > 0 }),
      );
    return pages;
  }, [book.description, chapterStartPages, chapters]);

  const chapterIndexForLogicalPage = useCallback(
    (logicalPage: number) => {
      let match = 0;
      chapterStartPages.forEach((start, index) => {
        if (start <= logicalPage) match = index;
      });
      return Math.min(match, Math.max(0, chapters.length - 1));
    },
    [chapterStartPages, chapters.length],
  );

  const activeLogicalPage = useMemo(() => {
    if (!bodyPageCount) return 0;
    let candidate = Math.min(bodyPage, bodyPageCount - 1);
    if (spreadMode && candidate > 0) {
      const leftPage = candidate - 1;
      if (logicalPages[leftPage]?.rawPage != null) candidate = leftPage;
    }
    if (logicalPages[candidate]?.rawPage == null && candidate > 0) candidate -= 1;
    return Math.max(0, candidate);
  }, [bodyPage, bodyPageCount, logicalPages, spreadMode]);
  const currentChapterIndex = chapterIndexForLogicalPage(activeLogicalPage);
  const storageKey = "seeparah:reader-v3:" + userId + ":" + book.id + ":" + language;
  const seedKey = userId + ":" + book.id + ":" + language;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const availableWidth = Math.max(220, stage.clientWidth - 32);
      const availableHeight = Math.max(330, stage.clientHeight - 24);
      const nextSpread = stage.clientWidth >= 900 && window.innerWidth > window.innerHeight;
      setSpreadMode(nextSpread);
      setMobileViewport(stage.clientWidth < 640);
      const widthByLayout = nextSpread
        ? Math.max(220, (availableWidth - SPREAD_SPINE_GAP) / 2)
        : availableWidth;
      const width = Math.floor(Math.min(560, widthByLayout, (availableHeight * 2) / 3));
      const nextSize = { width, height: Math.floor(width * 1.5) };
      const previous = lastPageSizeRef.current;
      if (previous.width === nextSize.width && previous.height === nextSize.height) return;

      if (frontIndex === null && layoutMeasured) {
        const position = capturePositionFnRef.current?.() ?? positionRef.current;
        if (position) {
          positionRef.current = position;
          pendingRestoreRef.current = position;
        }
      }
      lastPageSizeRef.current = nextSize;
      setLayoutMeasured(false);
      setPageSize(nextSize);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [chapters.length, frontIndex, layoutMeasured]);

  useEffect(() => {
    if (!spreadMode || frontIndex !== null) return;
    setBodyPage((page) => (page % 2 === 0 ? page : page + 1));
  }, [frontIndex, spreadMode]);

  const capturePosition = useCallback((): ReaderPosition | null => {
    const flow = flowRef.current;
    const rawBodyPage = logicalPages[activeLogicalPage]?.rawPage;
    if (!flow || rawBodyPage == null || contentSize.width <= 0 || !chapters.length)
      return positionRef.current;
    const selector =
      '[data-reader-chapter-index="' + String(currentChapterIndex) + '"][data-chapter-offset]';
    const anchors = Array.from(flow.querySelectorAll<HTMLElement>(selector));
    for (const anchor of anchors) {
      const chapterStart = Number(anchor.dataset["chapterOffset"] ?? 0);
      const chunkIndex = Number(
        anchor.dataset["readerChunkIndex"] ?? chapters[currentChapterIndex]?.startChunkIndex ?? 0,
      );
      const length = anchor.textContent?.length ?? 0;
      if (!length) continue;
      const firstBoundary = textBoundaryAt(anchor, 0);
      const lastBoundary = textBoundaryAt(anchor, Math.max(0, length - 1));
      if (!firstBoundary || !lastBoundary) continue;
      const firstPage = pageForBoundary(flow, firstBoundary, pageStride);
      const lastPage = pageForBoundary(flow, lastBoundary, pageStride);
      if (rawBodyPage < firstPage || rawBodyPage > lastPage) continue;
      let lo = 0,
        hi = Math.max(0, length - 1);
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const boundary = textBoundaryAt(anchor, mid);
        if (!boundary) break;
        if (pageForBoundary(flow, boundary, pageStride) < rawBodyPage) lo = mid + 1;
        else hi = mid;
      }
      const position = {
        chapterIndex: currentChapterIndex,
        charOffset: chapterStart + lo,
        chunkIndex,
      };
      positionRef.current = position;
      return position;
    }
    const fallback = {
      chapterIndex: currentChapterIndex,
      charOffset: 0,
      chunkIndex: chapters[currentChapterIndex]?.startChunkIndex ?? 0,
    };
    positionRef.current = fallback;
    return fallback;
  }, [
    activeLogicalPage,
    chapters,
    contentSize.width,
    currentChapterIndex,
    logicalPages,
    pageStride,
  ]);

  useEffect(() => {
    capturePositionFnRef.current = capturePosition;
    return () => {
      capturePositionFnRef.current = null;
    };
  }, [capturePosition]);

  const restorePosition = useCallback(
    (position: ReaderPosition) => {
      const flow = flowRef.current;
      if (!flow || contentSize.width <= 0) return;
      const selector =
        '[data-reader-chapter-index="' + String(position.chapterIndex) + '"][data-chapter-offset]';
      const anchors = Array.from(flow.querySelectorAll<HTMLElement>(selector));
      let target = anchors[0] ?? null;
      for (const anchor of anchors) {
        const start = Number(anchor.dataset["chapterOffset"] ?? 0);
        const length = anchor.textContent?.length ?? 0;
        if (position.charOffset >= start && position.charOffset <= start + length) {
          target = anchor;
          break;
        }
        if (start <= position.charOffset) target = anchor;
      }
      if (!target) {
        setBodyPage(chapterStartPages[position.chapterIndex] ?? 0);
        return;
      }
      const start = Number(target.dataset["chapterOffset"] ?? 0);
      const relative = Math.max(
        0,
        Math.min((target.textContent?.length ?? 1) - 1, position.charOffset - start),
      );
      const boundary = textBoundaryAt(target, relative);
      if (!boundary) return;
      const rawPage = pageForBoundary(flow, boundary, pageStride);
      const logicalPage = logicalLayout.rawToLogical[rawPage] ?? 0;
      setBodyPage(spreadMode && logicalPage % 2 === 1 ? logicalPage + 1 : logicalPage);
    },
    [chapterStartPages, contentSize.width, logicalLayout.rawToLogical, pageStride, spreadMode],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const flow = flowRef.current;
    if (!viewport || !flow || !chapters.length) return;
    setLayoutMeasured(false);
    const measure = () => {
      const width = Math.max(1, Math.floor(viewport.clientWidth));
      const height = Math.max(1, Math.floor(viewport.clientHeight));
      setContentSize({ width, height });
      const stride = width + PHYSICAL_PAGE_GUTTER;
      setRawPageCount(Math.max(1, Math.ceil((flow.scrollWidth + PHYSICAL_PAGE_GUTTER) / stride)));
      const flowRect = flow.getBoundingClientRect();
      setRawChapterStartPages(
        chapters.map((_, index) => {
          const opening = flow.querySelector<HTMLElement>(
            '[data-reader-chapter-opening="' + String(index) + '"]',
          );
          return opening
            ? Math.max(
                0,
                Math.round((opening.getBoundingClientRect().left - flowRect.left) / stride),
              )
            : 0;
        }),
      );
      setLayoutMeasured(true);
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(() => requestAnimationFrame(measure));
    observer.observe(viewport);
    observer.observe(flow);
    void document.fonts?.ready.then(() => requestAnimationFrame(measure));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [chapters, fontSize, pageSize.height, pageSize.width]);

  useLayoutEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!layoutMeasured || !pending || !logicalPages.length) return;
    pendingRestoreRef.current = null;
    const frame = requestAnimationFrame(() => restorePosition(pending));
    return () => cancelAnimationFrame(frame);
  }, [layoutMeasured, logicalPages.length, restorePosition]);

  useEffect(() => {
    if (!chapters.length || !progressQuery.data || seededKeyRef.current === seedKey) return;
    seededKeyRef.current = seedKey;
    let restored: ReaderPosition | null = null;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) restored = JSON.parse(saved) as ReaderPosition;
    } catch {
      restored = null;
    }
    if (!restored) {
      const savedProgress = progressQuery.data.find(
        (item) => item.book_id === book.id && item.language === language,
      );
      if (savedProgress) {
        const chapterIndex = findReaderChapterByChunk(chapters, savedProgress.last_chunk_index);
        restored = { chapterIndex, charOffset: 0, chunkIndex: savedProgress.last_chunk_index };
      }
    }
    if (restored) {
      setFrontIndex(null);
      positionRef.current = restored;
      pendingRestoreRef.current = restored;
      if (layoutMeasured) {
        requestAnimationFrame(() => {
          if (pendingRestoreRef.current !== restored) return;
          pendingRestoreRef.current = null;
          restorePosition(restored);
        });
      }
    }
  }, [
    book.id,
    chapters,
    language,
    layoutMeasured,
    progressQuery.data,
    restorePosition,
    seedKey,
    storageKey,
  ]);

  useEffect(() => {
    if (
      frontIndex !== null ||
      !chapters.length ||
      !layoutMeasured ||
      pendingRestoreRef.current ||
      fontChangeAnchorRef.current
    )
      return;
    const timer = window.setTimeout(() => {
      if (!layoutMeasured || pendingRestoreRef.current || fontChangeAnchorRef.current) return;
      const position = capturePosition();
      if (!position) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(position));
      } catch {
        // Precise local position is best-effort; account progress still persists below.
      }
      void saveProgress(userId, book.id, language, position.chunkIndex);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [
    bodyPage,
    book.id,
    capturePosition,
    chapters.length,
    frontIndex,
    language,
    layoutMeasured,
    storageKey,
    userId,
  ]);

  useEffect(
    () => () => {
      if (fontApplyTimerRef.current != null) window.clearTimeout(fontApplyTimerRef.current);
      if (fontChangeTimerRef.current != null) window.clearTimeout(fontChangeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    document.body.classList.add("reader-v3-body");
    if (theme === "dark") document.body.classList.add("dark");
    if (theme === "sepia") document.body.classList.add("reader-sepia");
    return () => document.body.classList.remove("reader-v3-body", "dark", "reader-sepia");
  }, [theme]);

  const lastFrontSpreadAnchor =
    frontPages.length <= 1 ? 0 : 1 + 2 * Math.floor((frontPages.length - 2) / 2);
  const lastBodySpreadRight =
    bodyPageCount <= 1 ? 0 : (bodyPageCount - 1) % 2 === 0 ? bodyPageCount - 1 : bodyPageCount;

  useEffect(() => {
    if (!layoutMeasured || !bodyPageCount) return;
    setBodyPage((page) => {
      const maximum = spreadMode
        ? Math.max(0, lastBodySpreadRight)
        : Math.max(0, bodyPageCount - 1);
      return Math.min(Math.max(0, page), maximum);
    });
  }, [bodyPageCount, layoutMeasured, lastBodySpreadRight, spreadMode]);

  const goBodyPage = useCallback(
    (delta: number) => {
      const direction = delta > 0 ? 1 : -1;
      setTurning(direction > 0 ? "next" : "prev");

      if (frontIndex !== null) {
        if (!spreadMode) {
          const next = frontIndex + direction;
          if (next >= 0 && next < frontPages.length) setFrontIndex(next);
          else if (direction > 0) {
            setFrontIndex(null);
            setBodyPage(0);
          }
          return;
        }

        if (direction < 0) {
          if (frontIndex === 0) return;
          setFrontIndex(frontIndex <= 1 ? 0 : Math.max(1, frontIndex - 2));
          return;
        }
        if (frontIndex === 0 && frontPages.length > 1) {
          setFrontIndex(1);
          return;
        }
        const nextFront = frontIndex + 2;
        if (nextFront < frontPages.length) {
          setFrontIndex(nextFront);
          return;
        }
        setFrontIndex(null);
        setBodyPage(0);
        return;
      }

      if (!spreadMode) {
        const next = bodyPage + direction;
        if (direction < 0 && next < 0) {
          setFrontIndex(Math.max(0, frontPages.length - 1));
          return;
        }
        if (next < 0 || next >= bodyPageCount) return;
        setBodyPage(next);
        return;
      }

      const next = bodyPage + direction * 2;
      if (direction < 0 && next < 0) {
        setFrontIndex(lastFrontSpreadAnchor);
        return;
      }
      if (next < 0 || next > lastBodySpreadRight) return;
      setBodyPage(next);
    },
    [
      bodyPage,
      bodyPageCount,
      frontIndex,
      frontPages.length,
      lastBodySpreadRight,
      lastFrontSpreadAnchor,
      spreadMode,
    ],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const editableTarget =
        target instanceof Element &&
        (target.matches("input,textarea,select,button,[role='button']") ||
          (target instanceof HTMLElement && target.isContentEditable));
      if (editableTarget || settingsOpen) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBodyPage(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goBodyPage(1);
      } else if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBodyPage, settingsOpen]);

  useEffect(() => {
    if (!turning) return;
    const timer = window.setTimeout(() => setTurning(null), 190);
    return () => window.clearTimeout(timer);
  }, [turning]);

  const openContents = useCallback(() => {
    if (frontIndex === null) {
      const position = capturePosition();
      if (position) setContentsReturnPosition(position);
    }
    setFrontIndex(Math.min(1, frontPages.length - 1));
  }, [capturePosition, frontIndex, frontPages.length]);

  const returnFromContents = useCallback(() => {
    const position = contentsReturnPosition;
    setContentsReturnPosition(null);
    if (!position) return;
    setFrontIndex(null);
    positionRef.current = position;
    pendingRestoreRef.current = position;
    if (layoutMeasured) {
      requestAnimationFrame(() => {
        if (pendingRestoreRef.current !== position) return;
        pendingRestoreRef.current = null;
        restorePosition(position);
      });
    }
  }, [contentsReturnPosition, layoutMeasured, restorePosition]);

  const jumpToChapter = useCallback(
    (chapterIndex: number) => {
      setContentsReturnPosition(null);
      setFrontIndex(null);
      setBodyPage(chapterStartPages[chapterIndex] ?? 0);
    },
    [chapterStartPages],
  );

  const changeFontSize = (next: number) => {
    setFontSizeDraft(next);

    if (frontIndex === null) {
      let anchor = fontChangeAnchorRef.current;
      if (!anchor && layoutMeasured) anchor = capturePosition();
      if (!anchor) anchor = positionRef.current;
      if (anchor) {
        fontChangeAnchorRef.current = anchor;
        positionRef.current = anchor;
        pendingRestoreRef.current = anchor;
      }
    }

    if (fontApplyTimerRef.current != null) window.clearTimeout(fontApplyTimerRef.current);
    if (fontChangeTimerRef.current != null) {
      window.clearTimeout(fontChangeTimerRef.current);
      fontChangeTimerRef.current = null;
    }

    fontApplyTimerRef.current = window.setTimeout(() => {
      const anchor = fontChangeAnchorRef.current;
      if (anchor) {
        positionRef.current = anchor;
        pendingRestoreRef.current = anchor;
      }

      setLayoutMeasured(false);
      setFontSize(next);
      setPrefs({ fontSize: next });
      fontApplyTimerRef.current = null;

      fontChangeTimerRef.current = window.setTimeout(() => {
        const stableAnchor = fontChangeAnchorRef.current;
        fontChangeAnchorRef.current = null;
        fontChangeTimerRef.current = null;
        if (!stableAnchor) return;
        positionRef.current = stableAnchor;
        try {
          localStorage.setItem(storageKey, JSON.stringify(stableAnchor));
        } catch {
          // The precise local reading anchor is best-effort.
        }
        void saveProgress(userId, book.id, language, stableAnchor.chunkIndex);
      }, 700);
    }, 220);
  };

  const changeLanguage = (next: string) => {
    seededKeyRef.current = null;
    setFrontIndex(0);
    setBodyPage(0);
    setLayoutMeasured(false);
    setLanguage(next);
    setPrefs({ language: next });
  };

[executed on device: DESKTOP-VDOJS9H (d3e04abe-8ee0-48d4-927b-2b89ba48ace9)]