import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  addHighlight,
  getReaderBookPayload,
  listHighlights,
  listProgress,
  saveProgress,
} from "@/lib/library";
import {
  buildReaderChapters,
  findReaderChapterByChunk,
} from "@/lib/reader-book-layout";
import { BookReaderSettings } from "@/components/reader/BookReaderSettings";
import { BookReaderTopbar } from "@/components/reader/BookReaderTopbar";
import { BookReaderBottomBar } from "@/components/reader/BookReaderBottomBar";
import { BookReaderFinishDialog } from "@/components/reader/BookReaderFinishDialog";
import { ReaderSavedHighlights } from "@/components/reader/ReaderSavedHighlights";
import { BookReaderPhysicalPage, type PhysicalPageOptions } from "@/components/reader/BookReaderPhysicalPage";
import { findReaderSourceAnchor } from "@/lib/reader-position-anchor";
import {
  clamp, buildLogicalBookPages, toRoman, scriptureFontFamily, splitSummary,
  textBoundaryAt, pageForBoundary,
  type FrontPage, type ReaderPosition,
} from "@/lib/reader-v3-helpers";
import { captureReaderHighlightSelection, type ReaderHighlightSelection } from "@/lib/reader-highlight-selection";
import { formatAuthorName } from "@/lib/author-name";
import { displayTitleCase } from "@/lib/display-text";
import { getPrefs, setPrefs, type ReaderTheme, type ReaderFontFamily, type ReaderContentWidth } from "@/lib/prefs";
import { useAuth } from "@/lib/use-auth";
import {
  REQUESTABLE_TRANSLATION_LANGUAGES,
  type Book,
  type Highlight,
} from "@/lib/data";
import { listMyTranslationRequests, requestBookTranslationAccess } from "@/lib/admin/translation-access.functions";
import { supabase } from "@/integrations/supabase/client";

const CONTENTS_PER_PAGE = 14;
const PHYSICAL_PAGE_GUTTER = 10;
const SPREAD_SPINE_GAP = 10;

