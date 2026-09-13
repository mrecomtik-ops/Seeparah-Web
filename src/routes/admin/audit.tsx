import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminListAuditLog } from "@/lib/admin/audit.functions";

export const Route = createFileRoute("/admin/audit")({
  component: AdminAuditPage,
});

function AdminAuditPage() {
  const [entityType, setEntityType] = useState("");
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

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Audit log</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every privileged mutation, who did it, when, and why. This log cannot be edited from the UI.
      </p>

      <input
        value={entityType}
        onChange={(e) => {
          setEntityType(e.target.value);
          setPage(1);
        }}
        placeholder="Filter by entity type (e.g. book, auth_user, translation_request)…"
        className="mt-4 w-full max-w-sm rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      {auditQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {(auditQuery.data?.entries ?? []).map((e) => (
            <div key={e.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <p className="font-semibold text-foreground">
                {e.action}{" "}
                <span className="font-normal text-muted-foreground">
                  — {e.entity_type}
                  {e.entity_id ? `:${e.entity_id}` : ""}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {e.actor_role ?? "unknown role"} · {new Date(e.created_at).toLocaleString()}
                {e.reason ? ` · reason: ${e.reason}` : ""}
              </p>
            </div>
          ))}
          {(auditQuery.data?.entries.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No entries.</p>
          )}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs"
        >
          Next
        </button>
      </div>
    </div>
  );
}
