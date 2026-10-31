import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  BookOpenText,
  Feather,
  Globe2,
  Languages,
  ShieldCheck,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listBooks } from "@/lib/library";
import { pickFeaturedBook } from "@/lib/featured";
import { useAuth } from "@/lib/use-auth";
import logoUrl from "@/assets/seeparah-logo.png";
import { coverFor } from "@/lib/covers";
import { isSharedSacredCollectionCover } from "@/lib/sacred-cover-artwork";
import { SacredWorkIdentity } from "@/components/SacredWorkIdentity";
import { isReligiousBook } from "@/lib/data";
import { INSIGHT_ARTICLES } from "@/lib/insights";
import { formatAuthorName } from "@/lib/author-name";
import { displayTitleCase } from "@/lib/display-text";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Seeparah — Read world classics in your language" },
      {
        name: "description",
        content:
          "Read world classics, new authors and source-aware Sacred Texts in multiple languages. Editions are reviewed before publishing, with progress and highlights saved across your reading.",
      },
      { property: "og:title", content: "Seeparah — Read world classics in your language" },
      {
        property: "og:description",
        content:
          "A multilingual editorial reading platform for reviewed editions, Sacred Texts with visible source provenance, and literature research.",
      },
    ],
  }),
  component: LandingPage,
});

