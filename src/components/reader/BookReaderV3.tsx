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

const CONTENTS_PER_PAGE = 8;

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
        if (block.kind === "heading")
          return (
            <h3 key={key} className="reader-v3-internal-heading">
              {anchor}
            </h3>
          );
        if (block.kind === "quote") return <blockquote key={key}>{anchor}</blockquote>;
        if (block.kind === "principle") return <aside key={key}>{anchor}</aside>;
        return <p key={key}>{anchor}</p>;
      })}
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
  const [fontSize, setFontSize] = useState(Math.min(20, Math.max(16, prefs.fontSize || 18)));
  const [theme, setTheme] = useState<ReaderTheme>(prefs.theme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [requestLanguage, setRequestLanguage] = useState("");
  const [requestingTranslation, setRequestingTranslation] = useState(false);
  const [frontIndex, setFrontIndex] = useState<number | null>(0);
  const [bodyPage, setBodyPage] = useState(0);
  const [bodyPageCount, setBodyPageCount] = useState(1);
  const [chapterStartPages, setChapterStartPages] = useState<number[]>([]);
  const [pageSize, setPageSize] = useState({ width: 360, height: 540 });
  const [contentSize, setContentSize] = useState({ width: 280, height: 410 });
  const [mobileViewport, setMobileViewport] = useState(false);
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<ReaderPosition | null>(null);
  const pendingRestoreRef = useRef<ReaderPosition | null>(null);
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

  const currentChapterIndex = useMemo(() => {
    let match = 0;
    chapterStartPages.forEach((start, index) => {
      if (start <= bodyPage) match = index;
    });
    return Math.min(match, Math.max(0, chapters.length - 1));
  }, [bodyPage, chapterStartPages, chapters.length]);
  const currentChapter = chapters[currentChapterIndex];
  const chapterOpeningPage = chapterStartPages[currentChapterIndex] === bodyPage;
  const storageKey = "seeparah:reader-v3:" + userId + ":" + book.id + ":" + language;
  const seedKey = userId + ":" + book.id + ":" + language;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const availableWidth = Math.max(220, stage.clientWidth - 32);
      const availableHeight = Math.max(330, stage.clientHeight - 24);
      setMobileViewport(stage.clientWidth < 640);
      const width = Math.floor(Math.min(560, availableWidth, (availableHeight * 2) / 3));
      setPageSize({ width, height: Math.floor(width * 1.5) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [chapters.length]);

  const capturePosition = useCallback((): ReaderPosition | null => {
    const flow = flowRef.current;
    if (!flow || contentSize.width <= 0 || !chapters.length) return positionRef.current;
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
      const firstPage = pageForBoundary(flow, firstBoundary, contentSize.width);
      const lastPage = pageForBoundary(flow, lastBoundary, contentSize.width);
      if (bodyPage < firstPage || bodyPage > lastPage) continue;
      let lo = 0,
        hi = Math.max(0, length - 1);
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const boundary = textBoundaryAt(anchor, mid);
        if (!boundary) break;
        if (pageForBoundary(flow, boundary, contentSize.width) < bodyPage) lo = mid + 1;
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
  }, [bodyPage, chapters, contentSize.width, currentChapterIndex]);

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
      setBodyPage(Math.min(bodyPageCount - 1, pageForBoundary(flow, boundary, contentSize.width)));
    },
    [bodyPageCount, chapterStartPages, contentSize.width],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const flow = flowRef.current;
    if (!viewport || !flow || !chapters.length) return;
    const measure = () => {
      const width = Math.max(1, Math.floor(viewport.clientWidth));
      const height = Math.max(1, Math.floor(viewport.clientHeight));
      setContentSize({ width, height });
      setBodyPageCount(Math.max(1, Math.ceil(flow.scrollWidth / width)));
      const flowRect = flow.getBoundingClientRect();
      setChapterStartPages(
        chapters.map((_, index) => {
          const opening = flow.querySelector<HTMLElement>(
            '[data-reader-chapter-opening="' + String(index) + '"]',
          );
          return opening
            ? Math.max(
                0,
                Math.round((opening.getBoundingClientRect().left - flowRect.left) / width),
              )
            : 0;
        }),
      );
      const pending = pendingRestoreRef.current;
      if (pending) {
        pendingRestoreRef.current = null;
        requestAnimationFrame(() => restorePosition(pending));
      }
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
  }, [chapters, fontSize, pageSize.height, pageSize.width, restorePosition]);

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
    }
  }, [book.id, chapters, language, progressQuery.data, seedKey, storageKey]);

  useEffect(() => {
    if (frontIndex !== null || !chapters.length) return;
    const timer = window.setTimeout(() => {
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
    storageKey,
    userId,
  ]);

  useEffect(() => {
    document.body.classList.add("reader-v3-body");
    if (theme === "dark") document.body.classList.add("dark");
    if (theme === "sepia") document.body.classList.add("reader-sepia");
    return () => document.body.classList.remove("reader-v3-body", "dark", "reader-sepia");
  }, [theme]);

  const goBodyPage = useCallback(
    (delta: number) => {
      if (frontIndex !== null) {
        const next = frontIndex + delta;
        if (next >= 0 && next < frontPages.length) {
          setTurning(delta > 0 ? "next" : "prev");
          setFrontIndex(next);
        } else if (delta > 0 && next >= frontPages.length) {
          setTurning("next");
          setFrontIndex(null);
          setBodyPage(0);
        }
        return;
      }
      const next = bodyPage + delta;
      if (delta < 0 && next < 0) {
        setTurning("prev");
        setFrontIndex(Math.max(0, frontPages.length - 1));
        return;
      }
      if (next < 0 || next >= bodyPageCount) return;
      setTurning(delta > 0 ? "next" : "prev");
      setBodyPage(next);
    },
    [bodyPage, bodyPageCount, frontIndex, frontPages.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input,textarea,select") || target?.isContentEditable || settingsOpen)
        return;
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

  const jumpToChapter = useCallback(
    (chapterIndex: number) => {
      setFrontIndex(null);
      setBodyPage(chapterStartPages[chapterIndex] ?? 0);
    },
    [chapterStartPages],
  );

  const changeFontSize = (next: number) => {
    if (frontIndex === null) {
      const position = capturePosition();
      if (position) pendingRestoreRef.current = position;
    }
    setFontSize(next);
    setPrefs({ fontSize: next });
  };

  const changeLanguage = (next: string) => {
    seededKeyRef.current = null;
    setFrontIndex(0);
    setBodyPage(0);
    setLanguage(next);
    setPrefs({ language: next });
  };

  async function handleTranslationRequest() {
    if (!requestLanguage || requestingTranslation) return;
    setRequestingTranslation(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.info("Sign in to request a translation.");
        return;
      }
      await requestBookTranslationAccess({
        data: {
          accessToken: token,
          bookId: book.id,
          language: requestLanguage,
        },
      });
      toast.success(`${requestLanguage} translation requested`);
      setRequestLanguage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit translation request");
    } finally {
      setRequestingTranslation(false);
    }
  }

  async function handleHighlight() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      toast.info("Select text on the page first.");
      return;
    }
    const range = selection.getRangeAt(0);
    const start = findTextAnchor(range.startContainer);
    const end = findTextAnchor(range.endContainer);
    if (!start || !end) {
      toast.info("Select text from the book page itself.");
      return;
    }
    const startChunk = Number(start.dataset["readerChunkIndex"]);
    const endChunk = Number(end.dataset["readerChunkIndex"]);
    if (startChunk !== endChunk) {
      toast.info("Keep one highlight within a source paragraph boundary.");
      return;
    }
    const startOffset =
      Number(start.dataset["readerTextStart"]) +
      textOffsetWithinAnchor(start, range.startContainer, range.startOffset);
    const endOffset =
      Number(end.dataset["readerTextStart"]) +
      textOffsetWithinAnchor(end, range.endContainer, range.endOffset);
    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || endOffset <= startOffset)
      return;
    const saved = await addHighlight(
      userId,
      book.id,
      language,
      startChunk,
      selection.toString().replace(/\s+/gu, " ").trim(),
      startOffset,
      endOffset,
    );
    queryClient.setQueryData<Highlight[]>(["highlights", userId], (rows = []) => [
      saved,
      ...rows.filter((item) => item.id !== saved.id),
    ]);
    selection.removeAllRanges();
    toast.success("Highlighted");
  }

  const pagePadding = `${Math.round(pageSize.width * 0.07)}px ${Math.round(
    pageSize.width * 0.09,
  )}px ${Math.round(pageSize.width * 0.055)}px`;

  const pageLabel =
    frontIndex !== null
      ? "Front matter " + toRoman(frontIndex + 1)
      : "Page " + String(bodyPage + 1) + " of " + String(bodyPageCount);
  const progress = frontIndex !== null ? 0 : ((bodyPage + 1) / Math.max(1, bodyPageCount)) * 100;
  const frontPage = frontIndex !== null ? frontPages[frontIndex] : null;
  const atBeginning = frontIndex === 0;
  const atEnd = frontIndex === null && bodyPage >= bodyPageCount - 1;

  if (contentQuery.isLoading || navigationQuery.isLoading) {
    return (
      <div className="reader-v3-root">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  if (!chapters.length) {
    return (
      <div className="reader-v3-root">
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
          This edition could not be arranged into readable chapters.
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        "reader-v3-root " + (theme === "dark" ? "dark" : theme === "sepia" ? "reader-sepia" : "")
      }
    >
      <header className="reader-v3-topbar">
        <Link to="/library" className="reader-v3-icon-label">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Library</span>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate font-display text-sm font-semibold">{book.title}</div>
          <div className="text-[11px] text-muted-foreground">{pageLabel}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={language}
            onChange={(event) => changeLanguage(event.target.value)}
            aria-label="Reading language"
            className="reader-v3-language"
          >
            {book.available_languages.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button
            onClick={() => setFrontIndex(Math.min(1, frontPages.length - 1))}
            className="reader-v3-icon"
            aria-label="Contents"
          >
            <List className="h-4 w-4" />
          </button>
          <div className="hidden sm:block">
            <ShelfButtons bookId={book.id} />
          </div>
          <button
            onClick={handleHighlight}
            className="reader-v3-icon"
            aria-label="Highlight selection"
          >
            <Highlighter className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="reader-v3-icon"
            aria-label="Reader settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
        <div className="reader-v3-progress-track" aria-label={pageLabel}>
          <div style={{ width: String(progress) + "%" }} />
        </div>
      </header>

      <main
        ref={stageRef}
        className="reader-v3-stage"
        onTouchStart={(event) => {
          touchStartRef.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          const end = event.changedTouches[0]?.clientX ?? null;
          touchStartRef.current = null;
          if (start == null || end == null) return;
          const delta = end - start;
          if (Math.abs(delta) >= 50) goBodyPage(delta < 0 ? 1 : -1);
        }}
      >
        <article
          className={"reader-v3-page reader-v3-page-turn-" + (turning ?? "idle")}
          style={{ width: pageSize.width, height: pageSize.height, padding: pagePadding }}
          lang={languageToBcp47(language)}
          dir={RTL_LANGUAGES.has(language) ? "rtl" : "ltr"}
        >
          <div
            className={"reader-v3-body-layer " + (frontPage ? "reader-v3-body-layer-hidden" : "")}
            aria-hidden={frontPage ? true : undefined}
          >
            <div className={"reader-v3-running-head " + (chapterOpeningPage ? "invisible" : "")}>
              <span>{currentChapter?.title ?? book.title}</span>
              <span>{formatAuthorName(book.author)}</span>
            </div>
            <div ref={viewportRef} className="reader-v3-content-viewport">
              <div
                ref={flowRef}
                className="reader-v3-flow"
                style={{
                  width: contentSize.width,
                  height: contentSize.height,
                  columnWidth: contentSize.width,
                  columnGap: 0,
                  columnFill: "auto",
                  transform: "translate3d(" + String(-bodyPage * contentSize.width) + "px,0,0)",
                  fontSize: String(mobileViewport ? Math.min(17, fontSize) : fontSize) + "px",
                }}
              >
                {chapters.map((chapter, chapterIndex) => (
                  <ChapterBlocks
                    key={chapter.key}
                    chapter={chapter}
                    chapterIndex={chapterIndex}
                    highlights={highlights}
                  />
                ))}
              </div>
            </div>
            <div className="reader-v3-page-number">{bodyPage + 1}</div>
          </div>
          {frontPage && (
            <div className="reader-v3-front-overlay" style={{ padding: pagePadding }}>
              <FrontMatterPage
                page={frontPage}
                frontNumber={toRoman((frontIndex ?? 0) + 1)}
                book={book}
                onChapter={jumpToChapter}
              />
            </div>
          )}
        </article>
      </main>

      <footer className="reader-v3-bottombar">
        <button
          onClick={() => goBodyPage(-1)}
          disabled={atBeginning}
          className="reader-v3-nav-button"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <div className="text-xs font-medium text-muted-foreground">{pageLabel}</div>
        <button
          onClick={() => goBodyPage(1)}
          disabled={atEnd}
          className="reader-v3-nav-button reader-v3-next"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </footer>

      {settingsOpen && (
        <div className="reader-v3-settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <div className="reader-v3-settings" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Reading settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-sm font-semibold text-primary"
              >
                Done
              </button>
            </div>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Language
              <select
                value={language}
                onChange={(event) => changeLanguage(event.target.value)}
                className="mt-2 w-full rounded-lg border bg-card px-3 py-2 text-sm normal-case text-foreground"
              >
                {book.available_languages.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Text size</span>
                <span>{fontSize}px</span>
              </div>
              <input
                type="range"
                min={16}
                max={21}
                step={1}
                value={fontSize}
                onChange={(event) => changeFontSize(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </div>
            {requestableLanguages.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Request translation
                </div>
                <div className="mt-2 flex gap-2">
                  <select
                    value={requestLanguage}
                    onChange={(event) => setRequestLanguage(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">Choose language…</option>
                    {requestableLanguages.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleTranslationRequest()}
                    disabled={!requestLanguage || requestingTranslation}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    {requestingTranslation ? "Sending…" : "Request"}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Theme
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["light", "sepia", "dark"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setTheme(item);
                      setPrefs({ theme: item });
                    }}
                    className={
                      "rounded-lg border px-3 py-2 text-sm font-semibold capitalize " +
                      (theme === item ? "bg-primary text-primary-foreground" : "bg-card")
                    }
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FrontMatterPage(props: {
  page: FrontPage;
  frontNumber: string;
  book: Book;
  onChapter: (index: number) => void;
}) {
  if (props.page.kind === "title") {
    return (
      <div className="reader-v3-front reader-v3-title-page">
        <div className="reader-v3-title-block">
          <h1>{props.book.title}</h1>
          <div>{formatAuthorName(props.book.author)}</div>
        </div>
        <div className="reader-v3-page-number">{props.frontNumber}</div>
      </div>
    );
  }
  if (props.page.kind === "contents") {
    return (
      <div className="reader-v3-front">
        <h2>{props.page.continued ? "Contents (cont.)" : "Contents"}</h2>
        <div className="reader-v3-toc">
          {props.page.entries.map((entry) => (
            <button
              key={entry.chapterIndex}
              onClick={() => props.onChapter(entry.chapterIndex)}
              className="reader-v3-toc-row"
            >
              <span className="reader-v3-toc-title">{entry.title}</span>
              <span className="reader-v3-toc-leader" aria-hidden="true" />
              <span className="reader-v3-toc-page">{entry.page}</span>
            </button>
          ))}
        </div>
        <div className="reader-v3-page-number">{props.frontNumber}</div>
      </div>
    );
  }
  return (
    <div className="reader-v3-front">
      <h2>{props.page.continued ? "About this book (cont.)" : "About this book"}</h2>
      <div className="reader-v3-summary">{props.page.text}</div>
      <div className="reader-v3-page-number">{props.frontNumber}</div>
    </div>
  );
}