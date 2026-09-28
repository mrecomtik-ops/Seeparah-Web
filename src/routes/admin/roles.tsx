import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, ShieldCheck, UserPlus } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminListRoles, adminGrantRole, adminRevokeRole } from "@/lib/admin/roles.functions";
import { searchAdminUsers } from "@/lib/admin/users.functions";
import type { AdminRole } from "@/lib/admin/permissions";

export const Route = createFileRoute("/admin/roles")({
  component: AdminRolesPage,
});

const ROLES: AdminRole[] = ["owner", "administrator", "editor", "support"];
const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Owner",
  administrator: "Administrator",
  editor: "Editor",
  support: "Support",
};
const ROLE_HELP: Record<AdminRole, string> = {
  owner: "Full control, including role management. Keep at least one active owner.",
  administrator: "Operational admin access without owner-only role control.",
  editor: "Catalog, research and translation editorial workflows.",
  support: "User and support-ticket workflows without catalog publishing.",
};

type SelectedUser = { id: string; email: string | null; displayName: string | null };

function AdminRolesPage() {
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [role, setRole] = useState<AdminRole>("support");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => adminListRoles({ data: { accessToken: await getAccessToken() } }),
  });

  const usersQuery = useQuery({
    queryKey: ["admin-role-user-search", query],
    enabled: query.trim().length >= 2,
    queryFn: async () =>
      searchAdminUsers({
        data: {
          accessToken: await getAccessToken(),
          query: query.trim(),
          page: 1,
          perPage: 8,
        },
      }),
  });

  const activeOwners = (rolesQuery.data ?? []).filter((row) => row.role === "owner").length;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
  }

  async function grant() {
    if (!selectedUser) return;
    const reason = window.prompt(
      `Reason for granting ${ROLE_LABEL[role]} to ${selectedUser.email ?? selectedUser.id}:`,
    );
    if (!reason) return;
    setBusy(true);
    try {
      await adminGrantRole({
        data: {
          accessToken: await getAccessToken(),
          userId: selectedUser.id,
          role,
          reason,
        },
      });
      toast.success(`Granted ${ROLE_LABEL[role]}`);
      setQuery("");
      setSelectedUser(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't grant this role");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(targetUserId: string, label: string) {
    const reason = window.prompt(`Reason for revoking admin access from ${label}:`);
    if (!reason) return;
    if (!window.confirm(`Revoke admin access from ${label}? This takes effect immediately for new admin requests.`))
      return;
    setBusy(true);
    try {
      await adminRevokeRole({
        data: { accessToken: await getAccessToken(), userId: targetUserId, reason },
      });
      toast.success("Admin access revoked");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't revoke this role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
          <ShieldCheck className="h-5 w-5 text-accent-foreground" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Admin roles</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Owner-only access control. Search for an existing Seeparah account, choose the minimum
            role it needs, and record a reason for every change.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-lg font-semibold text-foreground">Grant admin access</h2>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedUser(null);
            }}
            placeholder="Search by email, name or exact user id…"
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {query.trim().length >= 2 && !selectedUser && (
          <div className="mt-2 overflow-hidden rounded-xl border border-border bg-background">
            {usersQuery.isLoading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching accounts…
              </div>
            ) : (usersQuery.data?.users ?? []).length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">No matching account.</p>
            ) : (
              (usersQuery.data?.users ?? []).map((user) => (
                <button
                  type="button"
                  key={user.id}
                  onClick={() =>
                    setSelectedUser({
                      id: user.id,
                      email: user.email,
                      displayName: user.displayName,
                    })
                  }
                  className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-3 text-left last:border-0 hover:bg-secondary/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {user.displayName || user.email || "Unnamed account"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {user.email ?? user.id}
                    </span>
                  </span>
                  <UserPlus className="h-4 w-4 shrink-0 text-primary" />
                </button>
              ))
            )}
          </div>
        )}

        {selectedUser && (
          <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-semibold text-foreground">
              {selectedUser.displayName || selectedUser.email || "Selected account"}
            </p>
            <p className="text-xs text-muted-foreground">{selectedUser.email ?? selectedUser.id}</p>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AdminRole)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            >
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABEL[item]}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">{ROLE_HELP[role]}</span>
          </label>
          <button
            type="button"
            onClick={grant}
            disabled={busy || !selectedUser}
            className="self-start rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:mt-5"
          >
            Grant access
          </button>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-foreground">Active admin access</h2>
          <span className="text-xs text-muted-foreground">
            {(rolesQuery.data ?? []).length} active
          </span>
        </div>

        {rolesQuery.isLoading ? (
          <div className="mt-6 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {(rolesQuery.data ?? []).map((row) => {
              const isLastOwner = row.role === "owner" && activeOwners <= 1;
              const identity = row.email || row.display_name || row.user_id;
              return (
                <div
                  key={row.user_id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 card-shadow sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{identity}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.user_id}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                      {ROLE_LABEL[row.role as AdminRole]}
                    </span>
                    <button
                      type="button"
                      disabled={busy || isLastOwner}
                      title={isLastOwner ? "At least one active owner is required." : undefined}
                      onClick={() => revoke(row.user_id, identity)}
                      className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isLastOwner ? "Required owner" : "Revoke"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
