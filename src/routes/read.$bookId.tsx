import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlignLeft,
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Flag,
  Highlighter,
  List,
  Loader2,
  Lock,
  LogIn,
  Save,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { z } from "zod";
import {
  RTL_LANGUAGES,
  REQUESTABLE_TRANSLATION_LANGUAGES,
  isReligiousBook,
  type Highlight,
  type Progress,
} from "@/lib/data";
import {
  addHighlight,
  getBook,
  getReaderChunk,
  getReaderNavigation,
  searchReaderBook,
  listHighlights,
  listProgress,
  listSubscriptions,
  removeHighlight,
  saveProgress,
  updateHighlightNote,
} from "@/lib/library";
import { reportTranslationIssue } from "@/lib/translation.functions";
import {
  requestBookTranslationAccess,
  listMyTranslationRequests,
} from "@/lib/admin/translation-access.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { ShelfButtons } from "@/components/ShelfButtons";
import { recordReadingDay } from "@/lib/shelves";
import {
  FONT_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
  PARAGRAPH_SPACING_RANGE,
  getPrefs,
  setPrefs,
  type ReaderContentWidth,
  type ReaderFontFamily,
  type ReaderPresentation,
  type ReaderTheme,
} from "@/lib/prefs";
import { parseReadableBlocks, type ReaderNavigationItem } from "@/lib/reader-structure";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";

