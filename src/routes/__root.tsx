import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { AppHeader } from "@/components/AppHeader";
import { AdminSessionSync } from "@/lib/admin/use-admin-session";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-7xl font-semibold text-primary">404</p>
        <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
          This page has wandered off the shelf
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/library"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Browse the library
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    // Was forwarded to Lovable's in-editor error panel
    // (`window.__lovableEvents`), which never exists outside Lovable's own
    // iframe and was already a silent no-op on the real site. Plain
    // console.error is the honest replacement until a real error-monitoring
    // sink (e.g. Sentry) is wired up — see docs/lovable-final-handoff.md §5.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back
          to the library.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/library"
            className="inline-flex items-center justify-center rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go to library
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Seeparah — Read world classics in your language" },
        {
          name: "description",
          content:
            "Seeparah is a multilingual reading platform: world classics and new authors, translated page by page with AI, with reading progress and highlights saved as you go.",
        },
        { property: "og:title", content: "Seeparah — Read world classics in your language" },
        {
          property: "og:description",
          content:
            "A warm, editorial reading platform. Read classics and new voices in English, Urdu, Hindi, Arabic, French and more.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/png", href: "/favicon.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          // One combined request (same Google Fonts origin already
          // preconnected above) — Noto Nastaliq Urdu only downloads on
          // pages that actually render it, since font-display:swap defers
          // the fetch until matching text is painted.
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Outfit:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400..700&display=swap",
        },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = pathname === "/" || pathname.startsWith("/read");

  return (
    <QueryClientProvider client={queryClient}>
      {/* Exactly one admin-session auth-event listener for the whole app
          — see useAdminSessionAuthSync()'s comment in use-admin-session.ts
          for why this must not be duplicated per useAdminSession()
          consumer. Mounted unconditionally (not gated by `bare`) since the
          admin-whoami cache needs to stay correct even while browsing a
          bare page, before ever navigating to an admin route. */}
      <AdminSessionSync />
      {!bare && <AppHeader />}
      <Outlet />
      {!bare && (
        <footer className="border-t border-border py-4 pb-20 text-center text-xs text-muted-foreground sm:pb-4">
          <Link to="/legal" hash="privacy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          <span className="px-2">·</span>
          <Link to="/legal" hash="terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
          <span className="px-2">·</span>
          <Link to="/legal" hash="copyright" className="hover:text-foreground hover:underline">
            Copyright
          </Link>
          <span className="px-2">·</span>
          <Link to="/legal" hash="support" className="hover:text-foreground hover:underline">
            Support
          </Link>
        </footer>
      )}
      <Toaster richColors position="bottom-center" />
    </QueryClientProvider>
  );
}
