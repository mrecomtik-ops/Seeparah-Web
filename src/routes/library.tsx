import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Heart,
  Bookmark,
  Plus,
  Search,
  X,
  Library as LibraryIcon,
} from "lucide-react";
import {
  GENRES,
  LANGUAGES,
  SAMPLE_EXCERPT_BOOK_IDS,
  DEMO_MANUSCRIPT_BOOK_IDS,
  type Book,
} from "@/lib/data";
import { listBooks, listProgress, matchesBookSearch } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";
import { BookCard } from "@/components/BookCard";
import { useShelves } from "@/components/ShelfButtons";
import { coverFor, FEATURED_BOOK_ID } from "@/lib/covers";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";

const TABS = [
  { key: "all", label: "All books", icon: LibraryIcon },
  { key: "continue", label: "Continue reading", icon: ArrowRight },
  { key: "saved", label: "Saved", icon: Bookmark },
  { key: "favorite", label: "Favorites", icon: Heart },
  { key: "want_to_read", label: "Want to read", icon: Plus },
  { key: "history", label: "Reading history", icon: Clock },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map((t) => t.key) as [TabKey, ...TabKey[]];

const searchSchema = z.object({
  tab: z.enum(TAB_KEYS).optional(),
  q: z.string().optional(),
  lang: z.string().optional(),
  genre: z.string().optional(),
  author: z.string().optional(),
  category: z.string().optional(),
});

export const Route = createFileRoute("/library")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Library — Seeparah" },
      {
        name: "description",
        content:
          "Browse free original-language books and reviewed translations. Search by title or author and filter by language, topic, author, or category — including the always-free Religious collection.",
      },
      { property: "og:title", content: "Library — Seeparah" },
      {
        property: "og:description",
        content: "Search and browse books by language and category, including the always-free Religious collection.",
      },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { userId, displayName, isDemo } = useAuth();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const tab = search.tab ?? "all";
  const query = search.q ?? "";
  const lang = search.lang ?? null;
  const genre = search.genre ?? null;
  const author = search.author ?? null;
  const category = search.category ?? null;

  function updateSearch(patch: Partial<z.infer<typeof searchSchema>>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }

  const booksQuery = useQuery({ queryKey: ["books"], queryFn: listBooks });
  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId),
  });
  const shelvesQuery = useShelves();
  const settingsQuery = useQuery({
    queryKey: ["public-content-settings"],
    queryFn: () => getPublicContentSettings(),
  });
  const monetizationEnabled = settingsQuery.data?.["monetization_enabled"] === true;

  const books = booksQuery.data ?? [];
  const shelves = shelvesQuery.data ?? [];

  // Keeps the language of the winning (highest-chunk) row alongside the
  // index — a book can have saved progress in more than one language, and
  // "Continue reading" must resend the reader to the language that
  // progress actually belongs to, not always the book's source language
  // or the device's generic language preference. See BookCard's
  // progressLanguage prop and the featured-card Link below.
  const progressByBook = useMemo(() => {
    const map = new Map<string, { lastChunkIndex: number; language: string }>();
    for (const p of progressQuery.data ?? []) {
      const prev = map.get(p.book_id);
      if (!prev || p.last_chunk_index > prev.lastChunkIndex) {
        map.set(p.book_id, { lastChunkIndex: p.last_chunk_index, language: p.language });
      }
    }
    return map;
  }, [progressQuery.data]);

  const authors = useMemo(() => [...new Set(books.map((b) => b.author))].sort(), [books]);
  const genresInUse = useMemo(
    () => [...new Set(books.map((b) => b.genre).filter(Boolean) as string[])],
    [books],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) {
      for (const c of b.categories ?? []) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    return counts;
  }, [books]);
  const configuredCategories = Array.isArray(settingsQuery.data?.["categories"])
    ? (settingsQuery.data?.["categories"] as string[])
    : [];
  const categoriesInUse = useMemo(() => {
    const names = new Set([...configuredCategories, ...categoryCounts.keys()]);
    return [...names].sort((a, b) => {
      if (a === "Religious") return -1;
      if (b === "Religious") return 1;
      return a.localeCompare(b);
    });
  }, [configuredCategories, categoryCounts]);

  const shelfIds = (kind: string) =>
    new Set(shelves.filter((s) => s.shelf === kind).map((s) => s.book_id));

  const tabBooks = useMemo(() => {
    switch (tab) {
      case "continue":
        return books.filter(
          (b) =>
            progressByBook.has(b.id) &&
            (progressByBook.get(b.id)?.lastChunkIndex ?? 0) + 1 < b.total_chunks,
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

  const hasActiveFilters = Boolean(query.trim() || lang || genre || author || category);

  const filtered = tabBooks.filter((b) => {
    // Search matches title or author only — the exact contract this box
    // promises ("Search by title, author…" below). Genre/category are
    // separate, explicit filter facets, not folded into free-text search.
    const matchesQuery = matchesBookSearch(b, query);
    const matchesLang = !lang || b.available_languages.includes(lang);
    const matchesGenre = !genre || b.genre === genre;
    const matchesAuthor = !author || b.author === author;
    const matchesCategory = !category || (b.categories ?? []).includes(category);
    return matchesQuery && matchesLang && matchesGenre && matchesAuthor && matchesCategory;
  });

  const isEmptyShelf = tabBooks.length === 0 && !hasActiveFilters;
  const isNoSearchMatch = filtered.length === 0 && !isEmptyShelf;

  const featured: Book | undefined = books.find((b) => b.id === FEATURED_BOOK_ID) ?? books[0];
  const featuredIsSample = featured ? SAMPLE_EXCERPT_BOOK_IDS.has(featured.id) : false;
  const featuredIsDemo = featured ? DEMO_MANUSCRIPT_BOOK_IDS.has(featured.id) : false;
  const pagesRead = [...progressByBook.values()].reduce((a, p) => a + p.lastChunkIndex + 1, 0);
  const counts: Record<TabKey, number> = {
    all: books.length,
    continue: books.filter(
      (b) =>
        progressByBook.has(b.id) &&
        (progressByBook.get(b.id)?.lastChunkIndex ?? 0) + 1 < b.total_chunks,
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
              {isDemo ? (
                <>
                  Reading as a guest —{" "}
                  <Link
                    to="/auth"
                    search={{ redirect: "/library" }}
                    className="font-semibold text-primary hover:underline"
                  >
                    sign in to sync across devices
                  </Link>
                </>
              ) : (
                `Welcome back, ${displayName}`
              )}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Your library
            </h1>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-2.5 card-shadow">
            <p className="text-xs text-muted-foreground">Pages read</p>
            <p className="font-display text-lg font-semibold text-foreground">{pagesRead}</p>
          </div>
        </div>

        {featured && tab === "all" && !hasActiveFilters && (
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
                  Featured
                  {featuredIsSample ? " · Sample chapters" : featuredIsDemo ? " · Demo" : ""}
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
                  {featured.title}
                </h2>
                <p className="mt-1 text-sm opacity-80">{featured.author}</p>
                <p className="mt-4 max-w-xl leading-relaxed opacity-90">{featured.description}</p>
                {featuredIsSample && (
                  <p className="mt-2 max-w-xl text-xs opacity-75">
                    This edition includes the opening {featured.total_chunks}{" "}
                    {featured.total_chunks === 1 ? "page" : "pages"} only — not the complete work.
                  </p>
                )}
                <Link
                  to="/read/$bookId"
                  params={{ bookId: featured.id }}
                  search={{ lang: progressByBook.get(featured.id)?.language ?? featured.source_language }}
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
                onClick={() => updateSearch({ tab: key === "all" ? undefined : key })}
                aria-pressed={tab === key}
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

        <div className="mt-6 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => updateSearch({ q: e.target.value || undefined })}
              placeholder="Search by title or author…"
              aria-label="Search the library by title or author"
              className="w-full rounded-2xl border-2 border-primary/25 bg-card py-4 pl-12 pr-12 text-base text-foreground card-shadow-lg outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
            />
            {query && (
              <button
                onClick={() => updateSearch({ q: undefined })}
                aria-label="Clear search"
                className="absolute right-4 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Language"
              value={lang}
              options={[...LANGUAGES]}
              onChange={(v) => updateSearch({ lang: v ?? undefined })}
            />
            <Select
              label="Author"
              value={author}
              options={authors}
              onChange={(v) => updateSearch({ author: v ?? undefined })}
            />
            <Select
              label="Topic"
              value={genre}
              options={genresInUse.length ? genresInUse : [...GENRES]}
              onChange={(v) => updateSearch({ genre: v ?? undefined })}
            />
            <Select
              label="Category"
              allLabel="All categories"
              value={category}
              options={categoriesInUse}
              onChange={(v) => updateSearch({ category: v ?? undefined })}
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={() =>
                updateSearch({
                  q: undefined,
                  lang: undefined,
                  genre: undefined,
                  author: undefined,
                  category: undefined,
                })
              }
              className="self-start text-xs font-semibold text-primary hover:underline"
            >
              Reset all filters
            </button>
          )}
        </div>

        {categoriesInUse.length > 0 && tab === "all" && !hasActiveFilters && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Browse by category
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {categoriesInUse.map((c) => (
                <button
                  key={c}
                  onClick={() => updateSearch({ category: c })}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
                >
                  {c}
                  {c === "Religious" && (
                    <span className="ml-1 text-primary">· always free</span>
                  )}
                  <span className="text-muted-foreground">({categoryCounts.get(c) ?? 0})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-semibold text-foreground">
              {TABS.find((t) => t.key === tab)?.label}
            </h2>
            {!booksQuery.isLoading && (
              <p className="text-sm text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "book" : "books"}
              </p>
            )}
          </div>
          {booksQuery.isLoading ? (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-secondary" />
              ))}
            </div>
          ) : filtered.length === 0 && isEmptyShelf ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center card-shadow">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 font-display text-lg font-semibold text-foreground">
                Nothing on this shelf yet
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Tap the heart, bookmark or plus on any book cover to build your own shelves — or
                start reading to fill your history.
              </p>
              <button
                onClick={() => updateSearch({ tab: undefined })}
                className="mt-5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                Browse all books
              </button>
            </div>
          ) : filtered.length === 0 && isNoSearchMatch ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center card-shadow">
              <Search className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 font-display text-lg font-semibold text-foreground">
                {query.trim() ? `No results for "${query.trim()}"` : "No books match these filters"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Try a different search term, or clear your filters to see everything on this shelf.
              </p>
              <button
                onClick={() =>
                  updateSearch({
                    q: undefined,
                    lang: undefined,
                    genre: undefined,
                    author: undefined,
                    category: undefined,
                  })
                }
                className="mt-5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                Clear search & filters
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((b) => (
                <BookCard
                  key={b.id}
                  book={b}
                  progress={progressByBook.get(b.id)?.lastChunkIndex ?? null}
                  preferredLanguage={lang}
                  progressLanguage={progressByBook.get(b.id)?.language ?? null}
                  monetizationEnabled={monetizationEnabled}
                />
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
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  /** Text for the blank/"any value" option, e.g. "All categories". Naive
   * `${label.toLowerCase()}s` pluralization breaks on words like
   * "Category" -> "categorys" — pass this explicitly for any label whose
   * plural isn't just "+s". */
  allLabel?: string;
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
        <option value="">{allLabel ?? `All ${label.toLowerCase()}s`}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
