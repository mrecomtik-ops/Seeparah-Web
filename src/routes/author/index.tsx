import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookUp2, Feather, Languages, LineChart, Loader2, Users } from "lucide-react";
import {
  LANGUAGES,
  TRANSLATION_EXPLAINER,
  TRANSLATION_EXPLAINER_SHORT,
  STANDARD_TRANSLATION_LANGUAGES,
  REQUESTABLE_TRANSLATION_LANGUAGES,
} from "@/lib/data";
import { listMyBooks } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";
import { coverFor } from "@/lib/covers";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
  unpublished: "Unpublished",
  archived: "Archived",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-secondary text-secondary-foreground",
  in_review: "bg-gold/20 text-gold",
  changes_requested: "bg-gold/20 text-gold",
  approved: "bg-accent text-accent-foreground",
  published: "bg-accent text-accent-foreground",
  rejected: "bg-destructive/10 text-destructive",
  unpublished: "bg-destructive/10 text-destructive",
  archived: "bg-secondary text-secondary-foreground",
};

export const Route = createFileRoute("/author/")({
  head: () => ({
    meta: [
      { title: "Author Studio — Seeparah" },
      {
        name: "description",
        content:
          "Publish your manuscript, free during launch, and follow your readers once it's reviewed and published.",
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
  // Real editions that actually exist, not "languages this book doesn't
  // have yet" — that would imply every missing language is in progress,
  // which is only true for English/Urdu on an approved book, and never
  // true for Hindi/Arabic unless a reader has requested and it's been
  // approved. Don't compute a number we can't stand behind.
  const editionsAvailable = myBooks.reduce((sum, b) => sum + b.available_languages.length, 0);

  const submittedCount = myBooks.filter(
    (b) => b.status === "in_review" || b.status === "approved",
  ).length;
  const publishedCount = myBooks.filter((b) => b.status === "published").length;

  const stats = [
    {
      label: "Published books",
      value: publishedCount,
      icon: BookUp2,
    },
    {
      label: "Awaiting review",
      value: submittedCount,
      icon: Users,
    },
    {
      label: "Editions available to readers",
      value: editionsAvailable,
      icon: Languages,
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
              Publish a manuscript once — free to publish and free to read during launch. An
              administrator reviews rights and quality before it goes live. {TRANSLATION_EXPLAINER}
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

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 font-display text-3xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6 card-shadow">
            <p className="text-sm font-semibold text-foreground">Publishing is free right now</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Seeparah is free for readers during launch — there's no checkout, no premium locks,
              and nothing to pay out yet. Publishing, translation and hosting are free for authors
              too. Earnings and payouts will show here once subscriptions are turned back on.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 card-shadow">
            <p className="text-sm font-semibold text-foreground">Author profile</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <Feather className="h-5 w-5 text-accent-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-semibold text-foreground">
                  {myBooks[0]?.author ?? "Your pen name"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {publishedCount} published · {editionsAvailable} edition{editionsAvailable === 1 ? "" : "s"} available to readers
                </p>
              </div>
            </div>
            <Link
              to="/profile"
              className="mt-4 inline-block text-xs font-semibold text-primary hover:underline"
            >
              Edit your account details
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <p className="text-sm font-semibold text-foreground">Language editions</p>
          <p className="mt-1 text-xs text-muted-foreground">{TRANSLATION_EXPLAINER_SHORT}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STANDARD_TRANSLATION_LANGUAGES.map((l) => (
              <span
                key={l}
                className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
              >
                {l} · standard
              </span>
            ))}
            {REQUESTABLE_TRANSLATION_LANGUAGES.map((l) => (
              <span
                key={l}
                className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
              >
                {l} · on reader request
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Your manuscript's own language can be any of {LANGUAGES.length} choices when you
            publish — the badges above are the languages Seeparah currently produces additional
            editions in.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Your books</h2>
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
                Publish a manuscript in minutes — paste your text or load our sample, “The Lantern
                in the Rain”, to see the whole flow.
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
                <Link
                  key={b.id}
                  to="/author/book/$bookId"
                  params={{ bookId: b.id }}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card card-shadow transition-transform hover:-translate-y-1 hover:card-shadow-lg"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-secondary">
                    {coverFor(b.id, b.cover_url) ? (
                      <img
                        src={coverFor(b.id, b.cover_url)!}
                        alt={`Cover of ${b.title}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                        <Feather className="h-8 w-8 text-primary/50" />
                        <span className="font-display text-base font-semibold text-foreground">
                          {b.title}
                        </span>
                      </div>
                    )}
                    <span
                      className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[b.status] ?? "bg-secondary text-secondary-foreground"}`}
                    >
                      {STATUS_LABEL[b.status] ?? b.status}
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="truncate font-display text-sm font-semibold text-foreground">
                      {b.title}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-primary group-hover:underline">
                      Manage →
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
