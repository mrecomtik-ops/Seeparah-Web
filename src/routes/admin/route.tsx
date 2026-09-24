import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth, signOut } from "@/lib/use-auth";
import { useAdminSession, can, AdminSessionProvider } from "@/lib/admin/use-admin-session";
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
import { AdminQueryError } from "@/components/admin/AdminQueryError";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Seeparah" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

const NAV: { to: string; label: string; capability?: Parameters<typeof can>[1] }[] = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/users", label: "Users", capability: "users.read" },
  { to: "/admin/books", label: "Catalog", capability: "catalog.read_unpublished" },
  { to: "/admin/research", label: "Literature Research", capability: "research.read_unpublished" },
  {
    to: "/admin/translation-requests",
    label: "Translation requests",
    capability: "translation.requests.decide",
  },
  { to: "/admin/support", label: "Support", capability: "support.tickets.read_all" },
  { to: "/admin/settings", label: "Content settings", capability: "settings.manage" },
  { to: "/admin/health", label: "Health", capability: "health.read" },
  { to: "/admin/audit", label: "Audit log", capability: "audit.read" },
  { to: "/admin/roles", label: "Admin roles", capability: "roles.manage" },
];

function AdminLayout() {
  const { loading: authLoading, isDemo } = useAuth();
  const sessionQuery = useAdminSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // A failed adminWhoAmI query must never look like "still loading" —
  // data stays undefined forever on a query stuck in an error state, so
  // the old `data === undefined` check alone spun forever on any failure
  // (a missing/misconfigured server-side env var was the incident that
  // surfaced this: the server function itself returned 200 at the
  // transport layer, so there was nothing for the browser console to
  // complain about, but the query still resolved to an error, not data).
  // Checked before the data-presence gate below so an error is never
  // mistaken for "just hasn't resolved yet".
  if (sessionQuery.isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <AdminQueryError
          message="Couldn't verify admin access. This is usually temporary — try again."
          onRetry={() => sessionQuery.refetch()}
        />
        <button
          onClick={async () => {
            await signOut();
            toast.success("Signed out.");
            navigate({ to: "/auth", search: { redirect: pathname } });
          }}
          className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
        >
          Sign out and sign in again
        </button>
      </div>
    );
  }

  // Gates on data presence, not isLoading/isPending: React Query v5 keeps
  // isPending (and therefore isLoading) false throughout a BACKGROUND
  // refetch of already-successful data — status/fetchStatus are
  // deliberately decoupled for exactly this reason — so a plain
  // staleTime-triggered or invalidateQueries-triggered refetch was
  // already safe under the old check too. What data === undefined adds
  // is intent that survives a reset directly: after a genuine identity
  // change (queryClient.resetQueries in useAdminSessionAuthSync), data
  // really is cleared back to undefined, so this still correctly shows
  // the spinner then — but it says so without relying on inferring that
  // fact through isPending/isFetching's combination.
  if (sessionQuery.data === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const session = sessionQuery.data;

  if (isDemo || !session?.signedIn) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-display text-lg font-semibold text-foreground">Sign in required</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The admin area needs a signed-in account with an admin role.
        </p>
        <Link
          to="/auth"
          search={{ redirect: pathname }}
          className="mt-5 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!session.role) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-display text-lg font-semibold text-foreground">No admin access</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This account doesn't hold an admin role. Ask an existing owner to grant one, or see
          docs/admin-operator-guide.md for first-owner setup.
        </p>
      </div>
    );
  }

  if (!session.mfaSatisfied) {
    return <AdminMfaGate onSatisfied={() => sessionQuery.refetch()} />;
  }

  const visibleNav = NAV.filter((item) => !item.capability || can(session, item.capability));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Admin · {session.role}
          </p>
          <nav className="mt-2 flex flex-row flex-wrap gap-1 lg:flex-col">
            {visibleNav.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-secondary"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          {/* Every child admin route reads this same, already-resolved
              session via useResolvedAdminSession() instead of mounting
              its own useAdminSession() query observer. */}
          <AdminSessionProvider session={session}>
            <Outlet />
          </AdminSessionProvider>
        </main>
      </div>
    </div>
  );
}
