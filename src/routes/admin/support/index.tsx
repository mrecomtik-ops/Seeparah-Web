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

const REQUEST_KIND_LABEL: Record<string, string> = {
  ticket: "General request",
  copyright_notice: "Copyright notice",
  copyright_counter_notice: "Copyright counter-notice",
};

function AdminSupportList() {
  const [status, setStatus] = useState("open");
  const ticketsQuery = useQuery({
    queryKey: ["admin-tickets", status],
    queryFn: async () =>
      adminListTickets({
        data: {
          accessToken: await getAccessToken(),
          status: status || undefined,
          page: 1,
          perPage: 50,
        },
      }),
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Support tickets</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            {s || "All"}
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
                  {t.request_kind !== "ticket" && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {REQUEST_KIND_LABEL[t.request_kind] ?? t.request_kind}
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
                {t.category} · {t.is_anonymous ? "anonymous report" : "signed-in user"} · {t.status}
                {t.notification_status === "failed" && (
                  <span className="ml-1 font-semibold text-destructive">
                    · notification failed
                  </span>
                )}
              </p>
            </Link>
          ))}
          {(ticketsQuery.data?.tickets.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No tickets here.</p>
          )}
        </div>
      )}
    </div>
  );
}
