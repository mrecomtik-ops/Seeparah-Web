import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminListTickets } from "@/lib/admin/support.functions";

export const Route = createFileRoute("/admin/support/")({
  component: AdminSupportList,
});

const STATUSES = ["", "open", "pending", "resolved", "closed"];

function statusLabel(value: string) {
  return value ? value[0]!.toUpperCase() + value.slice(1) : "All";
}

const REQUEST_KIND_LABEL: Record<string, string> = {
  ticket: "General request",
  platform_suggestion: "Platform suggestion",
  technical_issue: "Technical issue",
  copyright_notice: "Copyright notice",
  copyright_counter_notice: "Copyright counter-notice",
};

function AdminSupportList() {
  const [status, setStatus] = useState("open");
  const [category, setCategory] = useState<"" | "technical_issue" | "platform_suggestion">("");
  const ticketsQuery = useQuery({
    queryKey: ["admin-tickets", status, category],
    queryFn: async () =>
      adminListTickets({
        data: {
          accessToken: await getAccessToken(),
          status: status || undefined,
          category: category || undefined,
          page: 1,
          perPage: 50,
        },
      }),
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Support tickets</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Reader support, account issues and copyright workflows. Legal notices stay visibly
        distinct from ordinary support requests.
      </p>
      <div role="group" aria-label="Filter support request types" className="mt-4 flex flex-wrap gap-2">
        {([
          { value: "" as const, label: "All requests" },
          { value: "technical_issue" as const, label: "Technical issues" },
          { value: "platform_suggestion" as const, label: "Suggestions" },
        ]).map((option) => (
          <button key={option.value || "all"} type="button" aria-pressed={category === option.value}
            onClick={() => setCategory(option.value)}
            className={"min-h-10 rounded-full border px-3 text-xs font-semibold " +
              (category === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground")}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            {statusLabel(s)}
          </button>
        ))}
      </div>

      {ticketsQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {(ticketsQuery.data?.tickets ?? []).map((t) => (
            <Link
              key={t.id}
              to="/admin/support/$ticketId"
              params={{ ticketId: t.id }}
              className="block rounded-2xl border border-border bg-card p-4 card-shadow hover:bg-secondary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground">{t.subject}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {(t.request_kind !== "ticket" || t.category === "technical_issue" || t.category === "platform_suggestion") && (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">
                      {t.category === "platform_suggestion" ? "Suggestion" : t.category === "technical_issue" ? "Platform issue" : REQUEST_KIND_LABEL[t.request_kind] ?? t.request_kind}
                    </span>
                  )}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                    {t.severity}
                  </span>
                </div>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{t.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.reference_code && <span className="font-mono">{t.reference_code}</span>}
                {t.reference_code && " · "}
                {t.category} · {t.is_anonymous ? "anonymous report" : "signed-in user"} ·{" "}
                <span className="font-semibold text-foreground">{statusLabel(t.status)}</span>
                {" · "}
                opened {new Date(t.created_at).toLocaleDateString()}
                {t.updated_at && t.updated_at !== t.created_at
                  ? ` · updated ${new Date(t.updated_at).toLocaleDateString()}`
                  : ""}
                {t.notification_status === "failed" && (
                  <span className="ml-1 font-semibold text-destructive">
                    · notification failed
                  </span>
                )}
              </p>
            </Link>
          ))}
          {(ticketsQuery.data?.tickets.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <p className="font-display text-lg font-semibold text-foreground">
                No {status ? statusLabel(status).toLowerCase() : ""} tickets
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                New support and rights notices will appear here automatically.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
