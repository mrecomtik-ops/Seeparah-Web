import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Languages, TrendingUp, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AUTHOR_PAYOUT, LANGUAGES } from "@/lib/data";
import { listMyBooks } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/author/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Seeparah Author Studio" },
      {
        name: "description",
        content: "Reading stats, translation coverage and revenue for your books on Seeparah.",
      },
      { property: "og:title", content: "Analytics — Seeparah Author Studio" },
      { property: "og:description", content: "Reading stats and revenue for your books." },
    ],
  }),
  component: AnalyticsPage,
});

const WEEK = [
  { day: "Mon", pages: 42 },
  { day: "Tue", pages: 58 },
  { day: "Wed", pages: 51 },
  { day: "Thu", pages: 74 },
  { day: "Fri", pages: 96 },
  { day: "Sat", pages: 121 },
  { day: "Sun", pages: 88 },
];

function AnalyticsPage() {
  const { userId } = useAuth();
  const myBooksQuery = useQuery({
    queryKey: ["my-books", userId],
    queryFn: () => listMyBooks(userId),
  });
  const myBooks = myBooksQuery.data ?? [];

  const totalPages = myBooks.reduce((s, b) => s + b.total_chunks, 0);
  const languageCoverage = myBooks.reduce(
    (s, b) => s + b.available_languages.length,
    0,
  );
  const monthlyRevenue = myBooks
    .filter((b) => b.access_type === "paid")
    .reduce((s, b) => s + (b.subscription_price_usd ?? 0) * 12, 0);

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
            { label: "Pages read this week", value: WEEK.reduce((s, d) => s + d.pages, 0), icon: TrendingUp },
            {
              label: "Your payout (est./mo)",
              value: `$${(monthlyRevenue * AUTHOR_PAYOUT).toFixed(2)}`,
              icon: Wallet,
            },
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
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={WEEK}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="pages" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
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
                        b.access_type === "paid"
                          ? "bg-gold/20 text-gold-foreground"
                          : "bg-accent text-accent-foreground"
                      }`}
                    >
                      {b.access_type === "paid"
                        ? `$${b.subscription_price_usd}/mo`
                        : "Free"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
        </section>
      </main>
    </div>
  );
}
