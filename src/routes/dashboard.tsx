import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Feather,
  Flame,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { listBooks, listProgress } from "@/lib/library";
import { FREE_LAUNCH_AUTHOR_TERMS, type Book } from "@/lib/data";
import { useAuth } from "@/lib/use-auth";
import { BookCard } from "@/components/BookCard";
import { useShelves } from "@/components/ShelfButtons";
import { coverFor } from "@/lib/covers";
import { currentStreak, readingDays } from "@/lib/shelves";
import { getPrefs } from "@/lib/prefs";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your reading dashboard — Seeparah" },
      {
        name: "description",
        content:
          "Pick up where you left off, follow your reading streak, hit your weekly goal and discover books chosen for you.",
      },
      { property: "og:title", content: "Your reading dashboard — Seeparah" },
      {
        property: "og:description",
        content: "Continue reading, track your streak and discover new books.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { userId, displayName, isDemo } = useAuth();
  const [streak, setStreak] = useState(0);
  const [daysThisWeek, setDaysThisWeek] = useState(0);
  const [goal, setGoal] = useState(40);

  useEffect(() => {
    setStreak(currentStreak());
    const week = new Date();
    week.setDate(week.getDate() - 6);
    const cutoff = week.toISOString().slice(0, 10);
    setDaysThisWeek(readingDays().filter((d) => d >= cutoff).length);
    setGoal(getPrefs().weeklyGoalPages);
  }, []);

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
  const progress = progressQuery.data ?? [];

  const latest = useMemo(
    () =>
      [...progress].sort((a, b) =>
        (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
      )[0],
    [progress],
  );
  const currentBook = books.find((b) => b.id === latest?.book_id);
  const pagesRead = progress.reduce((s, p) => s + p.last_chunk_index + 1, 0);
  const goalPct = Math.min(100, Math.round((pagesRead / Math.max(1, goal)) * 100));

  const wanted = new Set(
    (shelvesQuery.data ?? [])
      .filter((s) => s.shelf === "want_to_read" || s.shelf === "favorite")
      .map((s) => s.book_id),
  );
  const forYou = books.filter((b) => wanted.has(b.id));
  const startedIds = new Set(progress.map((p) => p.book_id));
  const recommended = books.filter((b) => !startedIds.has(b.id)).slice(0, 4);
  const trending = [...books]
    .sort((a, b) => b.available_languages.length - a.available_languages.length)
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        <p className="text-sm font-medium text-muted-foreground">
          {isDemo ? (
            <>
              Reading in demo mode —{" "}
              <Link to="/auth" className="font-semibold text-primary hover:underline">
                sign in to sync across devices
              </Link>
            </>
          ) : (
            `Welcome back, ${displayName}`
          )}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Your reading room
        </h1>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="overflow-hidden rounded-3xl border border-border bg-primary text-primary-foreground card-shadow-lg">
            {currentBook ? (
              <div className="grid sm:grid-cols-[160px_1fr]">
                <div className="relative hidden min-h-48 sm:block">
                  {coverFor(currentBook.id, currentBook.cover_url) && (
                    <img
                      src={coverFor(currentBook.id, currentBook.cover_url)!}
                      alt={`Cover of ${currentBook.title}`}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="p-6 sm:p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                    Continue reading
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold">
                    {currentBook.title}
                  </h2>
                  <p className="mt-1 text-sm opacity-80">
                    {currentBook.author} · {latest?.language} · page{" "}
                    {(latest?.last_chunk_index ?? 0) + 1} of {currentBook.total_chunks}
                  </p>
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-primary-foreground/20">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((((latest?.last_chunk_index ?? 0) + 1) / currentBook.total_chunks) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                  <Link
                    to="/read/$bookId"
                    params={{ bookId: currentBook.id }}
                    search={{ lang: latest?.language ?? currentBook.source_language }}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
                  >
                    Continue reading <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Start here
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold">
                  Open your first book
                </h2>
                <p className="mt-2 max-w-md text-sm opacity-90">
                  Pick any title from the library — pages arrive one at a time in
                  your language, and your place is saved automatically.
                </p>
                <Link
                  to="/library"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground"
                >
                  Start reading <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Target className="h-3.5 w-3.5 text-primary" /> Weekly reading goal
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-foreground">
                {pagesRead} / {goal} pages
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${goalPct}%` }}
                />
              </div>
              <Link
                to="/profile"
                className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
              >
                Adjust your goal
              </Link>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Flame className="h-3.5 w-3.5 text-gold" /> Daily streak
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-foreground">
                {streak} {streak === 1 ? "day" : "days"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {daysThisWeek} of the last 7 days · read a page today to keep it
                alive.
              </p>
            </div>
          </div>
        </section>

        {forYou.length > 0 && (
          <Shelf
            title="For you"
            icon={Sparkles}
            books={forYou.slice(0, 4)}
            monetizationEnabled={monetizationEnabled}
          />
        )}
        <Shelf
          title="Recommended for you"
          icon={BookOpen}
          books={recommended}
          monetizationEnabled={monetizationEnabled}
        />
        <Shelf
          title="More languages available"
          icon={TrendingUp}
          books={trending}
          monetizationEnabled={monetizationEnabled}
        />

        <section className="mt-12 flex flex-col items-start gap-4 rounded-3xl border border-border bg-card p-7 card-shadow sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Writing something of your own?
            </h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              {FREE_LAUNCH_AUTHOR_TERMS}
            </p>
          </div>
          <Link
            to="/author/publish"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            <Feather className="h-4 w-4" /> Publish a manuscript
          </Link>
        </section>
      </main>
    </div>
  );
}

function Shelf({
  title,
  icon: Icon,
  books,
  monetizationEnabled,
}: {
  title: string;
  icon: typeof BookOpen;
  books: Book[];
  monetizationEnabled: boolean;
}) {
  if (books.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
        <Icon className="h-4.5 w-4.5 text-primary" /> {title}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {books.map((b) => (
          <BookCard key={b.id} book={b} monetizationEnabled={monetizationEnabled} />
        ))}
      </div>
    </section>
  );
}
