import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, BookOpen, Languages, Wallet } from "lucide-react";
import { AUTHOR_PAYOUT, LANGUAGES } from "@/lib/data";
import { listMyBooks } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";

export const Route = createFileRoute("/author/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Seeparah Author Studio" },
      {
        name: "description",
        content: "Reading stats and language coverage for your books on Seeparah.",
      },
      { property: "og:title", content: "Analytics — Seeparah Author Studio" },
      { property: "og:description", content: "Reading stats for your books." },
    ],
  }),
  component: AnalyticsPage,
});

// Exported (in addition to being wired as the route's component below) so
// it can be rendered directly in tests without a full router harness.
export function AnalyticsPage() {
  const { userId } = useAuth();
  const myBooksQuery = useQuery({
    queryKey: ["my-books", userId],
    queryFn: () => listMyBooks(userId),
  });
  const myBooks = myBooksQuery.data ?? [];
  const settingsQuery = useQuery({
    queryKey: ["public-content-settings"],
    queryFn: () => getPublicContentSettings(),
  });
  const monetizationEnabled = settingsQuery.data?.["monetization_enabled"] === true;

  const totalPages = myBooks.reduce((s, b) => s + b.total_chunks, 0);
  const languageCoverage = myBooks.reduce(
    (s, b) => s + b.available_languages.length,
    0,
  );
  const monthlyRevenue = monetizationEnabled
    ? myBooks
        .filter((b) => b.access_type === "paid")
        .reduce((s, b) => s + (b.subscription_price_usd ?? 0) * 12, 0)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <p className="text-sm font-medium text-muted-foreground">Author studio</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-foreground">
          Analytics
        </h1>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Pages published", value: totalPages, icon: BookOpen },
            { label: "Language coverage", value: languageCoverage, icon: Languages },
            // No payout/revenue tile at all while there's no active paid
            // plan — not even a "Not active yet" placeholder, since that
            // still implies payouts are a current concept. Reappears only
            // once monetization is genuinely turned on.
            ...(monetizationEnabled
              ? [
                  {
                    label: "Your payout (est./mo)",
                    value: `$${(monthlyRevenue * AUTHOR_PAYOUT).toFixed(2)}`,
                    icon: Wallet,
                  },
                ]
              : []),
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 font-display text-3xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 card-shadow">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Pages read this week
          </h2>
          {/* No per-day reading-activity table exists yet to back a real
              chart here — this used to show a hardcoded, fabricated week
              of numbers regardless of whether anyone had actually read
              anything. Showing that on a fresh, honest backend would be
              actively misleading, so this is an explicit "not tracked
              yet" state instead, matching the same pattern already used
              below for "Book performance" on an author with no books. */}
          <div className="mt-4 flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
            <p>Day-by-day reading activity isn't tracked yet — nothing to show here.</p>
          </div>
        </section>

        <section className={`mt-8 grid gap-4 ${monetizationEnabled ? "lg:grid-cols-2" : ""}`}>
          <div className="rounded-2xl border border-border bg-card p-6 card-shadow">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Book performance
            </h2>
            {myBooks.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Publish your first book and its reading stats will appear here.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {myBooks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold text-foreground">
                        {b.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.total_chunks} pages · {b.available_languages.length}{" "}
                        of {LANGUAGES.length} languages
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        monetizationEnabled && b.access_type === "paid"
                          ? "bg-gold/20 text-gold-foreground"
                          : "bg-accent text-accent-foreground"
                      }`}
                    >
                      {monetizationEnabled && b.access_type === "paid"
                        ? `$${b.subscription_price_usd}/mo`
                        : "Free"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Whole revenue-summary card omitted, not degraded-with-a-
              placeholder, while there's no active paid plan — see the
              stats-tile comment above for the same reasoning. */}
          {monetizationEnabled && (
            <div className="rounded-2xl border border-border bg-card p-6 card-shadow">
              <h2 className="font-display text-lg font-semibold text-foreground">
                Revenue summary
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Gross subscriptions (est./mo)</dt>
                  <dd className="font-semibold text-foreground">${monthlyRevenue.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Your payout (70%)</dt>
                  <dd className="font-semibold text-primary">
                    ${(monthlyRevenue * AUTHOR_PAYOUT).toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Seeparah commission (30%)</dt>
                  <dd className="font-semibold text-foreground">
                    ${(monthlyRevenue * (1 - AUTHOR_PAYOUT)).toFixed(2)}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                Estimates assume twelve active subscribers per premium book.
                Payments run in Stripe test mode until launch.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
