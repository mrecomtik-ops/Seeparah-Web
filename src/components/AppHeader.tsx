import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Feather,
  FileText,
  LayoutDashboard,
  LogIn,
  Menu,
  ShieldCheck,
  User,
} from "lucide-react";
import logoUrl from "@/assets/seeparah-logo.png";
import { useAuth } from "@/lib/use-auth";
import { useAdminSession } from "@/lib/admin/use-admin-session";

// No "Plans" nav entry — there's no active paid plan during the free
// launch, so featuring it as primary navigation would overstate that
// pricing is a live concern. /subscribe itself still exists and degrades
// to an honest "nothing to subscribe to yet" state; it's reached only from
// context (e.g. a paid book's own page), never top-level nav, while off.
const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/sacred-texts", label: "Sacred Texts", icon: BookOpen },
  { to: "/insights", label: "Insights", icon: FileText },
  { to: "/author", label: "Author", icon: Feather },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  const { isDemo, loading: authLoading } = useAuth();
  // Deliberately still a real useAdminSession() call here, not
  // useResolvedAdminSession() — AppHeader renders on every route, above
  // and outside AdminLayout's <Outlet /> (it's mounted by RootComponent,
  // an ANCESTOR of AdminLayout, never a descendant of it), so there is
  // no <AdminSessionProvider> in scope for most pages this renders on.
  // It needs to know whether to show the Admin nav link regardless of
  // whether the visitor is currently on an admin page at all. This is
  // safe: the shared query is cached and reset/invalidated by the one
  // global <AdminSessionSync /> listener the same as every other
  // consumer, so this doesn't reintroduce the per-mount-subscription bug
  // — it's just one more plain query observer, same as AdminLayout's own.
  const adminSession = useAdminSession();
  const isAdmin = !isDemo && !!adminSession.data?.role;
  // Role not known yet: auth still initializing, or signed in but the
  // whoami query has neither data nor an error. Reserve the Admin link's
  // slot with a placeholder instead of rendering nothing — otherwise, on
  // every hard refresh, the nav renders without "Admin" and it pops in
  // ~1–2s later, shifting the other items. A failed lookup renders
  // nothing (never a permanent skeleton, never a false Admin link).
  const adminRoleResolving =
    authLoading || (!isDemo && adminSession.data === undefined && !adminSession.isError);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={logoUrl}
              alt="Seeparah logo"
              className="h-9 w-9 rounded-xl"
              width={36}
              height={36}
            />
            <span className="font-display text-xl font-semibold tracking-tight text-foreground">
              Seeparah
            </span>
          </Link>
          {/* `relative` anchors the Admin slot below. The slot is absolutely
              positioned just past "Profile" so it takes no space in this
              centered nav: the placeholder appearing, turning into the Admin
              link, or disappearing for non-admins never moves the other
              items (the header is justify-between, so any width change here
              would shift the whole nav by half that change). */}
          <nav className="relative hidden items-center gap-1 lg:flex">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
            <div
              className="absolute left-full top-1/2 ml-1 flex -translate-y-1/2 items-center"
              data-testid="admin-nav-slot"
            >
              {!isAdmin && adminRoleResolving && (
                <div
                  className="h-9 w-[87px] animate-pulse rounded-lg bg-secondary"
                  aria-hidden="true"
                  data-testid="admin-nav-placeholder"
                />
              )}
              {isAdmin && (
                <Link
                  to="/admin"
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    pathname.startsWith("/admin")
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Admin
                </Link>
              )}
            </div>
          </nav>
          {/* Constant desktop width whether it holds the auth placeholder,
              the Sign in button, or nothing (signed in) — otherwise the
              justify-between nav re-centers when auth resolves. */}
          <div className="flex items-center justify-end gap-2 sm:min-w-[96px]">
            {authLoading ? (
              // Reserves roughly the same footprint as the "Sign in"
              // button so it doesn't jump in/out, without committing to
              // "definitely signed out" before auth has actually
              // resolved — see index.tsx's landing-page header for the
              // same established pattern.
              <div
                className="hidden h-[38px] w-[96px] animate-pulse rounded-xl bg-secondary lg:block"
                aria-hidden="true"
              />
            ) : (
              isDemo && (
                <Link
                  to="/auth"
                  search={{ redirect: href }}
                  className="hidden items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary lg:inline-flex"
                >
                  <LogIn className="h-3.5 w-3.5" /> Sign in
                </Link>
              )
            )}
            <Link
              to="/library"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground lg:hidden"
            >
              Start reading
            </Link>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden" aria-label="Mobile navigation">
        <div className="mx-auto flex max-w-lg items-stretch justify-between">
          {NAV.slice(0, 4).map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center text-[10px] font-medium leading-tight ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
          <details key={pathname} className="group relative flex min-w-0 flex-1">
            <summary
              className="flex min-h-14 w-full cursor-pointer list-none flex-col items-center justify-center gap-0.5 px-1 text-center text-[10px] font-medium text-muted-foreground group-open:text-primary"
              aria-label="More navigation"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
              More
            </summary>
            <div className="absolute bottom-full right-0 mb-2 w-[min(18rem,calc(100vw-1rem))] rounded-2xl border border-border bg-card p-2 shadow-xl">
              {NAV.slice(4).map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground hover:bg-secondary">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {label}
                </Link>
              ))}
              {isAdmin && (
                <Link to="/admin" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground hover:bg-secondary">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  Admin
                </Link>
              )}
              {!authLoading && isDemo && (
                <Link to="/auth" search={{ redirect: href }} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground hover:bg-secondary">
                  <LogIn className="h-4 w-4 text-primary" aria-hidden="true" />
                  Sign in
                </Link>
              )}
            </div>
          </details>
        </div>
      </nav>
    </>
  );
}
