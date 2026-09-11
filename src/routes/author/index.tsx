import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookUp2,
  Feather,
  Languages,
  LineChart,
  Loader2,
  Users,
} from "lucide-react";
import { LANGUAGES } from "@/lib/data";
import { listMyBooks } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";
import { BookCard } from "@/components/BookCard";

export const Route = createFileRoute("/author/")({
  head: () => ({
    meta: [
      { title: "Author Studio — Seeparah" },
      {
        name: "description",
        content:
          "Publish your manuscript, queue translations into ten languages, and follow your readers.",
      },
      { property: "og:title", content: "Author Studio — Seeparah" },
      {
        property: "og:description",
        content: "Publish your manuscript and follow your readers.",
      },
    ],
  }),
  component: AuthorDashboard,
});

function AuthorDashboard() {
  const { userId, isDemo } = useAuth();
  const myBooksQuery = useQuery({
    queryKey: ["my-books", userId],
    queryFn: () => listMyBooks(userId),
  });
  const myBooks = myBooksQuery.data ?? [];
  const translationsQueued = myBooks.reduce(
    (sum, b) => sum + (LANGUAGES.length - b.available_languages.length),
    0,
  );

  const stats = [
    {
      label: "Published books",
      value: myBooks.length,
      icon: BookUp2,
    },
    {
      label: "Translations queued",
      value: translationsQueued,
      icon: Languages,
    },
    {
      label: "Readers this month",
      value: myBooks.length === 0 ? 0 : 128,
      icon: Users,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {isDemo ? "Demo author studio" : "Author studio"}
            </p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-foreground">
              Where your book finds its readers
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Publish a manuscript once. Seeparah translates it page by page
              into ten languages and pays you 70% of every subscription.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/author/analytics"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground card-shadow hover:bg-secondary"
            >
              <LineChart className="h-4 w-4 text-primary" /> Analytics
            </Link>
            <Link
              to="/author/publish"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground card-shadow transition-transform hover:-translate-y-0.5"
            >
              <Feather className="h-4 w-4" /> Publish
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {stats.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-card p-5 card-shadow"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 font-display text-3xl font-semibold text-foreground">
                {value}
              </p>
            </div>
          ))}
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-card p-5 card-shadow">
          <p className="text-sm font-semibold text-foreground">
            Languages your books can reach
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <span
                key={l}
                className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
              >
                {l}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Your books
          </h2>
          {myBooksQuery.isLoading ? (
            <div className="mt-6 flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : myBooks.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center card-shadow">
              <Feather className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 font-display text-lg font-semibold text-foreground">
                Your first book starts here
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Publish a manuscript in minutes — paste your text or load our
                sample, “The Lantern in the Rain”, to see the whole flow.
              </p>
              <Link
                to="/author/publish"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                <Feather className="h-4 w-4" /> Publish a manuscript
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {myBooks.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
