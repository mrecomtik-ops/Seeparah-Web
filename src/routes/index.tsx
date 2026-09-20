import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Feather, Globe2, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listBooks } from "@/lib/library";
import { pickFeaturedBook } from "@/lib/featured";
import logoUrl from "@/assets/seeparah-logo.png";
import { coverFor } from "@/lib/covers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Seeparah — Read world classics in your language" },
      {
        name: "description",
        content:
          "Read world classics and new authors. Free during launch, with your progress and highlights always saved. Editions are prepared and reviewed before publishing.",
      },
      { property: "og:title", content: "Seeparah — Read world classics in your language" },
      {
        property: "og:description",
        content: "A warm, editorial reading platform. Free during launch.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const booksQuery = useQuery({ queryKey: ["books"], queryFn: listBooks });
  const featured = pickFeaturedBook(booksQuery.data ?? []);
  const featuredCover = featured ? coverFor(featured.id, featured.cover_url) : null;

  async function signInWithGoogle() {
    setGoogleBusy(true);
    setGoogleError(null);
    // Native Supabase OAuth (see src/routes/auth.tsx for the full
    // explanation of why the previous Lovable-broker call 404'd on this
    // standalone Netlify deployment). This redirects the browser itself;
    // there is no further navigation to do here on success.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setGoogleError("Google sign-in didn't complete. You can still use demo mode below.");
      setGoogleBusy(false);
    }
  }

  return (
    <div className="min-h-screen paper-texture">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="Seeparah logo"
              className="h-11 w-11 rounded-2xl card-shadow"
              width={44}
              height={44}
            />
            <div>
              <p className="font-display text-2xl font-semibold leading-none tracking-tight text-foreground">
                Seeparah
              </p>
              <p className="text-xs text-muted-foreground">Read world classics in your language</p>
            </div>
          </div>
          <button
            onClick={signInWithGoogle}
            disabled={googleBusy}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground card-shadow transition-colors hover:bg-secondary disabled:opacity-60"
          >
            <Globe2 className="h-4 w-4 text-primary" />
            {googleBusy ? "Opening Google…" : "Sign in with Google"}
          </button>
        </header>
        {googleError && (
          <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {googleError}
          </p>
        )}

        <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              <Languages className="h-3.5 w-3.5" />
              Free during launch · reviewed editions, not live translation
            </p>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
              Every great book,
              <br />
              <span className="italic text-primary">in your own words.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Seeparah is a warm home for readers and authors. English and Urdu are our standard
              languages for every book; you can request Hindi or Arabic and an administrator will
              review it. Your progress and highlights travel with you.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground card-shadow transition-transform hover:-translate-y-0.5"
              >
                <BookOpen className="h-5 w-5" />
                Continue as Reader
              </Link>
              <Link
                to="/author"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3.5 text-base font-semibold text-foreground card-shadow transition-transform hover:-translate-y-0.5"
              >
                <Feather className="h-5 w-5 text-primary" />
                Continue as Author
              </Link>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-6">
              {[
                ["Free", "every book, during launch"],
                ["0", "downloads — read in flow"],
                ["2+2", "standard, plus requestable languages"],
              ].map(([stat, label]) => (
                <div key={label}>
                  <p className="font-display text-3xl font-semibold text-primary">{stat}</p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-6 -rotate-2 rounded-3xl bg-accent/60" />
            {booksQuery.isLoading ? (
              <div className="relative aspect-[2/3] w-full animate-pulse rounded-2xl border border-border bg-secondary card-shadow-lg" />
            ) : featured ? (
              <Link
                to="/read/$bookId"
                params={{ bookId: featured.id }}
                search={{ lang: featured.source_language }}
                className="relative block rotate-1 overflow-hidden rounded-2xl border border-border bg-card card-shadow-lg transition-transform hover:-translate-y-0.5"
              >
                {featuredCover && (
                  <img
                    src={featuredCover}
                    alt={`Cover of ${featured.title}`}
                    className="aspect-[2/3] w-full object-cover"
                    width={832}
                    height={1248}
                  />
                )}
                <div className="border-t border-border bg-card p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gold">
                    Featured · Sample chapters
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold text-foreground">
                    {featured.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {featured.author} · opening chapters, free to read
                  </p>
                </div>
              </Link>
            ) : (
              <div className="relative flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 rotate-1 rounded-2xl border border-border bg-card p-8 text-center card-shadow-lg">
                <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                <p className="font-display text-lg font-semibold text-foreground">
                  Our first reviewed editions are coming soon
                </p>
                <Link
                  to="/library"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Browse the library
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </main>

        <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
          <p>
            Seeparah — a multilingual reading room. No full-book downloads; pages arrive as you
            read.
          </p>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <Link to="/legal" hash="privacy" className="hover:text-foreground hover:underline">
              Privacy
            </Link>
            <Link to="/legal" hash="terms" className="hover:text-foreground hover:underline">
              Terms
            </Link>
            <Link to="/legal" hash="copyright" className="hover:text-foreground hover:underline">
              Copyright
            </Link>
            <Link to="/legal" hash="support" className="hover:text-foreground hover:underline">
              Support & billing help
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