export function BookReaderV3({
  book,
  initialLanguage,
  initialChunkIndex,
}: {
  book: Book;
  initialLanguage?: string | undefined;
  initialChunkIndex?: number | undefined;
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
  const initialFontSize = Math.min(20, Math.max(16, prefs.fontSize || 16));
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [fontSizeDraft, setFontSizeDraft] = useState(initialFontSize);
  const [theme, setTheme] = useState<ReaderTheme>(prefs.theme);
  const [typeface, setTypeface] = useState<ReaderFontFamily>(
    ["literary", "serif", "sans"].includes(prefs.fontFamily) ? prefs.fontFamily : "literary",
  );
  const [textMeasure, setTextMeasure] = useState<ReaderContentWidth>(
    ["narrow", "medium", "wide"].includes(prefs.contentWidth) ? prefs.contentWidth : "medium",
  );
  const [lineSpacing, setLineSpacing] = useState(
    [1.4, 1.5, 1.65, 1.8].includes(prefs.v3LineHeight) ? prefs.v3LineHeight : 1.5,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedHighlightsOpen, setSavedHighlightsOpen] = useState(false);
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
  // Unlike a transient font-change timer, keep this exact source character
  // through *successive* typography edits until deliberate navigation.
  // Re-capturing the top of a reflowed page drifts earlier on every edit.
  const lastTypographySourceAnchorRef = useRef<ReaderPosition | null>(null);
  const fontApplyTimerRef = useRef<number | null>(null);
  const fontChangeTimerRef = useRef<number | null>(null);
  const lastPageSizeRef = useRef({ width: 360, height: 540 });
  const touchStartRef = useRef<number | null>(null);
  const pendingHighlightRef = useRef<{
    selection: ReaderHighlightSelection;
    contextKey: string;
    recordedAt: number;
  } | null>(null);
  const seededKeyRef = useRef<string | null>(null);

  const payloadQuery = useQuery({
    queryKey: ["reader-book-payload", book.id, language],
    queryFn: () => getReaderBookPayload(book.id, language),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId),
  });
  const highlightsQuery = useQuery({
    queryKey: ["highlights", userId],
    queryFn: () => listHighlights(userId),
  });
  const translationRequestsQuery = useQuery({
    queryKey: ["my-translation-requests", userId, book.id],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return [];
      return listMyTranslationRequests({ data: { accessToken } });
    },
    staleTime: 60_000,
  });

  const chapters = useMemo(
    () =>
      buildReaderChapters(
        payloadQuery.data?.content.chunks ?? [],
        payloadQuery.data?.navigation ?? [],
      ),
    [payloadQuery.data?.content.chunks, payloadQuery.data?.navigation],
  );
  const highlights = useMemo(
    () =>
      (highlightsQuery.data ?? []).filter(
        (item) => item.book_id === book.id && item.language === language,
      ),
    [book.id, highlightsQuery.data, language],
  );
  const activeRequest = (translationRequestsQuery.data ?? []).find(
    (item) => item.book_id === book.id && item.language === requestLanguage,
  );
  const activeRequestStatus = activeRequest?.status ?? null;

  const requestableLanguages = useMemo(
    () =>
      book.content_classification === "religious" ||
      book.translation_generation_policy === "source_only"
        ? []
        : REQUESTABLE_TRANSLATION_LANGUAGES.filter(
            (item) => item !== book.source_language && !book.available_languages.includes(item),
          ),
    [
      book.available_languages,
      book.content_classification,
      book.source_language,
      book.translation_generation_policy,
    ],
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
  const highlightContextKey = book.id + ":" + language + ":" + String(frontIndex) + ":" + String(bodyPage);

  const rememberSelectedText = useCallback(() => {
    const sourceSelection = captureReaderHighlightSelection(window.getSelection(), stageRef.current);
    if (sourceSelection) {
      pendingHighlightRef.current = {
        selection: sourceSelection,
        contextKey: highlightContextKey,
        recordedAt: Date.now(),
      };
    }
    return sourceSelection;
  }, [highlightContextKey]);

  // Mobile Safari/Chrome may collapse native selection when the user touches
  // the topbar; remember exact source offsets during the selection gesture.
  useEffect(() => {
    const onSelectionChange = () => { rememberSelectedText(); };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [rememberSelectedText]);

  // Never offer a stale highlight after paging, changing editions or opening
  // front matter. Only the current physical reading position may be saved.
  useEffect(() => { pendingHighlightRef.current = null; }, [highlightContextKey]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const availableWidth = Math.max(220, stage.clientWidth - 32);
      const availableHeight = Math.max(330, stage.clientHeight - 4);
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

      const located = findReaderSourceAnchor(anchors, position);
      if (!located) {
        setBodyPage(chapterStartPages[position.chapterIndex] ?? 0);
        return;
      }

      // Resolve the exact chapter-wide character even when several
      // paragraphs share one source chunk. Previously the first matching
      // chunk won and relative was forced to 0, losing the reading place.
      const boundary = textBoundaryAt(located.anchor, located.relative);
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

    let measureFrame = 0;
    let settleFrame = 0;

    const measure = () => {
      const width = Math.max(1, Math.floor(viewport.clientWidth));
      const height = Math.max(1, Math.floor(viewport.clientHeight));

      // The multicolumn flow uses contentSize for both column width and stride.
      // Never publish pagination from the same frame that changes contentSize:
      // that would measure the old columns against the new page width and can
      // transiently collapse a long book to "Page 1 of 1" during resize.
      if (contentSize.width !== width || contentSize.height !== height) {
        setContentSize({ width, height });
        return;
      }

      settleFrame = requestAnimationFrame(() => {
        const liveViewport = viewportRef.current;
        const liveFlow = flowRef.current;
        if (!liveViewport || !liveFlow) return;

        const liveWidth = Math.max(1, Math.floor(liveViewport.clientWidth));
        const liveHeight = Math.max(1, Math.floor(liveViewport.clientHeight));
        if (liveWidth !== width || liveHeight !== height) {
          setContentSize({ width: liveWidth, height: liveHeight });
          return;
        }

        const stride = width + PHYSICAL_PAGE_GUTTER;
        const nextRawPageCount = Math.max(
          1,
          Math.ceil((liveFlow.scrollWidth + PHYSICAL_PAGE_GUTTER) / stride),
        );
        const flowRect = liveFlow.getBoundingClientRect();
        const nextChapterStarts = chapters.map((_, index) => {
          const opening = liveFlow.querySelector<HTMLElement>(
            '[data-reader-chapter-opening="' + String(index) + '"]',
          );
          return opening
            ? Math.max(
                0,
                Math.round((opening.getBoundingClientRect().left - flowRect.left) / stride),
              )
            : 0;
        });

        setRawPageCount(nextRawPageCount);
        setRawChapterStartPages(nextChapterStarts);
        setLayoutMeasured(true);
      });
    };

    const queueMeasure = () => {
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(settleFrame);
      measureFrame = requestAnimationFrame(measure);
    };

    queueMeasure();
    const observer = new ResizeObserver(queueMeasure);
    observer.observe(viewport);
    observer.observe(flow);
    void document.fonts?.ready.then(queueMeasure);

    return () => {
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(settleFrame);
      observer.disconnect();
    };
  }, [chapters, contentSize.height, contentSize.width, fontSize, pageSize.height, pageSize.width, typeface, lineSpacing, textMeasure, language]);

  useLayoutEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!layoutMeasured || !pending || !logicalPages.length) return;
    pendingRestoreRef.current = null;
    const frame = requestAnimationFrame(() => restorePosition(pending));
    return () => cancelAnimationFrame(frame);
  }, [layoutMeasured, logicalPages.length, restorePosition]);

  // A font-size edit can publish two column layouts in quick succession:
  // the first frame restores against the old line metrics, then the font
  // settles and shifts the true raw page. Re-resolve the *same* saved source
  // character after the final measured columns, before saving progress.
  // Do not capture a different character from that intermediate page.
  useEffect(() => {
    if (!layoutMeasured || frontIndex !== null || !fontChangeAnchorRef.current ||
        pendingRestoreRef.current) return;
    const timer = window.setTimeout(() => {
      const exact = fontChangeAnchorRef.current;
      if (exact && !pendingRestoreRef.current) restorePosition(exact);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [fontSize, layoutMeasured, bodyPageCount, frontIndex, restorePosition]);

  useEffect(() => {
    if (!chapters.length || seededKeyRef.current === seedKey) return;
    if (initialChunkIndex == null && !progressQuery.data) return;
    seededKeyRef.current = seedKey;
    let restored: ReaderPosition | null = null;

    // Canonical-reference links use ?page= as an exact source chunk target.
    // It must win over local/account resume state.
    if (initialChunkIndex != null) {
      const chunkIndex = clamp(initialChunkIndex, 0, Math.max(0, book.total_chunks - 1));
      restored = {
        chapterIndex: findReaderChapterByChunk(chapters, chunkIndex),
        charOffset: 0,
        chunkIndex,
      };
    } else {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) restored = JSON.parse(saved) as ReaderPosition;
      } catch {
        restored = null;
      }
      if (!restored) {
        const savedProgress = progressQuery.data?.find(
          (item) => item.book_id === book.id && item.language === language,
        );
        if (savedProgress) {
          const chapterIndex = findReaderChapterByChunk(chapters, savedProgress.last_chunk_index);
          restored = { chapterIndex, charOffset: 0, chunkIndex: savedProgress.last_chunk_index };
        }
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
    book.total_chunks,
    chapters,
    initialChunkIndex,
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

  useEffect(() => {
    if (
      !layoutMeasured ||
      pendingRestoreRef.current ||
      !fontChangeAnchorRef.current ||
      fontApplyTimerRef.current != null ||
      frontIndex !== null
    )
      return;

    if (fontChangeTimerRef.current != null) window.clearTimeout(fontChangeTimerRef.current);
    const timer = window.setTimeout(() => {
      if (
        !layoutMeasured ||
        pendingRestoreRef.current ||
        fontApplyTimerRef.current != null ||
        frontIndex !== null
      )
        return;
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
    }, 1000);
    fontChangeTimerRef.current = timer;

    return () => {
      if (fontChangeTimerRef.current === timer) {
        window.clearTimeout(timer);
        fontChangeTimerRef.current = null;
      }
    };
  }, [book.id, fontSize, frontIndex, language, layoutMeasured, storageKey, userId]);

  useEffect(
    () => () => {
      if (fontApplyTimerRef.current != null) window.clearTimeout(fontApplyTimerRef.current);
      if (fontChangeTimerRef.current != null) window.clearTimeout(fontChangeTimerRef.current);
    },
    [],
  );

  // Book colors are scoped to the reading surface and must never reset
  // the site's own dark-mode choice on document.body.
  useEffect(() => {
    document.body.classList.add("reader-v3-body");
    return () => document.body.classList.remove("reader-v3-body");
  }, []);

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
      // Reader deliberately changed the passage: allow a fresh anchor next
      // time typography is edited rather than restoring an earlier location.
      lastTypographySourceAnchorRef.current = null;
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
        (target.matches("input,textarea,select,[role='textbox']") ||
          (target instanceof HTMLElement && target.isContentEditable));
      if (editableTarget || settingsOpen || savedHighlightsOpen) {
        if (event.key === "Escape") { setSettingsOpen(false); setSavedHighlightsOpen(false); }
        return;
      }
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
  }, [goBodyPage, settingsOpen, savedHighlightsOpen]);

  useEffect(() => {
    if (!turning) return;
    const timer = window.setTimeout(() => setTurning(null), 190);
    return () => window.clearTimeout(timer);
  }, [turning]);

  const openContents = useCallback(() => {
    if (frontIndex === null) {
      const position = lastTypographySourceAnchorRef.current ?? capturePosition();
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
      lastTypographySourceAnchorRef.current = null;
      fontChangeAnchorRef.current = null;
      setContentsReturnPosition(null);
      setFrontIndex(null);
      setBodyPage(chapterStartPages[chapterIndex] ?? 0);
    },
    [chapterStartPages],
  );

  useLayoutEffect(() => {
    if (frontIndex !== null || !layoutMeasured) return;
    const stage = stageRef.current;
    if (!stage) return;

    const flows = Array.from(
      stage.querySelectorAll<HTMLElement>(".reader-v3-flow[data-reader-visible-raw-page]"),
    );

    for (const flow of flows) {
      const targetRawPage = Number(flow.dataset["readerVisibleRawPage"]);
      if (!Number.isFinite(targetRawPage)) continue;
      const flowRect = flow.getBoundingClientRect();

      for (const child of Array.from(flow.children)) {
        if (!(child instanceof HTMLElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(child);
        const textRects = Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );
        const rects = textRects.length ? textRects : Array.from(child.getClientRects());
        const visible = rects.some((rect) => {
          const rawPage = Math.max(
            0,
            Math.round((rect.left - flowRect.left) / Math.max(1, pageStride)),
          );
          return rawPage === targetRawPage;
        });

        if (visible) {
          child.setAttribute("data-reader-visible-block", "true");
          child.removeAttribute("aria-hidden");
          child.removeAttribute("inert");
          child.style.visibility = "visible";
        } else {
          child.removeAttribute("data-reader-visible-block");
          child.setAttribute("aria-hidden", "true");
          child.setAttribute("inert", "");
          child.style.visibility = "hidden";
        }
      }
    }
  }, [bodyPage, frontIndex, layoutMeasured, logicalPages, pageStride, spreadMode]);

  /** Capture a source position before changing page geometry. Restoring by
   * source chunk offset prevents a font/margin adjustment jumping chapters.
   */
  const reflowFromCurrentSource = () => {
    if (frontIndex === null) {
      const anchor = lastTypographySourceAnchorRef.current ?? capturePosition() ?? positionRef.current;
      if (anchor) lastTypographySourceAnchorRef.current = anchor;
      if (anchor) {
        positionRef.current = anchor;
        pendingRestoreRef.current = anchor;
      }
    }
    setLayoutMeasured(false);
  };

  const changeFontSize = (next: number) => {
    setFontSizeDraft(next);

    if (frontIndex === null) {
      let anchor = fontChangeAnchorRef.current ?? lastTypographySourceAnchorRef.current;
      if (!anchor && layoutMeasured) anchor = capturePosition();
      if (!anchor) anchor = positionRef.current;
      if (anchor) {
        fontChangeAnchorRef.current = anchor;
        lastTypographySourceAnchorRef.current = anchor;
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
    }, 220);
  };

  const changeTypeface = (next: ReaderFontFamily) => {
    reflowFromCurrentSource();
    setTypeface(next);
    setPrefs({ fontFamily: next });
  };
  const changeLineSpacing = (next: number) => {
    reflowFromCurrentSource();
    setLineSpacing(next);
    setPrefs({ v3LineHeight: next });
  };
  const changeTextMeasure = (next: ReaderContentWidth) => {
    reflowFromCurrentSource();
    setTextMeasure(next);
    setPrefs({ contentWidth: next });
  };

  const changeLanguage = (next: string) => {
    lastTypographySourceAnchorRef.current = null;
    fontChangeAnchorRef.current = null;
    seededKeyRef.current = null;
    setFrontIndex(0);
    setBodyPage(0);
    setLayoutMeasured(false);
    setLanguage(next);
    setPrefs({ language: next });
  };

  async function handleTranslationRequest() {
    if (
      !requestLanguage ||
      requestingTranslation ||
      book.content_classification === "religious" ||
      book.translation_generation_policy === "source_only"
    ) {
      return;
    }
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
    const currentSelection = rememberSelectedText();
    const cached = pendingHighlightRef.current;
    const usableCached =
      cached?.contextKey === highlightContextKey &&
      Date.now() - cached.recordedAt < 90_000
        ? cached.selection
        : null;
    const anchored = currentSelection ?? usableCached;
    if (!anchored) {
      const unanchoredText = window.getSelection()?.toString().trim();
      toast.info(unanchoredText
        ? "Keep one highlight within a source paragraph boundary."
        : "Select text on the book page first, then tap Highlight.");
      return;
    }
    try {
      const saved = await addHighlight(
        userId,
        book.id,
        language,
        anchored.chunkIndex,
        anchored.text,
        anchored.startOffset,
        anchored.endOffset,
      );
      queryClient.setQueryData<Highlight[]>(["highlights", userId], (rows = []) => [
        saved,
        ...rows.filter((item) => item.id !== saved.id),
      ]);
      pendingHighlightRef.current = null;
      window.getSelection()?.removeAllRanges();
      toast.success("Highlighted");
    } catch {
      // Don't silently claim that an authenticated highlight was saved if
      // Supabase rejected the write. Keep the source selection for retry.
      toast.error("Could not save the highlight. Please try again.");
    }
  }

  const measurePadding = textMeasure === "narrow" ? 0.095 : textMeasure === "wide" ? 0.045 : 0.065;
  const horizontalPadding = Math.round(pageSize.width * (spreadMode ? measurePadding * 0.75 : measurePadding));
  const selectedFontStack = language === "English"
    ? (typeface === "sans" ? "Arial, Helvetica, sans-serif"
      : typeface === "serif" ? "Georgia, 'Times New Roman', serif"
      : "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif")
    : (scriptureFontFamily(language) ?? "Georgia, 'Times New Roman', serif");
  const topPadding = Math.round(pageSize.width * 0.035);
  const bottomPadding = Math.round(pageSize.width * 0.03);
  const pagePadding = `${topPadding}px ${horizontalPadding}px ${bottomPadding}px`;
  const readerFontSize = clamp(fontSize, mobileViewport ? 15 : 16, 20);
  const lineHeightPx = Math.round(readerFontSize * lineSpacing * 4) / 4;
  const runningHeadHeight = 12;
  const runningHeadGap = lineHeightPx * 1.5;
  const folioHeight = Math.round(lineHeightPx + 14);
  const innerPageHeight = pageSize.height - topPadding - bottomPadding - 2;
  const availableGridHeight = Math.max(
    lineHeightPx * 12,
    innerPageHeight - runningHeadHeight - runningHeadGap - folioHeight,
  );
  const bodyGridHeight =
    Math.max(12, Math.floor(availableGridHeight / lineHeightPx)) * lineHeightPx;

  const pageLabel =
    frontIndex !== null
      ? spreadMode && frontIndex > 0
        ? frontIndex + 1 < frontPages.length
          ? `Front matter ${toRoman(frontIndex + 1)}–${toRoman(frontIndex + 2)}`
          : `Front matter ${toRoman(frontIndex + 1)}`
        : "Front matter " + toRoman(frontIndex + 1)
      : !layoutMeasured
        ? "Repaginating…"
        : spreadMode
          ? bodyPage === 0
            ? `Page 1 of ${bodyPageCount}`
            : bodyPage < bodyPageCount
              ? `Pages ${bodyPage}–${bodyPage + 1} of ${bodyPageCount}`
              : `Page ${bodyPage} of ${bodyPageCount}`
          : "Page " + String(bodyPage + 1) + " of " + String(bodyPageCount);
  const progress =
    frontIndex !== null
      ? 0
      : (Math.min(bodyPage + 1, bodyPageCount) / Math.max(1, bodyPageCount)) * 100;
  const atBeginning = frontIndex === 0;
  const atEnd =
    layoutMeasured && bodyPageCount > 0 && frontIndex === null &&
    (spreadMode ? bodyPage >= lastBodySpreadRight : bodyPage >= bodyPageCount - 1);
  const trailingSingleLeaf =
    frontIndex === null &&
    spreadMode &&
    bodyPageCount > 0 &&
    bodyPageCount % 2 === 0 &&
    bodyPage >= bodyPageCount;

  const physicalPageModel = {
    book, frontPages, logicalPages, chapterStartPages, chapters, highlights,
    chapterIndexForLogicalPage, onChapterJump: jumpToChapter, spreadMode,
    displayBookTitle, turning, pageSize, pagePadding, language,
    viewportRef, flowRef, bodyGridHeight, contentSize,
    physicalPageGutter: PHYSICAL_PAGE_GUTTER, pageStride,
    readerFontSize, lineHeightPx, selectedFontStack,
    runningHeadHeight, runningHeadGap, folioHeight,
  };
  const renderPhysicalPage = (options: PhysicalPageOptions) => (
    <BookReaderPhysicalPage options={options} model={physicalPageModel} />
  );

  if (payloadQuery.isLoading) {
    const loadingPageStyle = {
      width: pageSize.width,
      height: pageSize.height,
    };
    return (
      <div
        className={
          "reader-v3-root " + (theme === "dark" ? "dark" : theme === "sepia" ? "reader-sepia" : "reader-light")
        }
      >
        <header className="reader-v3-topbar">
          <Link to="/library" className="reader-v3-icon-label" aria-label="Back to library">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Library</span>
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate font-display text-sm font-semibold">{displayBookTitle}</div>
            <div className="text-[11px] text-muted-foreground">Preparing book…</div>
          </div>
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
        </header>
        <main
          ref={stageRef}
          className={"reader-v3-stage " + (spreadMode ? "reader-v3-stage-spread" : "")}
        >
          <div className={spreadMode ? "reader-v3-spread" : "reader-v3-single"}>
            {spreadMode && (
              <article
                className="reader-v3-page reader-v3-page-left reader-v3-page-blank"
                style={loadingPageStyle}
                aria-hidden="true"
              />
            )}
            <article
              className={
                "reader-v3-page reader-v3-loading-title " +
                (spreadMode ? "reader-v3-page-right" : "reader-v3-page-single")
              }
              style={loadingPageStyle}
              aria-label="Book title page loading"
            >
              <div className="reader-v3-title-block">
                <h1>{displayBookTitle}</h1>
                <div>{formatAuthorName(book.author)}</div>
              </div>
              <div className="reader-v3-loading-status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading reading edition…
              </div>
            </article>
          </div>
        </main>
        <footer className="reader-v3-bottombar">
          <div />
          <div className="text-xs font-medium text-muted-foreground">Preparing book…</div>
          <div />
        </footer>
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
        "reader-v3-root " + (theme === "dark" ? "dark" : theme === "sepia" ? "reader-sepia" : "reader-light")
      }
    >
      <BookReaderTopbar
        title={displayBookTitle}
        pageLabel={pageLabel}
        language={language}
        availableLanguages={book.available_languages}
        bookId={book.id}
        canReturnToReading={frontIndex !== null && !!contentsReturnPosition}
        progress={progress}
        onLanguageChange={changeLanguage}
        onBackToReading={returnFromContents}
        onContents={openContents}
        onHighlight={handleHighlight}
        onBeforeHighlight={rememberSelectedText}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main
        ref={stageRef}
        className={
          "reader-v3-stage " +
          (spreadMode ? "reader-v3-stage-spread " : "") +
          (frontIndex === null && !layoutMeasured ? "reader-v3-stage-reflowing" : "")
        }
        aria-busy={frontIndex === null && !layoutMeasured}
        onTouchStart={(event) => {
          touchStartRef.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          // Dragging a native text-selection handle must never turn the page.
          if (rememberSelectedText()) { touchStartRef.current = null; return; }
          const start = touchStartRef.current;
          const end = event.changedTouches[0]?.clientX ?? null;
          touchStartRef.current = null;
          if (start == null || end == null) return;
          const delta = end - start;
          if (Math.abs(delta) >= 50) goBodyPage(delta < 0 ? 1 : -1);
        }}
      >
        {frontIndex === null && !layoutMeasured && (
          <div className="reader-v3-reflow-indicator" role="status">
            <Loader2 className="h-5 w-5 animate-spin" />
            Repaginating…
          </div>
        )}
        <div
          className={spreadMode && !trailingSingleLeaf ? "reader-v3-spread" : "reader-v3-single"}
        >
          {frontIndex !== null ? (
            spreadMode ? (
              <>
                {frontIndex === 0
                  ? renderPhysicalPage({ side: "left" })
                  : renderPhysicalPage({
                      frontPageIndex: frontIndex,
                      side: "left",
                      master: frontIndex + 1 >= frontPages.length,
                    })}
                {renderPhysicalPage({
                  frontPageIndex: frontIndex === 0 ? 0 : frontIndex + 1,
                  side: "right",
                  master: frontIndex === 0 || frontIndex + 1 < frontPages.length,
                })}
              </>
            ) : (
              renderPhysicalPage({ frontPageIndex: frontIndex, side: "single", master: true })
            )
          ) : spreadMode && !trailingSingleLeaf ? (
            <>
              {renderPhysicalPage({
                logicalIndex: bodyPage - 1,
                side: "left",
                master: bodyPage >= bodyPageCount,
              })}
              {renderPhysicalPage({
                logicalIndex: bodyPage,
                side: "right",
                master: bodyPage < bodyPageCount,
              })}
            </>
          ) : (
            renderPhysicalPage({
              logicalIndex: trailingSingleLeaf ? bodyPage - 1 : bodyPage,
              side: "single",
              master: true,
            })
          )}
        </div>
      </main>

      <BookReaderBottomBar
        atBeginning={atBeginning}
        atEnd={atEnd}
        pageLabel={pageLabel}
        onPrevious={() => goBodyPage(-1)}
        onNext={() => goBodyPage(1)}
        onFinish={() => setFinishOpen(true)}
      />

      {finishOpen && <BookReaderFinishDialog title={displayBookTitle} onClose={() => setFinishOpen(false)} />}

      {settingsOpen && (
        <BookReaderSettings
          book={book}
          language={language}
          fontSizeDraft={fontSizeDraft}
          typeface={typeface}
          lineSpacing={lineSpacing}
          textMeasure={textMeasure}
          requestableLanguages={requestableLanguages}
          requestLanguage={requestLanguage}
          requestingTranslation={requestingTranslation}
          theme={theme}
          onClose={() => setSettingsOpen(false)}
          onLanguageChange={changeLanguage}
          onFontSizeChange={changeFontSize}
          onTypefaceChange={changeTypeface}
          onLineSpacingChange={changeLineSpacing}
          onTextMeasureChange={changeTextMeasure}
          onRequestLanguageChange={setRequestLanguage}
          onTranslationRequest={() => void handleTranslationRequest()}
          onThemeChange={(item) => { setTheme(item); setPrefs({ theme: item }); }}
        />
      )}
    </div>
  );
}
