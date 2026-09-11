import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Clock, Heart, Bookmark, Plus, Search, Library as LibraryIcon } from "lucide-react";
import { GENRES, LANGUAGES, type Book } from "@/lib/data";
import { listBooks, listProgress } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";
import { BookCard } from "@/components/BookCard";
import { useShelves } from "@/components/ShelfButtons";
import { coverFor, BOOK_OF_THE_DAY_ID } from "@/lib/covers";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library — Seeparah" },
      {
        name: "description",
        content:
          "Browse classics and new voices in ten languages. Search, filter by language, author and topic, and pick up your saved, favorite and want-to-read books.",
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

const TABS = [
  { key: "all", label: "All books", icon: LibraryIcon },
  { key: "continue", label: "Continue reading", icon: ArrowRight },
  { key: "saved", label: "Saved", icon: Bookmark },
  { key: "favorite", label: "Favorites", icon: Heart },
  { key: "want_to_read", label: "Want to read", icon: Plus },
  { key: "history", label: "Reading history", icon: Clock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function LibraryPage() {
  const { userId, displayName, isDemo } = useAuth();
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);

  const booksQuery = useQuery({ queryKey: ["books"], queryFn: listBooks });
  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId),
  });
  const shelvesQuery = useShelves();

  const books = booksQuery.data ?? [];
  const shelves = shelvesQuery.data ?? [];

  const progressByBook = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of progressQuery.data ?? []) {
      const prev = map.get(p.book_id) ?? -1;
      if (p.last_chunk_index > prev) map.set(p.book_id, p.last_chunk_index);
    }
    return map;
  }, [progressQuery.data]);

  const authors = useMemo(
    () => [...new Set(books.map((b) => b.author))].sort(),
    [books],
  );
  const genresInUse = useMemo(
    () => [...new Set(books.map((b) => b.genre).filter(Boolean) as string[])],
    [books],
  );

  const shelfIds = (kind: string) =>
    new Set(shelves.filter((s) => s.shelf === kind).map((s) => s.book_id));

  const tabBooks = useMemo(() => {
    switch (tab) {
      case "continue":
        return books.filter(
          (b) =>
            progressByBook.has(b.id) &&
            (progressByBook.get(b.id) ?? 0) + 1 < b.total_chunks,
        );
      case "history":
        return books.filter((b) => progressByBook.has(b.id));
      case "saved":
      case "favorite":
      case "want_to_read": {
        const ids = shelfIds(tab);
        return books.filter((b) => ids.has(b.id));
      }
      default:
        return books;
    }
  }, [tab, books, progressByBook, shelves]);

  const filtered = tabBooks.filter((b) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q);
    const matchesLang = !lang || b.available_languages.includes(lang);
    const matchesGenre = !genre || b.genre === genre;
    const matchesAuthor = !author || b.author === author;
    return matchesQuery && matchesLang && matchesGenre && matchesAuthor;
  });

  const featured: Book | undefined =
    books.find((b) => b.id === BOOK_OF_THE_DAY_ID) ?? books[0];
  const pagesRead = [...progressByBook.values()].reduce((a, b) => a + b + 1, 0);
  const counts: Record<TabKey, number> = {
    all: books.length,
    continue: books.filter(
      (b) => progressByBook.has(b.id) && (progressByBook.get(b.id) ?? 0) + 1 < b.total_chunks,
    ).length,
    history: progressByBook.size,
    saved: shelfIds("saved").size,
    favorite: shelfIds("favorite").size,
    want_to_read: shelfIds("want_to_read").size,
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {isDemo
                ? "Demo reader — sign in to sync across devices"
                : `Welcome back, ${displayName}`}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Your library
            </h1>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-2.5 card-shadow">
            <p className="text-xs text-muted-foreground">Pages read</p>
            <p className="font-display text-lg font-semibold text-foreground">
              {pagesRead}
            </p>
          </div>
        </div>

        {featured && tab === "all" && !query && (
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
              <div className="p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Book of the day
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
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

        <div className="mt-8 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
                <span className="opacity-70">{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, author or theme…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground card-shadow outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Language"
              value={lang}
              options={[...LANGUAGES]}
              onChange={setLang}
            />
            <Select
              label="Author"
              value={author}
              options={authors}
              onChange={setAuthor}
            />
            <Select
              label="Topic"
              value={genre}
              options={genresInUse.length ? genresInUse : [...GENRES]}
              onChange={setGenre}
            />
          </div>
        </div>

        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold text-foreground">
            {TABS.find((t) => t.key === tab)?.label}
          </h2>
          {booksQuery.isLoading ? (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-secondary" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center card-shadow">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 font-display text-lg font-semibold text-foreground">
                Nothing on this shelf yet
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Tap the heart, bookmark or plus on any book cover to build your
                own shelves — or start reading to fill your history.
              </p>
              <button
                onClick={() => {
                  setTab("all");
                  setQuery("");
                  setLang(null);
                  setGenre(null);
                  setAuthor(null);
                }}
                className="mt-5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                Browse all books
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((b) => (
                <BookCard key={b.id} book={b} progress={progressByBook.get(b.id) ?? null} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground card-shadow outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