// Exported (in addition to being wired as the route's component below) so
// it can be rendered directly in tests without a full router harness.
export function LandingPage() {
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const { isDemo, loading: authLoading, displayName } = useAuth();
  const booksQuery = useQuery({ queryKey: ["books"], queryFn: listBooks });
  const featured = pickFeaturedBook(booksQuery.data ?? []);
  const featuredCover = featured ? coverFor(featured.id, featured.cover_url) : null;
  const sacredCount = (booksQuery.data ?? []).filter(isReligiousBook).length;
  const classicShelf = (booksQuery.data ?? [])
    .filter((book) => !isReligiousBook(book) && Boolean(coverFor(book.id, book.cover_url)))
    .slice(0, 6);
  const languageShelf = ["English", "Urdu", "Hindi", "Arabic", "Hebrew", "Greek", "Chinese", "Pali"]
    .map((name) => ({
      name,
      count: (booksQuery.data ?? []).filter(
        (book) => book.source_language === name || book.available_languages.includes(name),
      ).length,
    }))
    .filter(({ count }) => count > 0);
  const latestInsights = INSIGHT_ARTICLES.slice(0, 3);

  async function signInWithGoogle() {
    setGoogleBusy(true);
    setGoogleError(null);
    // Native Supabase OAuth (see src/routes/auth.tsx for the full
    // explanation of why the previous Lovable-broker call 404'd on this
    // standalone production deployment). This redirects the browser itself;
    // there is no further navigation to do here on success.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        // See src/routes/auth.tsx's handleGoogle for why: forces Google's
        // account chooser instead of silently reusing the last session.
        // Not login_hint — that pins a specific account, not a picker.
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setGoogleError("Google sign-in didn't complete. You can still use demo mode below.");
      setGoogleBusy(false);
    }
  }

  return (
    <div className="min-h-screen paper-texture">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col overflow-x-clip px-4 sm:px-6">
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
          <nav
            className="hidden items-center gap-5 text-sm font-semibold text-muted-foreground md:flex"
            aria-label="Primary"
          >
            <Link to="/library" className="hover:text-foreground">
              Library
            </Link>
            <Link to="/sacred-texts" className="hover:text-foreground">
              Sacred Texts
            </Link>
            <Link to="/insights" className="hover:text-foreground">
              Insights
            </Link>
          </nav>
          {authLoading ? (
            <div
              className="h-[38px] w-[150px] animate-pulse rounded-full bg-secondary"
              aria-hidden="true"
            />
          ) : isDemo ? (
            <button
              onClick={signInWithGoogle}
              disabled={googleBusy}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground card-shadow transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <Globe2 className="h-4 w-4 text-primary" />
              {googleBusy ? "Opening Google…" : "Sign in with Google"}
            </button>
          ) : (
            <Link
              to="/profile"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground card-shadow transition-colors hover:bg-secondary"
            >
              <User className="h-4 w-4 text-primary" />
              {displayName}
            </Link>
          )}
        </header>
        {googleError && (
          <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {googleError}
          </p>
        )}

        <main className="flex-1">
          <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                <Languages className="h-3.5 w-3.5" />
                Reviewed editions · source-aware reading
              </p>
              <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
                Every great book,
                <br />
                <span className="italic text-primary">in your own words.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Seeparah is a reading room for literature, research and Sacred Texts. We prioritize
                reviewed English and Urdu editions where rights and source material allow, support
                additional sourced or requested editions, and keep the identity of every edition
                visible to the reader.
              </p>

              <form method="get" action="/library" role="search" className="mt-7 flex max-w-xl flex-col gap-2 sm:flex-row" aria-label="Find a book">
                <label htmlFor="home-book-search" className="sr-only">Search books by title or author</label>
                <input
                  id="home-book-search"
                  name="q"
                  type="search"
                  placeholder="Search Qur’an, Bible, Gita, novels…"
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-card px-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground"
                />
                <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
                  Find a book <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/library"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground card-shadow hover:bg-secondary"
                >
                  <BookOpen className="h-4 w-4" /> Browse library
                </Link>
                <Link
                  to="/sacred-texts"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground card-shadow hover:bg-secondary"
                >
                  <ShieldCheck className="h-4 w-4 text-primary" /> Explore Sacred Texts
                </Link>
                <Link
                  to="/author"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-primary hover:bg-accent"
                >
                  <Feather className="h-4 w-4" /> Publish as an author
                </Link>
              </div>

              <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-6">
                {[
                  ["Sourced", "edition provenance visible"],
                  ["Reviewed", "before publishing"],
                  ["Saved", "progress & highlights"],
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
                  {isSharedSacredCollectionCover(featured) ? (
                    <div className="aspect-[2/3] w-full">
                      <SacredWorkIdentity book={featured} language={featured.source_language} />
                    </div>
                  ) : featuredCover && (
                    <img
                      src={featuredCover}
                      alt={`Cover of ${displayTitleCase(featured.title)}`}
                      className="aspect-[2/3] w-full object-cover"
                      width={832}
                      height={1248}
                    />
                  )}
                  <div className="border-t border-border bg-card p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gold">
                      Featured edition
                    </p>
                    <p className="mt-1 font-display text-lg font-semibold text-foreground">
                      {displayTitleCase(featured.title)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatAuthorName(featured.author)} · reviewed reading edition
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
          </section>

          {classicShelf.length > 0 && (
            <section className="border-t border-border py-12" aria-labelledby="home-classics-title">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">From the library</p>
                  <h2 id="home-classics-title" className="mt-1 font-display text-3xl font-semibold text-foreground">Start with a classic</h2>
                </div>
                <Link to="/library" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  See all books <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-6 grid auto-cols-[minmax(145px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-3 sm:auto-cols-auto sm:grid-cols-3 lg:grid-cols-6">
                {classicShelf.map((book) => (
                  <Link key={book.id} to="/book/$bookId" params={{ bookId: book.id }}
                    className="group min-w-0 rounded-2xl border border-border bg-card p-2 card-shadow transition hover:-translate-y-0.5 hover:border-primary/50">
                    <img src={coverFor(book.id, book.cover_url) ?? undefined}
                      alt={"Cover of " + displayTitleCase(book.title)} width={320} height={480}
                      loading="lazy" decoding="async" className="aspect-[2/3] w-full rounded-xl bg-secondary object-contain" />
                    <p className="mt-2 line-clamp-2 font-display text-sm font-semibold leading-snug text-foreground">{displayTitleCase(book.title)}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{formatAuthorName(book.author)}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {languageShelf.length > 0 && (
            <section className="border-t border-border py-10" aria-labelledby="home-languages-title">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Browse by language</p>
                <h2 id="home-languages-title" className="mt-1 font-display text-3xl font-semibold text-foreground">Read in your language</h2>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {languageShelf.map(({ name, count }) => (
                  <Link key={name} to="/library" search={{ lang: name }}
                    className="flex min-h-24 flex-col justify-center rounded-xl border border-border bg-card px-3 py-3 text-center transition hover:border-primary/50 hover:bg-accent">
                    <span className="font-display text-base font-semibold text-foreground">{name}</span>
                    <span className="mt-1 text-xs text-muted-foreground">{count} {count === 1 ? "title" : "titles"}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="border-t border-border py-12">
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-3xl bg-primary p-7 text-primary-foreground card-shadow-lg sm:p-8">
                <div className="flex items-center gap-2 text-accent">
                  <ShieldCheck className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Sacred Texts
                  </span>
                </div>
                <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold">
                  Read the text. See the authentic source.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-90">
                  Religious books have a separate source-preserving experience: canonical
                  references, original-source provenance and established translated editions stay
                  visible together. Seeparah never generates scripture translations with AI.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    to="/sacred-texts"
                    className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
                  >
                    Explore Sacred Texts
                  </Link>
                  <span className="text-xs opacity-75">
                    {sacredCount > 0
                      ? `${sacredCount} source-reviewed ${sacredCount === 1 ? "text" : "texts"} published`
                      : "Source-reviewed texts are being prepared"}
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-card p-7 card-shadow">
                <BookOpenText className="h-6 w-6 text-primary" />
                <h2 className="mt-3 font-display text-2xl font-semibold text-foreground">
                  Insights for better reading
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Guides on editions, translations, multilingual reading, literature research and
                  source provenance.
                </p>
                <Link
                  to="/insights"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Browse all Insights <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>

          <section className="border-t border-border py-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Latest Insights
                </p>
                <h2 className="mt-1 font-display text-3xl font-semibold text-foreground">
                  Read with more context
                </h2>
              </div>
              <Link to="/insights" className="text-sm font-semibold text-primary hover:underline">
                View all articles
              </Link>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {latestInsights.map((article) => (
                <Link
                  key={article.slug}
                  to="/insights/$slug"
                  params={{ slug: article.slug }}
                  className="group rounded-2xl border border-border bg-card p-5 card-shadow transition hover:-translate-y-0.5"
                >
                  <p className="text-xs font-semibold text-primary">{article.category}</p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-foreground">
                    {article.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {article.excerpt}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    Read article
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </main>

        <footer className="border-t border-border py-7 text-center text-xs text-muted-foreground">
          <p>Seeparah — literature, research and source-aware multilingual reading.</p>
          <nav
            aria-label="Homepage footer"
            className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
          >
            <Link to="/library" className="hover:text-foreground hover:underline">
              Library
            </Link>
            <Link to="/sacred-texts" className="hover:text-foreground hover:underline">
              Sacred Texts
            </Link>
            <Link to="/insights" className="hover:text-foreground hover:underline">
              Insights
            </Link>
            <Link to="/research" className="hover:text-foreground hover:underline">
              Research
            </Link>
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
              Support
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}