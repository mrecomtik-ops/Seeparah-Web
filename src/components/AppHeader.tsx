import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Feather, LineChart, User } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

const NAV = [
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/author", label: "Author Studio", icon: Feather },
  { to: "/subscribe", label: "Plans", icon: LineChart },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src={logoAsset.url}
            alt="Seeparah logo"
            className="h-9 w-9 rounded-xl"
            width={36}
            height={36}
          />
          <span className="font-display text-xl font-semibold tracking-tight text-foreground">
            Seeparah
          </span>
        </Link>
        <nav className="flex items-center gap-1">
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
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
