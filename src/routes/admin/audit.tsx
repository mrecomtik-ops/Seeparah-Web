import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminListAuditLog } from "@/lib/admin/audit.functions";

export const Route = createFileRoute("/admin/audit")({
  component: AdminAuditPage,
});

function humanize(value: string) {
  return value
    .replaceAll(".", " · ")
    .replaceAll("_", " ")
    .replace(/w/g, (letter) => letter.toUpperCase());
}

function actionFamily(action: string) {
  return action.split(".")[0] || "system";
}

function familyClass(family: string) {
  switch (family) {
    case "catalog":
      return "bg-primary/10 text-primary";
    case "translation":
      return "bg-accent text-accent-foreground";
    case "role":
      return "bg-gold/15 text-gold";
    case "ticket":
    case "support":
      return "bg-secondary text-secondary-foreground";
    case "user":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

function AdminAuditPage() {
  const [entityType, setEntityType] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const auditQuery = useQuery({
    queryKey: ["admin-audit", entityType, page],
    queryFn: async () =>
      adminListAuditLog({
        data: {
          accessToken: await getAccessToken(),
          entityType: entityType || undefined,
          page,
          perPage: 50,
        },
      }),
  });

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = auditQuery.data?.entries ?? [];
    if (!q) return rows;
    return rows.filter((entry) =>
      [
        entry.action,
        entry.entity_type,
        entry.entity_id,
        entry.actor_role,
        entry.actor_id,
        entry.reason,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [auditQuery.data?.entries, query]);

  const total = auditQuery.data?.total ?? 0;
  const hasNext = page * 50 < total;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Audit log</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Every privileged change, who made it, when, and why. Audit records are read-only in the
        admin workspace.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_260px]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search action, role, entity or reason…"
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <input
          value={entityType}
          onChange={(event) => {
            setEntityType(event.target.value.trim());
            setPage(1);
          }}
          placeholder="Exact entity type, e.g. book"
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {auditQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-display text-lg font-semibold text-foreground">No audit entries match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Clear the filters or move to another page of the audit history.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card card-shadow">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const family = actionFamily(entry.action);
                const hasDetails = Boolean(entry.reason || entry.before || entry.after);
                return (
                  <tr key={entry.id} className="border-b border-border align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-foreground">
                        {entry.actor_role ? humanize(entry.actor_role) : "Unknown role"}
                      </p>
                      <p className="mt-0.5 max-w-[160px] truncate font-mono text-[11px] text-muted-foreground">
                        {entry.actor_id}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${familyClass(
                          family,
                        )}`}
                      >
                        {humanize(entry.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-foreground">
                        {humanize(entry.entity_type)}
                      </p>
                      {entry.entity_id && (
                        <p className="mt-0.5 max-w-[220px] truncate font-mono text-[11px] text-muted-foreground">
                          {entry.entity_id}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {hasDetails ? (
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-primary">
                            View details
                          </summary>
                          <div className="mt-2 max-w-md space-y-2 text-xs text-muted-foreground">
                            {entry.reason && (
                              <p>
                                <strong className="text-foreground">Reason:</strong> {entry.reason}
                              </p>
                            )}
                            {entry.before && (
                              <pre className="overflow-x-auto rounded-lg bg-secondary p-2 text-[11px]">
                                {JSON.stringify(entry.before, null, 2)}
                              </pre>
                            )}
                            {entry.after && (
                              <pre className="overflow-x-auto rounded-lg bg-secondary p-2 text-[11px]">
                                {JSON.stringify(entry.after, null, 2)}
                              </pre>
                            )}
                          </div>
                        </details>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Page {page} · {total} total {total === 1 ? "entry" : "entries"}
        </p>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Previous
          </button>
          <button
            disabled={!hasNext}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
