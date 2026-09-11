import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Loader2,
  Lock,
  Save,
  Sparkles,
} from "lucide-react";
import { z } from "zod";
import { RTL_LANGUAGES } from "@/lib/data";
import {
  addHighlight,
  getBook,
  getChunk,
  listProgress,
  listSubscriptions,
  saveProgress,
} from "@/lib/library";
import { translateChunk } from "@/lib/translate.functions";
import { useAuth } from "@/lib/use-auth";

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

function ReaderPage() {
  const { bookId } = Route.useParams();
  const { lang } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId, isDemo } = useAuth();
  const runTranslate = useServerFn(translateChunk);

  const bookQuery = useQuery({
    queryKey: ["book", bookId],
    queryFn: () => getBook(bookId),
  });
  const book = bookQuery.data;

  const language = lang ?? book?.source_language ?? "English";
  const [index, setIndex] = useState(0);
  const [seeded, setSeeded] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);

  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId),
  });
  const subsQuery = useQuery({
    queryKey: ["subscriptions", userId],
    queryFn: () => listSubscriptions(userId),
  });

  useEffect(() => {
    if (seeded || !book || !progressQuery.data) return;
    const saved = progressQuery.data.find(
      (p) => p.book_id === bookId && p.language === language,
    );
    if (saved) setIndex(saved.last_chunk_index);
    setSeeded(true);
  }, [seeded, book, progressQuery.data, bookId, language]);

  const chunkQuery = useQuery({
    queryKey: ["chunk", bookId, language, index],
    queryFn: () => getChunk(bookId, language, index),
    enabled: !!book,
  });

  useEffect(() => {
    setTranslated(null);
  }, [bookId, language, index]);

  const locked = useMemo(() => {
    if (!book || book.access_type !== "paid") return false;
    if (index === 0) return false; // free preview of the opening page
    return !(subsQuery.data ?? []).some((s) => s.book_id === book.id);
  }, [book, index, subsQuery.data]);

  const content = translated ?? chunkQuery.data?.content ?? null;
  const rtl = RTL_LANGUAGES.has(language);
  const total = book?.total_chunks ?? 1;
  const pct = Math.round(((index + 1) / total) * 100);

  async function persist(next: number, quiet = true) {
    await saveProgress(userId, bookId, language, next);
    queryClient.invalidateQueries({ queryKey: ["progress", userId] });
    if (!quiet) toast.success("Progress saved");
  }

  function go(delta: number) {
    const next = Math.min(total - 1, Math.max(0, index + delta));
    if (next === index) return;
    setIndex(next);
    void persist(next);
  }

  async function handleTranslate() {
    if (!book) return;
    setTranslating(true);
    try {
      const result = await runTranslate({
        data: { bookId, language, chunkIndex: index },
      });
      if (result.content) {
        setTranslated(result.content);
        queryClient.invalidateQueries({
          queryKey: ["chunk", bookId, language, index],
        });
        toast.success(`Translated into ${language}`);
      } else {
        const source = await getChunk(bookId, book.source_language, index);
        setTranslated(source?.content ?? null);
        toast.info(
          `A ${language} translation isn't ready yet — showing the ${book.source_language} original.`,
        );
      }
    } catch {
      toast.error("Translation is unavailable right now. Try again shortly.");
    } finally {
      setTranslating(false);
    }
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
    <div className="min-h-screen paper-texture">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/library"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Library
            </Link>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate font-display text-sm font-semibold text-foreground">
                {book.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {book.author} · page {index + 1} of {total}
              </p>
            </div>
            <button
              onClick={() => void persist(index, false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Save</span>
            </button>
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
              onClick={() =>
                navigate({
                  to: "/read/$bookId",
                  params: { bookId },
                  search: { lang: l },
                })
              }
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

        {locked ? (
          <div className="mt-8 rounded-2xl border border-gold/50 bg-card p-8 text-center card-shadow">
            <Lock className="mx-auto h-9 w-9 text-gold" />
            <h2 className="mt-4 font-display text-2xl font-semibold text-foreground">
              This is a premium book
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              You've read the free opening page of {book.title}. Subscribe for $
              {book.subscription_price_usd}/month to keep reading — 70% goes
              straight to {book.author}.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                to="/subscribe"
                search={{ book: book.id }}
                className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-gold-foreground transition-transform hover:-translate-y-0.5"
              >
                Unlock for ${book.subscription_price_usd}/mo
              </Link>
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
          <article
            dir={rtl ? "rtl" : "ltr"}
            className="mt-8 rounded-2xl border border-border bg-card p-6 reading-text text-card-foreground card-shadow sm:p-10"
          >
            {content}
          </article>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center card-shadow">
            <Sparkles className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-3 font-display text-xl font-semibold text-foreground">
              This page isn't in {language} yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Seeparah can translate it now, one page at a time, and keep it for
              every reader who comes next.
            </p>
            <button
              onClick={handleTranslate}
              disabled={translating}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {translating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {translating ? "Translating…" : `Translate this page into ${language}`}
            </button>
          </div>
        )}

        {isDemo && (
          <p className="mt-6 rounded-xl bg-secondary px-4 py-3 text-center text-xs text-secondary-foreground">
            You're reading in demo mode — progress and highlights are kept on
            this device. Sign in to sync them everywhere.
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
          <button
            onClick={handleHighlight}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
          >
            <Highlighter className="h-4 w-4" />
            <span className="hidden sm:inline">Highlight selection</span>
          </button>
          <button
            onClick={() => go(1)}
            disabled={index >= total - 1}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
