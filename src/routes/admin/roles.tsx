import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminListRoles, adminGrantRole, adminRevokeRole } from "@/lib/admin/roles.functions";
import type { AdminRole } from "@/lib/admin/permissions";

export const Route = createFileRoute("/admin/roles")({
  component: AdminRolesPage,
});

const ROLES: AdminRole[] = ["owner", "administrator", "editor", "support"];

function AdminRolesPage() {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => adminListRoles({ data: { accessToken: await getAccessToken() } }),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
  }

  async function grant() {
    if (!userId.trim()) return;
    const reason = window.prompt(`Reason for granting "${role}" to this account:`);
    if (!reason) return;
    setBusy(true);
    try {
      await adminGrantRole({
        data: { accessToken: await getAccessToken(), userId: userId.trim(), role, reason },
      });
      toast.success(`Granted ${role}`);
      setUserId("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't grant this role");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(targetUserId: string) {
    const reason = window.prompt("Reason for revoking this admin's role:");
    if (!reason) return;
    if (!window.confirm("Revoke this account's admin role?")) return;
    setBusy(true);
    try {
      await adminRevokeRole({
        data: { accessToken: await getAccessToken(), userId: targetUserId, reason },
      });
      toast.success("Revoked");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't revoke this role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl font-semibold text-foreground">Admin roles</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Owner-only. Grants require the target account to already exist (they must have signed in at
        least once). The last active owner can never be revoked.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Target user id (UUID)"
          className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          onClick={grant}
          disabled={busy}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          Grant
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Look up a user's id on the Users page (search by email, the id is shown per row).
      </p>

      {rolesQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {(rolesQuery.data ?? []).map((r) => (
            <div
              key={r.user_id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span className="font-mono text-xs">{r.user_id}</span>
              <span className="font-semibold">{r.role}</span>
              <button
                disabled={busy}
                onClick={() => revoke(r.user_id)}
                className="rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-secondary disabled:opacity-60"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
