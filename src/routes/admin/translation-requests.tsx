import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import {
  adminListTranslationRequests,
  adminApproveTranslationRequest,
  adminDeclineTranslationRequest,
  adminRevokeTranslationAccess,
  adminBulkApproveTranslationRequests,
} from "@/lib/admin/translation-access.functions";

export const Route = createFileRoute("/admin/translation-requests")({
  component: AdminTranslationRequests,
});

const STATUSES = ["", "requested", "approved_awaiting_edition", "granted", "declined", "revoked"];

function AdminTranslationRequests() {
  const [status, setStatus] = useState("requested");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ["admin-translation-requests", status],
    queryFn: async () =>
      adminListTranslationRequests({
        data: {
          accessToken: await getAccessToken(),
          status: status || undefined,
          page: 1,
          perPage: 50,
        },
      }),
  });

  async function refresh() {
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ["admin-translation-requests"] });
  }

  async function approve(requestId: string) {
    setBusy(true);
    try {
      const result = await adminApproveTranslationRequest({
        data: { accessToken: await getAccessToken(), requestId },
      });
      toast.success(
        result.status === "granted"
          ? "Granted immediately (edition already reviewed)"
          : "Approved — production queued",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't approve");
    } finally {
      setBusy(false);
    }
  }

  async function decline(requestId: string) {
    const reason = window.prompt("Reason for declining (shown to the reader):");
    if (!reason) return;
    setBusy(true);
    try {
      await adminDeclineTranslationRequest({
        data: { accessToken: await getAccessToken(), requestId, reason },
      });
      toast.success("Declined");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't decline");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(requestId: string) {
    const reason = window.prompt("Reason for revoking access:");
    if (!reason) return;
    setBusy(true);
    try {
      await adminRevokeTranslationAccess({
        data: { accessToken: await getAccessToken(), requestId, reason },
      });
      toast.success("Revoked");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't revoke");
    } finally {
      setBusy(false);
    }
  }

  async function bulkApprove() {
    if (selected.size === 0) return;
    if (!window.confirm(`Approve ${selected.size} request(s)?`)) return;
    setBusy(true);
    try {
      const results = await adminBulkApproveTranslationRequests({
        data: { accessToken: await getAccessToken(), requestIds: [...selected] },
      });
      toast.success(`${results.filter((r) => r.ok).length}/${results.length} approved`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk approve failed");
    } finally {
      setBusy(false);
    }
  }

  const rows = (requestsQuery.data?.requests ?? []) as unknown as Array<{
    id: string;
    language: string;
    status: string;
    requester_id: string;
    created_at: string;
    books: { title: string; author: string; source_language: string };
  }>;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Translation requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Approving grants immediately if a reviewed edition exists already; otherwise it queues (or
        reuses) exactly one production job and grants this reader once that edition is reviewed and
        published.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            {s || "All"}
          </button>
        ))}
        {status === "requested" && (
          <button
            onClick={bulkApprove}
            disabled={busy || selected.size === 0}
            className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            Approve selected ({selected.size})
          </button>
        )}
      </div>

      {requestsQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {status === "requested" && <th className="px-3 py-2"></th>}
                <th className="px-4 py-2">Book</th>
                <th className="px-4 py-2">Language</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Requested</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  {status === "requested" && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                  )}
                  <td className="px-4 py-2">{r.books?.title ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{r.language}</td>
                  <td className="px-4 py-2 text-xs">{r.status}</td>
                  <td className="px-4 py-2 text-xs">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1.5">
                      {["requested", "approved_awaiting_edition"].includes(r.status) && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => approve(r.id)}
                            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => decline(r.id)}
                            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {r.status === "granted" && (
                        <button
                          disabled={busy}
                          onClick={() => revoke(r.id)}
                          className="rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-secondary disabled:opacity-60"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No requests here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
