import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { z } from "zod";
import { RTL_LANGUAGES } from "@/lib/data";
import {
  addHighlight,
  getBook,
  getReaderChunk,
  listHighlights,
  listProgress,
  listSubscriptions,
  removeHighlight,
  saveProgress,
  updateHighlightNote,
} from "@/lib/library";
import { reportTranslationIssue } from "@/lib/translation.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { ShelfButtons } from "@/components/ShelfButtons";
import { recordReadingDay } from "@/lib/shelves";
import {
  FONT_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
  getPrefs,
  setPrefs,
  type ReaderTheme,
} from "@/lib/prefs";

const searchSchema = z.object({ lang: z.string().optional() });

export const Route = createFileRoute("/read/$bookId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Reading room — Seeparah" },
      {
        name: "description",
        content:
          "A calm reading room: pages load one at a time in your chosen language, with highlights and progress saved as you go.",
      },
      { property: "og:title", content: "Reading room — Seeparah" },
      {
        property: "og:description",
        content: "Read one page at a time in your chosen language.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReaderPage,
});

const THEME_CLASS: Record<ReaderTheme, string> = {
  light: "",
  sepia: "sepia",
  dark: "dark",
};

function ReaderPage() {
  const { bookId } = Route.useParams();
  const { lang } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId, isDemo } = useAuth();

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
  const [fontSize, setFontSize] = useState(prefs.fontSize);
  const [lineHeight, setLineHeight] = useState(prefs.lineHeight);
  const [theme, setTheme] = useState<ReaderTheme>(prefs.theme);

  const seededBookRef = useRef<string | null>(null);

  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId),
  });
  const subsQuery = useQuery({
    queryKey: ["subscriptions", userId],
    queryFn: () => listSubscriptions(userId),
  });
  const highlightsQuery = useQuery({
    queryKey: ["highlights", userId],
    queryFn: () => listHighlights(userId),
  });

  // Seed the starting page exactly once per book, from whichever language
  // is active at that moment (URL param, else preferred language, else the
  // book's source language). After that, index is only ever changed by
  // explicit navigation — a later language switch never re-seeds it, so the
  // same passage stays open across languages where alignment is available.
  useEffect(() => {
    if (!book || !progressQuery.data) return;
    if (seededBookRef.current === bookId) return;
    const saved = progressQuery.data.find(
      (p) => p.book_id === bookId && p.language === language,
    );
    setIndex(saved ? Math.min(saved.last_chunk_index, book.total_chunks - 1) : 0);
    seededBookRef.current = bookId;
  }, [book, progressQuery.data, bookId, language]);

  const chunkQuery = useQuery({
    queryKey: ["reader-chunk", bookId, language, index],
    queryFn: () => getReaderChunk(bookId, language, index),
    enabled: !!book && seededBookRef.current === bookId,
  });

  // Autosave on every navigation and every language switch, once the
  // initial position has been seeded (so this never overwrites a just-
  // loaded saved position with the default page).
  useEffect(() => {
    if (seededBookRef.current !== bookId) return;
    void persist(index, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, language, bookId]);

  const rtl = RTL_LANGUAGES.has(language);
  const isUrdu = language === "Urdu";
  const total = book?.total_chunks ?? 1;
  const pct = Math.round(((index + 1) / total) * 100);
  const languageAvailable = book?.available_languages.includes(language) ?? true;

  async function persist(next: number, quiet = true) {
    recordReadingDay();
    const result = await saveProgress(userId, bookId, language, next);
    queryClient.invalidateQueries({ queryKey: ["progress", userId] });
    if (!quiet) {
      toast.success(
        result.synced ? "Progress saved to your account" : "Saved on this device (not signed in)",
      );
    }
    return result;
  }

  function go(delta: number) {
    const next = Math.min(total - 1, Math.max(0, index + delta));
    if (next === index) return;
    setIndex(next);
  }

  function switchLanguage(l: string) {
    navigate({ to: "/read/$bookId", params: { bookId }, search: { lang: l } });
  }

  function applyReaderPrefs(next: Partial<{ fontSize: number; lineHeight: number; theme: ReaderTheme }>) {
    if (next.fontSize !== undefined) setFontSize(next.fontSize);
    if (next.lineHeight !== undefined) setLineHeight(next.lineHeight);
    if (next.theme !== undefined) setTheme(next.theme);
    setPrefs(next);
  }

  async function handleHighlight() {
    const selection = window.getSelection()?.toString().trim();
    if (!selection) {
      toast.info("Select some text in the page first, then tap Highlight.");
      return;
    }
    await addHighlight(userId, bookId, language, index, selection);
    queryClient.invalidateQueries({ queryKey: ["highlights", userId] });
    toast.success("Passage saved to your highlights");
  }

  async function handleReportIssue() {
    const reason = window.prompt(
      `What's wrong with this ${language} page? A quick note helps us fix it.`,
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
        error instanceof Error ? `Couldn't send the report: ${error.message}` : "Couldn't send the report.",
      );
    }
  }

  const content = chunkQuery.data?.content ?? null;
  const locked = chunkQuery.data?.locked ?? false;
  const lockReason = chunkQuery.data?.reason;

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
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/library"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Library
            </Link>
            <Link
              to="/book/$bookId"
              params={{ bookId }}
              className="min-w-0 flex-1 text-center hover:opacity-80"
            >
              <p className="truncate font-display text-sm font-semibold text-foreground">
                {book.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {book.author} ·{" "}
                <span dir="ltr" className="inline-block">
                  page {index + 1} of {total}
                </span>
              </p>
            </Link>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowToc(true)}
                aria-label="Table of contents"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-secondary"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                aria-label="Reading settings"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-secondary"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <ShelfButtons bookId={bookId} />
              <button
                onClick={() => void persist(index, false)}
                aria-label="Save progress now"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
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

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
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
              {lockReason === "sign_in_required" ? "Sign in to keep reading" : "This is a premium book"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {lockReason === "sign_in_required"
                ? "You've read the free opening page. Sign in and subscribe to continue."
                : `You've read the free opening page of ${book.title}. Subscribe for $${book.subscription_price_usd}/month to keep reading — 70% goes straight to ${book.author}.`}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {lockReason === "sign_in_required" ? (
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  <LogIn className="h-4 w-4" /> Sign in
                </Link>
              ) : (
                <Link
                  to="/subscribe"
                  search={{ book: book.id }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-gold-foreground transition-transform hover:-translate-y-0.5"
                >
                  Unlock for ${book.subscription_price_usd}/mo
                </Link>
              )}
              <button
                onClick={() => go(-1)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                Back to the free page
              </button>
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
              dir={rtl ? "rtl" : "ltr"}
              lang={languageToBcp47(language)}
              style={{
                fontSize: `${isUrdu ? Math.max(fontSize, 20) : fontSize}px`,
                lineHeight: isUrdu ? Math.max(lineHeight, 2.2) : lineHeight,
              }}
              className={`mt-8 whitespace-pre-wrap rounded-2xl border border-border bg-card p-6 text-card-foreground card-shadow sm:p-10 ${
                isUrdu ? "urdu-reading-block" : "font-display"
              }`}
            >
              {content}
            </article>
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
              <button
                onClick={handleReportIssue}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Flag className="h-3.5 w-3.5" /> Report translation issue
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
            You're reading in demo mode — progress and highlights are kept on
            this device.{" "}
            <Link to="/auth" className="font-semibold text-primary hover:underline">
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
                Highlights{highlightsQuery.data?.length ? ` (${highlightsQuery.data.length})` : ""}
              </span>
            </button>
            <button
              onClick={handleHighlight}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
            >
              <Highlighter className="h-4 w-4" />
              <span className="hidden sm:inline">Highlight</span>
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
          onChange={applyReaderPrefs}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showToc && (
        <TocSheet
          total={total}
          current={index}
          onSelect={(i) => {
            setIndex(i);
            setShowToc(false);
          }}
          onClose={() => setShowToc(false)}
        />
      )}
      {showHighlights && (
        <HighlightsSheet
          userId={userId}
          bookId={bookId}
          highlights={(highlightsQuery.data ?? []).filter((h) => h.book_id === bookId)}
          onJump={(chunkIndex, hlLanguage) => {
            if (hlLanguage !== language) switchLanguage(hlLanguage);
            setIndex(chunkIndex);
            setShowHighlights(false);
          }}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ["highlights", userId] })}
          onClose={() => setShowHighlights(false)}
        />
      )}
    </div>
  );
}

function languageToBcp47(language: string): string {
  const map: Record<string, string> = {
    English: "en",
    Urdu: "ur",
    Hindi: "hi",
    Pashto: "ps",
    Arabic: "ar",
    French: "fr",
    German: "de",
    Russian: "ru",
    Chinese: "zh",
    Spanish: "es",
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

function ReaderSettingsSheet({
  fontSize,
  lineHeight,
  theme,
  onChange,
  onClose,
}: {
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
  onChange: (next: Partial<{ fontSize: number; lineHeight: number; theme: ReaderTheme }>) => void;
  onClose: () => void;
}) {
  return (
    <SheetShell title="Reading settings" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Theme</p>
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
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Font size</p>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Line spacing</p>
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
      </div>
    </SheetShell>
  );
}

function TocSheet({
  total,
  current,
  onSelect,
  onClose,
}: {
  total: number;
  current: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <SheetShell title="Table of contents" onClose={onClose}>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            aria-current={i === current}
            className={`rounded-lg border px-2 py-2.5 text-sm font-semibold ${
              i === current
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-secondary"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
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
