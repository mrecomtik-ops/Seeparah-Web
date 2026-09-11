import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BookOpen, Feather, Globe2, Languages } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import logoAsset from "@/assets/logo.png.asset.json";
import { coverFor, BOOK_OF_THE_DAY_ID, DEMO_BOOK_ID } from "@/lib/covers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Seeparah — Read world classics in your language" },
      {
        name: "description",
        content:
          "Read world classics and new authors in your own language. AI-translated page by page, with your progress and highlights always saved.",
      },
      { property: "og:title", content: "Seeparah — Read world classics in your language" },
      {
        property: "og:description",
        content:
          "A warm, editorial multilingual reading platform. English, Urdu, Hindi, Arabic, French and more.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const lanternCover = coverFor(BOOK_OF_THE_DAY_ID);

  async function signInWithGoogle() {
    setGoogleBusy(true);
    setGoogleError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setGoogleError("Google sign-in didn't complete. You can still use demo mode below.");
      setGoogleBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/library" });
  }

  return (
    <div className="min-h-screen paper-texture">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <img
              src={logoAsset.url}
              alt="Seeparah logo"
              className="h-11 w-11 rounded-2xl card-shadow"
              width={44}
              height={44}
            />
            <div>
              <p className="font-display text-2xl font-semibold leading-none tracking-tight text-foreground">
                Seeparah
              </p>
              <p className="text-xs text-muted-foreground">
                Read world classics in your language
              </p>
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
              10 languages · AI-translated page by page
            </p>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
              Every great book,
              <br />
              <span className="italic text-primary">in your own words.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Seeparah is a warm home for readers and authors. Read classics and
              new voices in English, Urdu, Hindi, Pashto, Arabic, French and
              more — your progress and highlights travel with you.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/library"
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
            <Link
              to="/read/$bookId"
              params={{ bookId: DEMO_BOOK_ID }}
              search={{ lang: "English" }}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              Try the demo reader — Pride and Prejudice
              <ArrowRight className="h-4 w-4" />
            </Link>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-6">
              {[
                ["10", "languages at launch"],
                ["0", "downloads — read in flow"],
                ["70%", "of revenue to authors"],
              ].map(([stat, label]) => (
                <div key={label}>
                  <p className="font-display text-3xl font-semibold text-primary">
                    {stat}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-6 -rotate-2 rounded-3xl bg-accent/60" />
            <div className="relative rotate-1 overflow-hidden rounded-2xl border border-border bg-card card-shadow-lg">
              {lanternCover && (
                <img
                  src={lanternCover}
                  alt="Cover of The Lantern in the Rain by Amina Rahman"
                  className="aspect-[2/3] w-full object-cover"
                  width={832}
                  height={1248}
                />
              )}
              <div className="border-t border-border bg-card p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gold">
                  Book of the day
                </p>
                <p className="mt-1 font-display text-lg font-semibold text-foreground">
                  The Lantern in the Rain
                </p>
                <p className="text-sm text-muted-foreground">
                  Amina Rahman · published on Seeparah
                </p>
              </div>
            </div>
          </div>
        </main>

        <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
          Seeparah — a multilingual reading room. No full-book downloads; pages
          arrive as you read.
        </footer>
      </div>
    </div>
  );
}
