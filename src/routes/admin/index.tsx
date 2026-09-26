import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Languages, LayoutDashboard, Loader2, Settings, Users } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminGetHealthSnapshot } from "@/lib/admin/health.functions";
import { adminListCatalog } from "@/lib/admin/catalog.functions";
import { adminGetOverviewAnalytics } from "@/lib/admin/overview.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const healthQuery = useQuery({
    queryKey: ["admin-health"],
    queryFn: async () => adminGetHealthSnapshot({ data: { accessToken: await getAccessToken() } }),
  });
  const draftsQuery = useQuery({
    queryKey: ["admin-catalog-count", "in_review"],
    queryFn: async () =>
      adminListCatalog({
        data: { accessToken: await getAccessToken(), status: "in_review", page: 1, perPage: 1 },
      }),
  });
  const publishedQuery = useQuery({
    queryKey: ["admin-catalog-count", "published"],
    queryFn: async () =>
      adminListCatalog({
        data: { accessToken: await getAccessToken(), status: "published", page: 1, perPage: 1 },
      }),
  });
  const analyticsQuery = useQuery({
    queryKey: ["admin-overview-analytics"],
    queryFn: async () =>
      adminGetOverviewAnalytics({ data: { accessToken: await getAccessToken() } }),
  });

  if (healthQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (healthQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        Couldn't load the overview: {(healthQuery.error as Error).message}
      </p>
    );
  }

  const h = healthQuery.data!;
  const a = analyticsQuery.data;
  const cards = [
    { label: "Published books", value: publishedQuery.data?.total ?? a?.books.published ?? "—" },
    { label: "Religious books", value: a?.books.religious ?? "—" },
    { label: "Published translations", value: a?.books.publishedTranslations ?? "—" },
    { label: "Active readers · 7 days", value: a?.readers.active7d ?? "—" },
    { label: "Active readers · 30 days", value: a?.readers.active30d ?? "—" },
    { label: "Highlights saved", value: a?.readers.highlights ?? "—" },
    { label: "New translation requests", value: a?.translations.requested ?? h.pendingTranslationRequests },
    { label: "Awaiting translation review", value: a?.translations.awaitingReviewJobs ?? "—" },
    { label: "Failed translation jobs", value: a?.translations.failedJobs ?? h.failedJobs.length },
    { label: "Active subscriptions", value: a?.subscriptions.active ?? "—" },
    { label: "Awaiting book review", value: draftsQuery.data?.total ?? "—" },
    { label: "Open support tickets", value: h.openSupportTickets },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gemini:{" "}
        {h.geminiConfigured
          ? "API key present (provider connectivity is checked only when a translation runs)"
          : "API key missing — translation jobs cannot run until GEMINI_API_KEY is configured"}
      </p>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          { to: "/admin/books", label: "Catalog", hint: "Review, publish, categories", icon: BookOpen },
          { to: "/admin/translation-requests", label: "Translations", hint: "Approve requests & monitor jobs", icon: Languages },
          { to: "/admin/users", label: "Users", hint: "Accounts and support actions", icon: Users },
          { to: "/admin/settings", label: "Settings", hint: "Plan, categories, content rules", icon: Settings },
        ] as const).map(({ to, label, hint, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-2xl border border-border bg-card p-4 card-shadow transition hover:-translate-y-0.5 hover:border-primary/40"
          >
            <div className="flex items-center justify-between gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          </Link>
        ))}
      </section>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4 card-shadow">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      {a && (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5 card-shadow">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-semibold text-foreground">
                Translation demand
              </h2>
            </div>
            {a.translations.topDemand.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No reader translation demand yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {a.translations.topDemand.map((row) => (
                  <div key={row.language} className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{row.language}</span>
                    <span className="text-muted-foreground">{row.requests} request{row.requests === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 card-shadow">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-semibold text-foreground">
                Published categories
              </h2>
            </div>
            {a.categories.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No categorized published books yet.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {a.categories.map((row) => (
                  <span key={row.category} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
                    {row.category} · {row.books}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {h.unresolvedErrors.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Recent unresolved errors
          </h2>
          <div className="mt-3 space-y-2">
            {h.unresolvedErrors.slice(0, 5).map((e) => (
              <div key={e.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                <span className="mr-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  {e.severity}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
                <p className="mt-1 text-foreground">{e.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