const searchSchema = z.object({
  lang: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/read/$bookId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Reading room — Seeparah" },
      {
        name: "description",
        content:
          "A calm reading room with structured navigation, readable typography, highlights, and saved progress.",
      },
      { property: "og:title", content: "Reading room — Seeparah" },
      {
        property: "og:description",
        content: "Read with structured navigation and comfortable typography in your chosen language.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReaderPage,
});

const THEME_CLASS: Record<ReaderTheme, string> = {
  light: "",
  sepia: "reader-sepia",
  dark: "dark",
};

function religiousTypographyFont(profile: string | null | undefined): string | undefined {
  switch (profile) {
    case "scripture_arabic":
      return "\'Noto Naskh Arabic\', Amiri, \'Scheherazade New\', serif";
    case "scripture_urdu":
      return "\'Noto Nastaliq Urdu\', \'Jameel Noori Nastaleeq\', serif";
    case "scripture_hebrew":
      return "\'Noto Serif Hebrew\', \'David Libre\', serif";
    case "scripture_indic":
      return "\'Noto Serif Devanagari\', \'Noto Serif Bengali\', \'Noto Serif Tamil\', serif";
    default:
      return undefined;
  }
}

function ReaderPage() {
  const { bookId } = Route.useParams();
  const { lang, page } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId, isDemo } = useAuth();
  const currentHref = useRouterState({ select: (s) => s.location.href });

  const bookQuery = useQuery({
    queryKey: ["book", bookId],
    queryFn: () => getBook(bookId),
  });
  const book = bookQuery.data;

  const prefs = useMemo(() => getPrefs(), []);
  const language =
    lang ??
    (book && prefs.language && book.available_languages.includes(prefs.language)
      ? prefs.language
      : book?.source_language) ??
    "English";

  const [index, setIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [fontSize, setFontSize] = useState(prefs.fontSize);
  const [lineHeight, setLineHeight] = useState(prefs.lineHeight);
  const [theme, setTheme] = useState<ReaderTheme>(prefs.theme);
  const [fontFamily, setFontFamily] = useState<ReaderFontFamily>(prefs.fontFamily);
  const [contentWidth, setContentWidth] = useState<ReaderContentWidth>(prefs.contentWidth);
  const [paragraphSpacing, setParagraphSpacing] = useState(prefs.paragraphSpacing);
  const [presentation, setPresentation] = useState<ReaderPresentation>(prefs.presentation);
  const [highlightSaved, setHighlightSaved] = useState(false);
  const readerTextRef = useRef<HTMLDivElement | null>(null);
  const highlightFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dark/sepia are scoped CSS classes (.dark/.reader-sepia in src/styles.css) —
  // applying THEME_CLASS only to this route's own wrapper div left the
  // real page canvas (document.body, painted behind/around that div —
  // visible at overscroll edges and anywhere the wrapper doesn't fully
  // cover) permanently light. Mirroring the same class onto <body> while
  // this route is mounted keeps the whole reading surface — not just the
  // text card and toolbar — coherent, and nothing else in the app uses
  // these tokens (confirmed: no other route references .dark/.sepia), so
  // this can't leak an unwanted theme onto any other page.
  useEffect(() => {
    const themeClass = THEME_CLASS[theme];
    if (themeClass) document.body.classList.add(themeClass);
    return () => {
      if (themeClass) document.body.classList.remove(themeClass);
    };
  }, [theme]);

  useEffect(
    () => () => {
      if (highlightFeedbackTimer.current) clearTimeout(highlightFeedbackTimer.current);
    },
    [],
  );

  const seededBookRef = useRef<string | null>(null);

  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId),
  });
  const subsQuery = useQuery({
    queryKey: ["subscriptions", userId],
    queryFn: () => listSubscriptions(userId),
  });
  const settingsQuery = useQuery({
    queryKey: ["public-content-settings"],
    queryFn: () => getPublicContentSettings(),
  });
  // "One subscription unlocks all Premium books and translations" — this is
  // the single plan price, not per-book pricing; same $2 default as
  // settings.server.ts's DEFAULT_MONTHLY_PLAN_PRICE_USD.
  const planPrice =
    typeof settingsQuery.data?.["monthly_plan_price_usd"] === "number"
      ? (settingsQuery.data["monthly_plan_price_usd"] as number)
      : 2;
  const highlightsQuery = useQuery({
    queryKey: ["highlights", userId],
    queryFn: () => listHighlights(userId),
  });
  const navigationQuery = useQuery({
    queryKey: ["reader-navigation", bookId, language],
    queryFn: () => getReaderNavigation(bookId, language),
    enabled: Boolean(book),
    staleTime: 5 * 60 * 1000,
  });

  // Reader's own supported languages translation-request status for this book, so
  // the UI can show "requested" / "declined" / "revoked" accurately instead
  // of a generic "Request this translation" button that ignores whether one
  // already exists. Demo (signed-out) readers have no requests to show —
  // skip the call rather than send a request with no access token.
  const myTranslationRequestsQuery = useQuery({
    queryKey: ["my-translation-requests", userId, bookId],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return [];
      const rows = await listMyTranslationRequests({ data: { accessToken: token } });
      return rows.filter((r) => r.book_id === bookId);
    },
    enabled: !isDemo,
  });
  const myRequestStatusByLanguage = new Map(
    (myTranslationRequestsQuery.data ?? []).map((r) => [r.language as string, r]),
  );

  // Seed the starting page exactly once per (book, signed-in identity),
  // from whichever language is active at that moment (URL param, else
  // preferred language, else the book's source language). After that,
  // index is only ever changed by explicit navigation — a later language
  // switch never re-seeds it, so the same passage stays open across
  // languages where alignment is available. Keyed on userId as well as
  // bookId so a sign-in partway through a demo session (progressQuery
  // refetching with the reader's real cross-device history) re-seeds from
  // that real data instead of staying stuck at wherever the signed-out
  // view had already landed.
  const seedKey = `${bookId}:${userId}`;
  useEffect(() => {
    if (!book || !progressQuery.data) return;
    if (seededBookRef.current === seedKey) return;
    const saved = progressQuery.data.find((p) => p.book_id === bookId && p.language === language);
    const requestedIndex = page ? page - 1 : null;
    const startIndex = Math.min(
      Math.max(0, requestedIndex ?? saved?.last_chunk_index ?? 0),
      Math.max(0, book.total_chunks - 1),
    );
    setIndex(startIndex);
    seededBookRef.current = seedKey;
    if (page !== startIndex + 1 || lang !== language) {
      void navigate({
        to: "/read/$bookId",
        params: { bookId },
        search: { lang: language, page: startIndex + 1 },
        replace: true,
      });
    }
  }, [book, progressQuery.data, bookId, language, seedKey, page, lang, navigate]);

  const chunkQuery = useQuery({
    queryKey: ["reader-chunk", bookId, language, index],
    queryFn: () => getReaderChunk(bookId, language, index),
    enabled: !!book && seededBookRef.current === seedKey,
  });

  // Keep page-turning immediate: warm the adjacent reader sections after
  // access has been established. The same server-side access gate still
  // applies, so prefetching never exposes locked content.
  useEffect(() => {
    if (!book || seededBookRef.current !== seedKey) return;
    for (const adjacent of [index - 1, index + 1]) {
      if (adjacent < 0 || adjacent >= book.total_chunks) continue;
      void queryClient.prefetchQuery({
        queryKey: ["reader-chunk", bookId, language, adjacent],
        queryFn: () => getReaderChunk(bookId, language, adjacent),
        staleTime: 60_000,
      });
    }
  }, [book, bookId, language, index, seedKey, queryClient]);

  // Autosave on every navigation and every language switch, once the
  // initial position has been seeded (so this never overwrites a just-
  // loaded saved position with the default page).
  useEffect(() => {
    if (seededBookRef.current !== seedKey) return;
    void persist(index, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, language, seedKey]);

  const rtl = RTL_LANGUAGES.has(language);
  const isUrdu = language === "Urdu";
  const religious = book ? isReligiousBook(book) : false;
  const typographyProfile = book?.typography_profile ?? "standard";
  const protectedFontFamily = religiousTypographyFont(typographyProfile);
  const total = book?.total_chunks ?? 1;
  const pct = Math.round(((index + 1) / total) * 100);
  // A language counts as "available" for the purpose of NOT showing the
  // generic "pick another language" dead-end if either a reviewed edition
  // already exists, OR it's one of the languages a reader can actually
  // request (supported languages) — in that second case there is real content to
  // navigate to (the request prompt, driven by the server's own locked/
  // lockReason), just not a finished edition yet. Without this, a reader
  // could never discover or trigger a translation request for a language
  // that doesn't have so much as a first page yet, since the request UI
  // below only ever renders once this check lets the page get there.
  const isRequestableLanguage =
    !religious &&
    REQUESTABLE_TRANSLATION_LANGUAGES.includes(
      language as (typeof REQUESTABLE_TRANSLATION_LANGUAGES)[number],
    );
  const languageAvailable =
    (book?.available_languages.includes(language) ?? true) || isRequestableLanguage;

  // Languages shown as "request a translation" pills: supported languages that
  // don't already have a reviewed edition, and aren't the book's own
  // source language (requesting the source language is meaningless — it's
  // already free to read, and the server rejects that request outright).
  const requestableLanguagesForBook =
    book && !religious
      ? REQUESTABLE_TRANSLATION_LANGUAGES.filter(
          (l) => !book.available_languages.includes(l) && l !== book.source_language,
        )
      : [];

  async function persist(next: number, quiet = true) {
    recordReadingDay();
    const result = await saveProgress(userId, bookId, language, next);
    const updatedAt = new Date().toISOString();
    queryClient.setQueryData<Progress[]>(["progress", userId], (rows = []) => {
      const row: Progress = {
        user_id: userId,
        book_id: bookId,
        language,
        last_chunk_index: next,
        updated_at: updatedAt,
      };
      const existing = rows.findIndex(
        (item) => item.book_id === bookId && item.language === language,
      );
      if (existing < 0) return [...rows, row];
      const copy = [...rows];
      copy[existing] = row;
      return copy;
    });
    if (!quiet) {
      toast.success(
        result.synced ? "Progress saved to your account" : "Saved on this device (not signed in)",
      );
    }
    return result;
  }

  function setReaderPosition(nextIndex: number, replace = true) {
    const next = Math.min(total - 1, Math.max(0, nextIndex));
    setIndex(next);
    void navigate({
      to: "/read/$bookId",
      params: { bookId },
      search: { lang: language, page: next + 1 },
      replace,
    });
  }

  function go(delta: number) {
    const next = Math.min(total - 1, Math.max(0, index + delta));
    if (next === index) return;
    setReaderPosition(next);
  }

  function switchLanguage(l: string) {
    void navigate({
      to: "/read/$bookId",
      params: { bookId },
      search: { lang: l, page: index + 1 },
    });
  }

  function applyReaderPrefs(
    next: Partial<{
      fontSize: number;
      lineHeight: number;
      theme: ReaderTheme;
      fontFamily: ReaderFontFamily;
      contentWidth: ReaderContentWidth;
      paragraphSpacing: number;
      presentation: ReaderPresentation;
    }>,
  ) {
    if (next.fontSize !== undefined) setFontSize(next.fontSize);
    if (next.lineHeight !== undefined) setLineHeight(next.lineHeight);
    if (next.theme !== undefined) setTheme(next.theme);
    if (next.fontFamily !== undefined) setFontFamily(next.fontFamily);
    if (next.contentWidth !== undefined) setContentWidth(next.contentWidth);
    if (next.paragraphSpacing !== undefined) setParagraphSpacing(next.paragraphSpacing);
    if (next.presentation !== undefined) setPresentation(next.presentation);
    setPrefs(next);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (editing) return;

      if (event.key === "Escape") {
        setShowSettings(false);
        setShowToc(false);
        setShowHighlights(false);
        setShowSearch(false);
        return;
      }
      if (showSettings || showToc || showHighlights || showSearch) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, total, language, showSettings, showToc, showHighlights, showSearch]);

  async function handleHighlight() {
    const selection = window.getSelection();
    const selectedText = selection?.toString() ?? "";
    if (!selection || selection.rangeCount === 0 || !selectedText.trim()) {
      toast.info("Select some text in the page first, then tap Highlight.");
      return;
    }

    const range = selection.getRangeAt(0);
    const root = readerTextRef.current;
    if (
      !root ||
      !root.contains(range.startContainer) ||
      !root.contains(range.endContainer)
    ) {
      toast.info("Select text from the book page itself, then tap Highlight.");
      return;
    }

    const startAnchor = findReaderTextAnchor(range.startContainer);
    const endAnchor = findReaderTextAnchor(range.endContainer);
    if (!startAnchor || !endAnchor) {
      toast.info("That selection crosses content we can't anchor yet. Try selecting the passage text only.");
      return;
    }

    const startBase = Number(startAnchor.dataset["readerTextStart"]);
    const endBase = Number(endAnchor.dataset["readerTextStart"]);
    if (!Number.isFinite(startBase) || !Number.isFinite(endBase)) {
      toast.error("Couldn't anchor that highlight.");
      return;
    }

    const startOffset =
      startBase + textOffsetWithinAnchor(startAnchor, range.startContainer, range.startOffset);
    const endOffset =
      endBase + textOffsetWithinAnchor(endAnchor, range.endContainer, range.endOffset);

    if (endOffset <= startOffset) {
      toast.info("Select at least one complete word or phrase.");
      return;
    }

    const saved = await addHighlight(
      userId,
      bookId,
      language,
      index,
      selectedText.replace(/\s+/g, " ").trim(),
      startOffset,
      endOffset,
    );

    queryClient.setQueryData<Highlight[]>(["highlights", userId], (rows = []) => [
      saved,
      ...rows.filter((row) => row.id !== saved.id),
    ]);
    selection.removeAllRanges();

    setHighlightSaved(true);
    if (highlightFeedbackTimer.current) clearTimeout(highlightFeedbackTimer.current);
    highlightFeedbackTimer.current = setTimeout(() => setHighlightSaved(false), 900);
    toast.success("Highlighted — it will stay marked in this book for your account");
  }

  const isOriginalLanguage = book ? language === book.source_language : true;

  async function handleReportIssue() {
    const reason = window.prompt(
      isOriginalLanguage
        ? "What's wrong with this page? Report a typo, formatting problem, or extraction artifact — a quick note helps us fix it."
        : `What's wrong with this ${language} translation? A quick note helps us fix it.`,
    );
    if (!reason || !reason.trim()) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Sign in to report a translation issue — it needs to be tied to your account.");
        return;
      }
      await reportTranslationIssue({
        data: { bookId, language, chunkIndex: index, reason: reason.trim(), accessToken: token },
      });
      toast.success("Thanks — reported to the author.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Couldn't send the report: ${error.message}`
          : "Couldn't send the report.",
      );
    }
  }

  async function handleRequestTranslationAccess() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Sign in to request this translation.");
        return;
      }
      const result = await requestBookTranslationAccess({
        data: { bookId, language, accessToken: token },
      });
      toast.success(
        result.status === "granted"
          ? "You already have access — reloading."
          : "Request sent — you'll be notified once it's reviewed.",
      );
      queryClient.invalidateQueries({ queryKey: ["reader-chunk", bookId, language, index] });
      queryClient.invalidateQueries({ queryKey: ["my-translation-requests", userId, bookId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send the request");
    }
  }

  const content = chunkQuery.data?.content ?? null;
  const readableBlocks = useMemo(() => (content ? parseReadableBlocks(content) : []), [content]);
  const bookHighlights = (highlightsQuery.data ?? []).filter(
    (highlight) => highlight.book_id === bookId,
  );
  const pageHighlights = bookHighlights.filter(
    (highlight) => highlight.language === language && highlight.chunk_index === index,
  );
  const navigationItems = (navigationQuery.data ?? []) as ReaderNavigationItem[];
  const currentNavigationItem =
    [...navigationItems].reverse().find((item) => item.index <= index) ?? navigationItems[0] ?? null;
  const locked = chunkQuery.data?.locked ?? false;
  const lockReason = chunkQuery.data?.reason;
  const myRequestForLanguage = myRequestStatusByLanguage.get(language);
  const myRequestStatus = myRequestForLanguage?.status as string | undefined;

  if (bookQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="font-display text-2xl font-semibold text-foreground">
          We couldn't find that book
        </p>
        <Link to="/library" className="text-sm font-semibold text-primary hover:underline">
          Back to the library
        </Link>
      </div>
    );
  }

  return (
    <div className={`min-h-screen paper-texture ${THEME_CLASS[theme]}`}>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap sm:gap-3">
            <Link
              to="/library"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Library
            </Link>
            <Link
              to="/book/$bookId"
              params={{ bookId }}
              className="order-3 w-full min-w-0 text-center hover:opacity-80 sm:order-none sm:w-auto sm:flex-1"
            >
              <p className="truncate font-display text-sm font-semibold text-foreground">
                {book.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {book.author} ·{" "}
                <span dir="ltr" className="inline-block">
                  {currentNavigationItem?.title ?? `Reading section ${index + 1}`} · {index + 1}/{total}
                </span>
              </p>
            </Link>
            <div className="order-2 ml-auto flex items-center gap-1.5 sm:order-none sm:ml-0">
              <button
                onClick={() => setShowToc(true)}
                aria-label="Table of contents"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-secondary sm:h-8 sm:w-8"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowSearch(true)}
                aria-label="Search inside book"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-secondary sm:h-8 sm:w-8"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                aria-label="Reading settings"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-secondary sm:h-8 sm:w-8"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <ShelfButtons bookId={bookId} />
              <button
                onClick={() => void persist(index, false)}
                aria-label="Save progress now"
                className="inline-flex h-11 w-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card p-0 text-xs font-semibold text-foreground hover:bg-secondary sm:h-auto sm:w-auto sm:px-3 sm:py-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Save</span>
              </button>
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-6">
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {book.available_languages.map((l) => (
            <button
              key={l}
              onClick={() => switchLanguage(l)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                l === language
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {requestableLanguagesForBook.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Request translation:</span>
            <select
              value={requestableLanguagesForBook.includes(language as (typeof requestableLanguagesForBook)[number]) ? language : ""}
              onChange={(e) => {
                if (e.target.value) switchLanguage(e.target.value);
              }}
              aria-label="Choose a language to request"
              className="max-w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Choose language…</option>
              {requestableLanguagesForBook.map((l) => {
                const myRequest = myRequestStatusByLanguage.get(l);
                const status = myRequest?.status as string | undefined;
                const suffix =
                  status === "requested" || status === "approved_awaiting_edition"
                    ? " — requested"
                    : status === "declined"
                      ? " — declined"
                      : status === "revoked"
                        ? " — revoked"
                        : "";
                return (
                  <option key={l} value={l}>
                    {l}{suffix}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {!languageAvailable ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center card-shadow">
            <BookOpen className="mx-auto h-9 w-9 text-muted-foreground/60" />
            <h2 className="mt-3 font-display text-xl font-semibold text-foreground">
              {book.title} isn't available in {language} yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              This edition hasn't been translated and reviewed yet. It's available in:
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {book.available_languages.map((l) => (
                <button
                  key={l}
                  onClick={() => switchLanguage(l)}
                  className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-accent"
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        ) : locked ? (
          <div className="mt-8 rounded-2xl border border-gold/50 bg-card p-8 text-center card-shadow">
            <Lock className="mx-auto h-9 w-9 text-gold" />
            <h2 className="mt-4 font-display text-2xl font-semibold text-foreground">
              {lockReason === "sign_in_required"
                ? "Sign in to keep reading"
                : lockReason === "translation_access_required"
                  ? myRequestStatus === "requested" ||
                    myRequestStatus === "approved_awaiting_edition"
                    ? `Your ${language} request is pending`
                    : myRequestStatus === "declined"
                      ? `${language} request declined`
                      : myRequestStatus === "revoked"
                        ? `${language} access was revoked`
                        : `Request the ${language} edition`
                  : lockReason === "not_available"
                    ? "This book isn't available right now"
                    : "This is a premium book"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {lockReason === "sign_in_required"
                ? "You've read the free opening page. Sign in to continue."
                : lockReason === "translation_access_required"
                  ? myRequestStatus === "requested"
                    ? "Your request is waiting for admin review. You'll be notified once it's decided."
                    : myRequestStatus === "approved_awaiting_edition"
                      ? "Approved — a human-reviewed edition is being prepared. You'll get access automatically once it's published."
                      : myRequestStatus === "declined"
                        ? ((myRequestForLanguage?.decision_reason as string | undefined) ??
                          "An admin declined this request.")
                        : myRequestStatus === "revoked"
                          ? ((myRequestForLanguage?.decision_reason as string | undefined) ??
                            "Access to this edition was revoked.")
                          : `${language} is available on request — an admin reviews each request. You'll be notified once it's ready.`
                  : lockReason === "not_available"
                    ? "This title isn't published yet — check back later."
                    : `You've read the free opening page of ${book.title}. One Seeparah Premium subscription — $${planPrice.toFixed(2)}/month — unlocks this and every other Premium book and translation.`}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {lockReason === "sign_in_required" ? (
                <Link
                  to="/auth"
                  search={{ redirect: currentHref }}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  <LogIn className="h-4 w-4" /> Sign in
                </Link>
              ) : lockReason === "translation_access_required" ? (
                myRequestStatus === "requested" ||
                myRequestStatus === "approved_awaiting_edition" ? (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-semibold text-secondary-foreground">
                    Waiting for review
                  </span>
                ) : myRequestStatus === "declined" || myRequestStatus === "revoked" ? (
                  <Link
                    to="/library"
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-secondary"
                  >
                    Back to the library
                  </Link>
                ) : (
                  <button
                    onClick={handleRequestTranslationAccess}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                  >
                    Request this translation
                  </button>
                )
              ) : lockReason === "not_available" ? (
                <Link
                  to="/library"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  Back to the library
                </Link>
              ) : (
                <Link
                  to="/subscribe"
                  search={{ book: book.id }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-gold-foreground transition-transform hover:-translate-y-0.5"
                >
                  Unlock for ${planPrice.toFixed(2)}/mo
                </Link>
              )}
              {lockReason !== "not_available" && (
                <button
                  onClick={() => go(-1)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  Back to the free page
                </button>
              )}
            </div>
          </div>
        ) : chunkQuery.isLoading ? (
          <div className="mt-10 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-secondary" />
            ))}
          </div>
        ) : content ? (
          <>
            <article
              key={`${language}:${index}:${presentation}`}
              dir={rtl ? "rtl" : "ltr"}
              lang={languageToBcp47(language)}
              style={{
                fontSize: `${isUrdu ? Math.max(fontSize, 20) : fontSize}px`,
                lineHeight: isUrdu ? Math.max(lineHeight, 2.2) : lineHeight,
                maxWidth:
                  presentation === "continuous"
                    ? contentWidth === "narrow"
                      ? "55ch"
                      : contentWidth === "wide"
                        ? "72ch"
                        : "65ch"
                    : contentWidth === "narrow"
                      ? "42rem"
                      : contentWidth === "wide"
                        ? "60rem"
                        : "48rem",
                fontFamily:
                  protectedFontFamily ??
                  (fontFamily === "sans"
                    ? "Inter, ui-sans-serif, system-ui, sans-serif"
                    : fontFamily === "serif"
                      ? "ui-serif, Georgia, Cambria, serif"
                      : "Georgia, 'Times New Roman', ui-serif, serif"),
              }}
              className={`mx-auto mt-8 text-card-foreground ${
                presentation === "book"
                  ? "book-page-surface reader-page-enter px-4 py-8 sm:px-14 sm:py-14 md:px-16"
                  : "rounded-2xl border border-border bg-card p-6 card-shadow sm:p-10"
              } ${isUrdu ? "urdu-reading-block" : ""} ${
                religious ? "religious-reading-block" : ""
              } ${
                typographyProfile === "facsimile_preserving"
                  ? "source-lineation-preserving"
                  : ""
              }`}
            >
              {presentation === "book" && (
                <div className="mb-8 flex items-center justify-between gap-4 border-b border-border/60 pb-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <span className="truncate">{currentNavigationItem?.title ?? book.title}</span>
                  <span className="shrink-0">{book.author}</span>
                </div>
              )}
              <ReadableChunk
                blocks={readableBlocks}
                paragraphSpacing={paragraphSpacing}
                highlights={pageHighlights}
                contentRef={readerTextRef}
              />
              {presentation === "book" && (
                <footer className="mt-12 border-t border-border/50 pt-4 text-center text-xs text-muted-foreground">
                  <span aria-label={`Reading section ${index + 1} of ${total}`}>
                    {index + 1}
                  </span>
                </footer>
              )}
            </article>
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
              <button
                onClick={handleReportIssue}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Flag className="h-3.5 w-3.5" />{" "}
                {isOriginalLanguage ? "Report a problem with this page" : "Report translation issue"}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center card-shadow">
            <BookOpen className="mx-auto h-9 w-9 text-muted-foreground/60" />
            <h2 className="mt-3 font-display text-xl font-semibold text-foreground">
              This page couldn't be loaded
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Something went wrong fetching this page. Try again, or switch language above.
            </p>
            <button
              onClick={() => chunkQuery.refetch()}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              Try again
            </button>
          </div>
        )}

        {isDemo && (
          <p className="mt-6 rounded-xl bg-secondary px-4 py-3 text-center text-xs text-secondary-foreground">
            You're reading in demo mode — progress and highlights are kept on this device.{" "}
            <Link
              to="/auth"
              search={{ redirect: currentHref }}
              className="font-semibold text-primary hover:underline"
            >
              Sign in to sync them everywhere
            </Link>
            .
          </p>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => go(-1)}
            disabled={index === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHighlights(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              <AlignLeft className="h-4 w-4" />
              <span className="hidden sm:inline">
                Highlights{bookHighlights.length ? ` (${bookHighlights.length})` : ""}
              </span>
            </button>
            <button
              onClick={handleHighlight}
              aria-live="polite"
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                highlightSaved
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-accent-foreground hover:bg-primary/15"
              }`}
            >
              <Highlighter className="h-4 w-4" />
              <span className="hidden sm:inline">{highlightSaved ? "Highlighted" : "Highlight"}</span>
            </button>
          </div>
          <button
            onClick={() => go(1)}
            disabled={index >= total - 1}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showSettings && (
        <ReaderSettingsSheet
          fontSize={fontSize}
          lineHeight={lineHeight}
          theme={theme}
          fontFamily={fontFamily}
          contentWidth={contentWidth}
          paragraphSpacing={paragraphSpacing}
          presentation={presentation}
          onChange={applyReaderPrefs}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showToc && (
        <TocSheet
          items={navigationItems}
          current={index}
          onSelect={(i) => {
            setReaderPosition(i);
            setShowToc(false);
          }}
          onClose={() => setShowToc(false)}
        />
      )}
      {showSearch && (
        <BookSearchSheet
          bookId={bookId}
          language={language}
          onSelect={(chunkIndex) => {
            setReaderPosition(chunkIndex);
            setShowSearch(false);
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
      {showHighlights && (
        <HighlightsSheet
          userId={userId}
          bookId={bookId}
          highlights={bookHighlights}
          onJump={(chunkIndex, hlLanguage) => {
            if (hlLanguage !== language) {
              setIndex(chunkIndex);
              void navigate({
                to: "/read/$bookId",
                params: { bookId },
                search: { lang: hlLanguage, page: chunkIndex + 1 },
              });
            } else {
              setReaderPosition(chunkIndex);
            }
            setShowHighlights(false);
          }}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ["highlights", userId] })}
          onClose={() => setShowHighlights(false)}
        />
      )}
    </div>
  );
}

function findReaderTextAnchor(node: Node | null): HTMLElement | null {
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
  const probe = document.createRange();
  probe.selectNodeContents(anchor);
  try {
    probe.setEnd(boundaryNode, boundaryOffset);
    return probe.toString().length;
  } catch {
    return 0;
  }
}

function mergeHighlightRanges(
  text: string,
  absoluteStart: number,
  highlights: Highlight[],
): Array<{ start: number; end: number }> {
  const absoluteEnd = absoluteStart + text.length;
  const ranges: Array<{ start: number; end: number }> = [];

  for (const highlight of highlights) {
    // New Reader V2 highlights have an exact saved range. Once a highlight
    // has offsets, NEVER fall back to text matching on other anchors: doing
    // that would mark every repeated occurrence of a word such as "should".
    if (highlight.start_offset != null && highlight.end_offset != null) {
      if (
        highlight.end_offset > absoluteStart &&
        highlight.start_offset < absoluteEnd
      ) {
        ranges.push({
          start: Math.max(0, highlight.start_offset - absoluteStart),
          end: Math.min(text.length, highlight.end_offset - absoluteStart),
        });
      }
      continue;
    }

    // Backward compatibility only for highlights created before migration
    // 0020, which genuinely have no positional offsets.
    const legacyText = highlight.highlight_text.trim();
    if (!legacyText) continue;
    const exact = text.indexOf(legacyText);
    if (exact >= 0) {
      ranges.push({ start: exact, end: exact + legacyText.length });
    } else if (text.trim().length >= 4 && legacyText.includes(text.trim())) {
      const leading = text.indexOf(text.trim());
      ranges.push({ start: Math.max(0, leading), end: leading + text.trim().length });
    }
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    if (range.end <= range.start) continue;
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function renderPersistedHighlights(
  text: string,
  absoluteStart: number,
  highlights: Highlight[],
): React.ReactNode {
  const ranges = mergeHighlightRanges(text, absoluteStart, highlights);
  if (ranges.length === 0) return text;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, i) => {
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(
      <mark key={`${range.start}:${range.end}:${i}`} className="reader-highlight">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
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
    Vietnamese: "vi",
    Thai: "th",
    Swahili: "sw",
    Pashto: "ps",
    Malay: "ms",
    Hebrew: "he",
    Tamil: "ta",
    Telugu: "te",
    Marathi: "mr",
    Gujarati: "gu",
    Filipino: "fil",
  };
  return map[language] ?? "en";
}

function SheetShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/20 backdrop-blur-sm sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-6 card-shadow-lg sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function ReadableChunk({
  blocks,
  paragraphSpacing,
  highlights,
  contentRef,
}: {
  blocks: ReturnType<typeof parseReadableBlocks>;
  paragraphSpacing: number;
  highlights: Highlight[];
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (blocks.length === 0) return null;

  // Character positions are intentionally based on the visible text anchors,
  // not raw EPUB/PDF whitespace. This makes saved highlights stable across
  // font, width, theme and page-style changes because those only reflow the
  // same text; they do not change this coordinate space.
  let cursor = 0;
  const nextStart = (text: string) => {
    const start = cursor;
    cursor += text.length + 2;
    return start;
  };

  const anchoredText = (text: string, className?: string) => {
    const start = nextStart(text);
    return (
      <span
        data-reader-text-start={start}
        data-reader-text-end={start + text.length}
        className={className}
      >
        {renderPersistedHighlights(text, start, highlights)}
      </span>
    );
  };

  return (
    <div ref={contentRef} data-reader-text-root="true">
      {blocks.map((block, i) => {
        const spacing = i === 0 ? undefined : { marginTop: `${paragraphSpacing}rem` };
        if (block.kind === "heading") {
          if (block.level === 1) {
            return (
              <h2
                key={i}
                style={spacing}
                className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground"
              >
                {anchoredText(block.text)}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3
                key={i}
                style={spacing}
                className="font-display text-2xl font-semibold leading-snug text-foreground"
              >
                {anchoredText(block.text)}
              </h3>
            );
          }
          return (
            <h4
              key={i}
              style={spacing}
              className="font-display text-xl font-semibold leading-snug text-foreground"
            >
              {anchoredText(block.text)}
            </h4>
          );
        }
        if (block.kind === "principle") {
          return (
            <aside
              key={i}
              style={spacing}
              className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 font-semibold leading-relaxed text-foreground"
            >
              {anchoredText(block.text)}
            </aside>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote
              key={i}
              style={spacing}
              className="border-l-4 border-primary/40 pl-5 italic text-muted-foreground"
            >
              {anchoredText(block.text)}
            </blockquote>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i} style={spacing} className="list-disc space-y-2 pl-6">
              {(block.items ?? []).map((item, itemIndex) => (
                <li key={itemIndex}>{anchoredText(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} style={spacing} className="leading-inherit">
            {anchoredText(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function ReaderSettingsSheet({
  fontSize,
  lineHeight,
  theme,
  fontFamily,
  contentWidth,
  paragraphSpacing,
  presentation,
  onChange,
  onClose,
}: {
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
  fontFamily: ReaderFontFamily;
  contentWidth: ReaderContentWidth;
  paragraphSpacing: number;
  presentation: ReaderPresentation;
  onChange: (
    next: Partial<{
      fontSize: number;
      lineHeight: number;
      theme: ReaderTheme;
      fontFamily: ReaderFontFamily;
      contentWidth: ReaderContentWidth;
      paragraphSpacing: number;
      presentation: ReaderPresentation;
    }>,
  ) => void;
  onClose: () => void;
}) {
  return (
    <SheetShell title="Reading settings" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Theme
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["light", "sepia", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => onChange({ theme: t })}
                aria-pressed={theme === t}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize ${
                  theme === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reading style
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([
              ["book", "Book page"],
              ["continuous", "Continuous"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => onChange({ presentation: value })}
                aria-pressed={presentation === value}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                  presentation === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Book page gives each reading section a paper-page shape with generous inner margins and a page number.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Typeface
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([
              ["literary", "Literary"],
              ["serif", "Serif"],
              ["sans", "Sans"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => onChange({ fontFamily: value })}
                aria-pressed={fontFamily === value}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                  fontFamily === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reading width
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["narrow", "medium", "wide"] as const).map((value) => (
              <button
                key={value}
                onClick={() => onChange({ contentWidth: value })}
                aria-pressed={contentWidth === value}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize ${
                  contentWidth === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-secondary"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Font size
            </p>
            <span className="text-xs text-muted-foreground">{fontSize}px</span>
          </div>
          <input
            type="range"
            min={FONT_SIZE_RANGE.min}
            max={FONT_SIZE_RANGE.max}
            step={FONT_SIZE_RANGE.step}
            value={fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="mt-2 w-full"
            aria-label="Font size"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Line spacing
            </p>
            <span className="text-xs text-muted-foreground">{lineHeight.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min={LINE_HEIGHT_RANGE.min}
            max={LINE_HEIGHT_RANGE.max}
            step={LINE_HEIGHT_RANGE.step}
            value={lineHeight}
            onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
            className="mt-2 w-full"
            aria-label="Line spacing"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Paragraph spacing
            </p>
            <span className="text-xs text-muted-foreground">
              {paragraphSpacing.toFixed(1)}rem
            </span>
          </div>
          <input
            type="range"
            min={PARAGRAPH_SPACING_RANGE.min}
            max={PARAGRAPH_SPACING_RANGE.max}
            step={PARAGRAPH_SPACING_RANGE.step}
            value={paragraphSpacing}
            onChange={(e) => onChange({ paragraphSpacing: Number(e.target.value) })}
            className="mt-2 w-full"
            aria-label="Paragraph spacing"
          />
        </div>

        <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          Keyboard: ← / → move between reading sections. Esc closes reader panels.
        </p>
      </div>
    </SheetShell>
  );
}

function TocSheet({
  items,
  current,
  onSelect,
  onClose,
}: {
  items: ReaderNavigationItem[];
  current: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const currentItemIndex = items.findIndex((item, i) => {
    const next = items[i + 1];
    return item.index <= current && (!next || next.index > current);
  });

  return (
    <SheetShell title="Table of contents" onClose={onClose}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This edition does not have reliable chapter metadata yet.
        </p>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => {
            const active = i === currentItemIndex;
            return (
              <button
                key={`${item.index}:${item.title}:${i}`}
                onClick={() => onSelect(item.index)}
                aria-current={active ? "location" : undefined}
                className={`block w-full rounded-lg border px-3 py-2.5 text-left text-sm ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-secondary"
                }`}
                style={{ paddingInlineStart: `${0.75 + item.depth * 0.9}rem` }}
              >
                <span className="block font-semibold">{item.title}</span>
                <span
                  className={`mt-0.5 block text-[11px] ${
                    active ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {item.kind === "reading" ? "Reading waypoint" : item.kind.replace("_", " ")}
                  {" · "}section {item.index + 1}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </SheetShell>
  );
}

function BookSearchSheet({
  bookId,
  language,
  onSelect,
  onClose,
}: {
  bookId: string;
  language: string;
  onSelect: (chunkIndex: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const resultsQuery = useQuery({
    queryKey: ["reader-book-search", bookId, language, trimmed],
    queryFn: () => searchReaderBook(bookId, language, trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  });

  return (
    <SheetShell title="Search inside book" onClose={onClose}>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a word, name, or phrase…"
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {trimmed.length < 2 ? (
        <p className="mt-3 text-xs text-muted-foreground">Type at least 2 characters.</p>
      ) : resultsQuery.isLoading ? (
        <div className="mt-4 flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (resultsQuery.data ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No matches found in this edition.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {(resultsQuery.data ?? []).map((result, i) => (
            <li key={`${result.index}:${i}`}>
              <button
                onClick={() => onSelect(result.index)}
                className="w-full rounded-xl border border-border bg-background px-3 py-3 text-left hover:bg-secondary"
              >
                <span className="block text-xs font-semibold text-primary">
                  Reading section {result.index + 1}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-foreground">
                  {result.snippet}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SheetShell>
  );
}

function HighlightsSheet({
  userId,
  bookId,
  highlights,
  onJump,
  onChanged,
  onClose,
}: {
  userId: string;
  bookId: string;
  highlights: Array<{
    id: string;
    chunk_index: number;
    language: string;
    highlight_text: string;
    note: string | null;
  }>;
  onJump: (chunkIndex: number, language: string) => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");

  return (
    <SheetShell title="Your highlights" onClose={onClose}>
      {highlights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Select text while reading and tap Highlight to save a passage here.
        </p>
      ) : (
        <ul className="space-y-3">
          {highlights.map((h) => (
            <li key={h.id} className="rounded-xl border-l-4 border-gold bg-background px-4 py-3">
              <button
                onClick={() => onJump(h.chunk_index, h.language)}
                dir={RTL_LANGUAGES.has(h.language) ? "rtl" : "ltr"}
                lang={languageToBcp47(h.language)}
                className={`text-left text-sm italic text-foreground hover:underline ${
                  h.language === "Urdu" ? "leading-loose" : "font-display leading-relaxed"
                }`}
              >
                "{h.highlight_text}"
              </button>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {h.language} · page {h.chunk_index + 1}
                </p>
                <button
                  onClick={async () => {
                    await removeHighlight(userId, h.id);
                    onChanged();
                  }}
                  aria-label="Remove highlight"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {editingId === h.id ? (
                <div className="mt-2 flex gap-2">
                  <input
                    autoFocus
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    placeholder="Add a note…"
                    className="flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={async () => {
                      await updateHighlightNote(userId, h.id, draftNote.trim());
                      setEditingId(null);
                      onChanged();
                    }}
                    className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    Save
                  </button>
                </div>
              ) : h.note ? (
                <button
                  onClick={() => {
                    setEditingId(h.id);
                    setDraftNote(h.note ?? "");
                  }}
                  className="mt-1.5 block text-left text-xs text-muted-foreground hover:text-foreground"
                >
                  📝 {h.note}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setEditingId(h.id);
                    setDraftNote("");
                  }}
                  className="mt-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  + Add note
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SheetShell>
  );
}
