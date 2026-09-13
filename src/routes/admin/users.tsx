import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { getAccessToken, useAdminSession, can } from "@/lib/admin/use-admin-session";
import {
  searchAdminUsers,
  suspendUserAccount,
  restoreUserAccount,
  sendUserRecoveryEmail,
  resendUserVerificationEmail,
  repairUserAuthorProfile,
} from "@/lib/admin/users.functions";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const sessionQuery = useAdminSession();
  const session = sessionQuery.data;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["admin-users", query, page],
    queryFn: async () =>
      searchAdminUsers({ data: { accessToken: await getAccessToken(), query, page, perPage: 20 } }),
  });

  function reason(action: string): string | null {
    const r = window.prompt(`Reason for "${action}" (required, shown in the audit log):`);
    if (!r || r.trim().length < 3) {
      toast.error("A reason of at least 3 characters is required");
      return null;
    }
    return r.trim();
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function handleSuspend(userId: string) {
    const r = reason("suspend account");
    if (!r) return;
    setBusyId(userId);
    try {
      await suspendUserAccount({
        data: { accessToken: await getAccessToken(), userId, reason: r },
      });
      toast.success("Account suspended (blocks sign-in and session refresh)");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't suspend this account");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(userId: string) {
    const r = reason("restore account");
    if (!r) return;
    setBusyId(userId);
    try {
      await restoreUserAccount({
        data: { accessToken: await getAccessToken(), userId, reason: r },
      });
      toast.success("Account restored");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't restore this account");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRecovery(userId: string, email: string | null) {
    if (!email) {
      toast.error("This account has no email on file");
      return;
    }
    const r = reason("send recovery email");
    if (!r) return;
    setBusyId(userId);
    try {
      await sendUserRecoveryEmail({
        data: {
          accessToken: await getAccessToken(),
          userId,
          email,
          reason: r,
          redirectTo: `${window.location.origin}/auth/reset-password`,
        },
      });
      toast.success(`Recovery email requested for ${email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send a recovery email");
    } finally {
      setBusyId(null);
    }
  }

  async function handleVerification(userId: string, email: string | null) {
    if (!email) {
      toast.error("This account has no email on file");
      return;
    }
    const r = reason("resend verification email");
    if (!r) return;
    setBusyId(userId);
    try {
      await resendUserVerificationEmail({
        data: { accessToken: await getAccessToken(), userId, email, reason: r },
      });
      toast.success(`Verification email requested for ${email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't resend verification");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRepair(userId: string) {
    const r = reason("repair author profile");
    if (!r) return;
    setBusyId(userId);
    try {
      const result = await repairUserAuthorProfile({
        data: { accessToken: await getAccessToken(), userId, reason: r },
      });
      toast.success(
        result.created
          ? "Author profile created"
          : "Author profile already existed — nothing to do",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't repair this profile");
    } finally {
      setBusyId(null);
    }
  }

  const canAct = can(session, "users.support_actions");

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Users</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Search is a best-effort scan (Supabase's admin API has no server-side email filter) —
        results may be incomplete for a very large user base with a partial query.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Email substring or exact user id…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Providers</th>
                <th className="px-4 py-2">Verified</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Last sign-in</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data?.users ?? []).map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{u.email ?? u.id}</td>
                  <td className="px-4 py-2 text-xs">{u.providers.join(", ") || "—"}</td>
                  <td className="px-4 py-2 text-xs">{u.emailConfirmedAt ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-xs">{u.banned ? "Suspended" : "Active"}</td>
                  <td className="px-4 py-2 text-xs">
                    {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-2">
                    {canAct && (
                      <div className="flex flex-wrap gap-1.5">
                        {u.banned ? (
                          <button
                            disabled={busyId === u.id}
                            onClick={() => handleRestore(u.id)}
                            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            disabled={busyId === u.id}
                            onClick={() => handleSuspend(u.id)}
                            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                          >
                            Suspend
                          </button>
                        )}
                        {u.hasPassword && (
                          <button
                            disabled={busyId === u.id}
                            onClick={() => handleRecovery(u.id, u.email)}
                            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                          >
                            Send recovery
                          </button>
                        )}
                        {!u.emailConfirmedAt && (
                          <button
                            disabled={busyId === u.id}
                            onClick={() => handleVerification(u.id, u.email)}
                            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                          >
                            Resend verification
                          </button>
                        )}
                        <button
                          disabled={busyId === u.id}
                          onClick={() => handleRepair(u.id)}
                          className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                        >
                          Repair author profile
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {(usersQuery.data?.users.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {usersQuery.data?.truncated && (
        <p className="mt-2 text-xs text-muted-foreground">
          Scan hit its page limit — narrow the query for complete results.
        </p>
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
