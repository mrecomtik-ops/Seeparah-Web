import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminGetHealthSnapshot } from "@/lib/admin/health.functions";
import { adminListCatalog } from "@/lib/admin/catalog.functions";

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
  const cards = [
    { label: "Published books", value: publishedQuery.data?.total ?? "—" },
    { label: "Awaiting review", value: draftsQuery.data?.total ?? "—" },
    { label: "Pending rights review", value: h.pendingRightsReview },
    { label: "Pending edition review", value: h.pendingEditionReview },
    { label: "Open translation requests", value: h.pendingTranslationRequests },
    { label: "Open support tickets", value: h.openSupportTickets },
    { label: "Stalled translation jobs", value: h.stalledJobs.length },
    { label: "Failed translation jobs", value: h.failedJobs.length },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gemini:{" "}
        {h.geminiConfigured
          ? "configured"
          : "not configured — translation jobs will fail until GEMINI_API_KEY is set"}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4 card-shadow">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

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
