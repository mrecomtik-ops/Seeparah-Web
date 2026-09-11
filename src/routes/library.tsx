import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Flame, Search, Target } from "lucide-react";
import { LANGUAGES, type Book } from "@/lib/data";
import { listBooks, listProgress } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";
import { BookCard } from "@/components/BookCard";
import { coverFor, BOOK_OF_THE_DAY_ID } from "@/lib/covers";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library — Seeparah" },
      {
        name: "description",
        content:
          "Browse classics and new voices in ten languages. Search, filter by language, and continue reading where you left off.",
      },
      { property: "og:title", content: "Library — Seeparah" },
      {
        property: "og:description",
        content: "Browse classics and new voices in ten languages.",
      },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { userId, displayName, isDemo } = useAuth();
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<string | null>(null);

  const booksQuery = useQuery({ queryKey: ["books"], queryFn: listBooks });
  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId),
  });

  const books = booksQuery.data ?? [];
  const progressByBook = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of progressQuery.data ?? []) {
      const prev = map.get(p.book_id) ?? -1;
      if (p.last_chunk_index > prev) map.set(p.book_id, p.last_chunk_index);
    }
    return map;
  }, [progressQuery.data]);

  const filtered = books.filter((b) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q);
    const matchesLang = !lang || b.available_languages.includes(lang);
    return matchesQuery && matchesLang;
  });

  const featured: Book | undefined =
    books.find((b) => b.id === BOOK_OF_THE_DAY_ID) ?? books[0];
  const inProgress = books.filter((b) => progressByBook.has(b.id));
  const pagesRead = [...progressByBook.values()].reduce((a, b) => a + b + 1, 0);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {isDemo ? "Demo reader — sign in to sync across devices" : `Welcome back, ${displayName}`}
            </p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-foreground">
              Your library
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border bg-card px-4 py-2.5 card-shadow">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Target className="h-3.5 w-3.5 text-primary" /> Reading goal
              </p>
              <p className="font-display text-lg font-semibold text-foreground">
                {pagesRead} pages
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-2.5 card-shadow">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flame className="h-3.5 w-3.5 text-gold" /> In progress
              </p>
              <p className="font-display text-lg font-semibold text-foreground">
                {inProgress.length} {inProgress.length === 1 ? "book" : "books"}
              </p>
            </div>
          </div>
        </div>

        {featured && (
          <section className="mt-8 overflow-hidden rounded-3xl border border-border bg-primary text-primary-foreground card-shadow-lg">
            <div className="grid md:grid-cols-[240px_1fr]">
              <div className="relative hidden min-h-64 md:block">
                {coverFor(featured.id, featured.cover_url) ? (
                  <img
                    src={coverFor(featured.id, featured.cover_url)!}
                    alt={`Cover of ${featured.title}`}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <BookOpen className="h-12 w-12 opacity-40" />
                  </div>
                )}
              </div>
              <div className="p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Book of the day
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold">
                  {featured.title}
                </h2>
                <p className="mt-1 text-sm opacity-80">{featured.author}</p>
                <p className="mt-4 max-w-xl leading-relaxed opacity-90">
                  {featured.description}
                </p>
                <Link
                  to="/read/$bookId"
                  params={{ bookId: featured.id }}
                  search={{ lang: featured.source_language }}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
                >
                  {progressByBook.has(featured.id) ? "Continue reading" : "Start reading"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        )}

        <div className="mt-8 flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, author or theme…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground card-shadow outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setLang(null)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                lang === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              All languages
            </button>
            {LANGUAGES.map((l) => (
              <button
                key={l}
                onClick={() => setLang(lang === l ? null : l)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {inProgress.length > 0 && !query && !lang && (
          <section className="mt-10">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Continue reading
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {inProgress.map((b) => (
                <BookCard key={b.id} book={b} progress={progressByBook.get(b.id)} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">
            {query || lang ? "Results" : "Recommended for you"}
          </h2>
          {booksQuery.isLoading ? (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-[2/3] animate-pulse rounded-2xl bg-secondary"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center card-shadow">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 font-display text-lg font-semibold text-foreground">
                No books on this shelf yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search or language — or publish the first one
                from the Author Studio.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((b) => (
                <BookCard key={b.id} book={b} progress={progressByBook.get(b.id)} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
