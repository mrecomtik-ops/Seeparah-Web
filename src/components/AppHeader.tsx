import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Feather, LayoutDashboard, LineChart, LogIn, User } from "lucide-react";
import logoUrl from "@/assets/seeparah-logo.png";
import { useAuth } from "@/lib/use-auth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/author", label: "Author", icon: Feather },
  { to: "/subscribe", label: "Plans", icon: LineChart },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isDemo } = useAuth();

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
          <nav className="hidden items-center gap-1 sm:flex">
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
          </nav>
          <div className="flex items-center gap-2">
            {isDemo && (
              <Link
                to="/auth"
                className="hidden items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary sm:inline-flex"
              >
                <LogIn className="h-3.5 w-3.5" /> Sign in
              </Link>
            )}
            <Link
              to="/library"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground sm:hidden"
            >
              Start reading
            </Link>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur sm:hidden">
        <div className="flex items-stretch justify-around">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
