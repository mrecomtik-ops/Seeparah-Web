import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { listBooks } from "@/lib/library";
import { isReligiousBook, type Book } from "@/lib/data";
import { safeJsonLd } from "@/lib/seo";
import { sacredCoverAlt, sacredCoverSrc } from "@/lib/sacred-cover-artwork";

export const Route = createFileRoute("/sacred-texts/")({
  loader: async () => {
    const books = await listBooks();
    return { books: books.filter(isReligiousBook) };
  },
  head: () => ({
    meta: [
      { title: "Sacred Texts — Verified Sources & Translations | Seeparah" },
      {
        name: "description",
        content:
          "Read selected sacred-text editions with visible provenance, canonical references and verified sourced translations. Seeparah does not generate scripture translations.",
      },
      { property: "og:title", content: "Sacred Texts on Seeparah" },
      {
        property: "og:description",
        content:
          "A partial, source-aware collection of published sacred-text editions and verified existing translations.",
      },
    ],
    links: [{ rel: "canonical", href: "https://seeparah.com/sacred-texts" }],
  }),
  component: SacredTextsPage,
});

const TRADITION_ORDER = ["Islam", "Christianity", "Judaism", "Buddhism", "Hinduism"];

function traditionFor(book: Book): string {
  return (
    (book.categories ?? []).find((category) => category !== "Religious") ||
    "Other traditions"
  );
}

function SacredTextsPage() {
  const { books } = Route.useLoaderData();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return books;
    return books.filter((book) =>
      [
        book.title,
        book.author,
        book.edition_title,
        book.publisher,
        book.source_language,
        ...(book.available_languages ?? []),
        ...(book.categories ?? []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(q)),
    );
  }, [books, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Book[]>();
    for (const book of filtered) {
      const tradition = traditionFor(book);
      groups.set(tradition, [...(groups.get(tradition) ?? []), book]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      const ai = TRADITION_ORDER.indexOf(a);
      const bi = TRADITION_ORDER.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      return a.localeCompare(b);
    });
  }, [filtered]);

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Sacred Texts on Seeparah",
    url: "https://seeparah.com/sacred-texts",
    description:
      "A partial, source-aware collection of published sacred-text editions and verified existing translations.",
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        <section className="overflow-hidden rounded-3xl border border-primary/20 bg-primary text-primary-foreground card-shadow-lg">
          <div className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Sacred Texts
              </p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
                Read the text. See the source.
              </h1>
              <p className="mt-4 max-w-2xl leading-relaxed opacity-90">
                Seeparah publishes selected source-reviewed editions with their canonical reference
                structure and exact edition identity. This collection is intentionally partial: it
                is not presented as every scripture, canon, recension or translation of every
                religion.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
                  Original source identified
                </span>
                <span className="rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold">
                  Existing translations only
                </span>
                <span className="rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold">
                  Canonical references preserved
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5">
              <ShieldCheck className="h-6 w-6 text-accent" />
              <h2 className="mt-3 font-display text-xl font-semibold">Source policy</h2>
              <p className="mt-2 text-sm leading-relaxed opacity-90">
                Sacred scripture never enters Seeparah&apos;s AI translation or automatic
                rewriting pipeline. A language appears here only when a reviewed source edition is
                actually available.
              </p>
              <Link
                to="/insights/$slug"
                params={{ slug: "why-source-provenance-matters-for-sacred-texts" }}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
              >
                Why provenance matters <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Published source editions
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Only editions whose source, structure and reuse review passed are readable. Acquired
                editions with unresolved rights or unresolved lossless structure remain unpublished.
              </p>
            </div>
            <span className="text-sm text-muted-foreground">
              {books.length} {books.length === 1 ? "reader title" : "reader titles"}
            </span>
          </div>

          <label className="relative mt-5 block max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search published sacred texts</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, tradition, language or edition…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {books.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-border bg-card p-10 text-center card-shadow">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <h3 className="mt-3 font-display text-xl font-semibold text-foreground">
                Verified source editions are being prepared
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Nothing appears here until source, structure and reuse conditions have been reviewed.
              </p>
            </div>
          ) : grouped.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">No published sacred text matches that search.</p>
          ) : (
            <div className="mt-8 space-y-10">
              {grouped.map(([tradition, traditionBooks]) => (
                <section key={tradition} aria-labelledby={`tradition-${tradition.replace(/\s+/g, "-").toLowerCase()}`}>
                  <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
                    <h3
                      id={`tradition-${tradition.replace(/\s+/g, "-").toLowerCase()}`}
                      className="font-display text-2xl font-semibold text-foreground"
                    >
                      {tradition}
                    </h3>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {traditionBooks.length} {traditionBooks.length === 1 ? "title" : "titles"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {traditionBooks.map((book) => (
                      <article key={book.id} className="rounded-2xl border border-border bg-card p-4 card-shadow sm:p-5">
                        <div className="flex gap-4">
                          <div className="w-[88px] shrink-0 sm:w-[104px]">
                            {book.cover_url ? (
                              <img
                                src={sacredCoverSrc(book) ?? undefined}
                                alt={sacredCoverAlt(book)}
                                width={800}
                                height={1200}
                                loading="lazy"
                                decoding="async"
                                className="aspect-[2/3] w-full rounded-lg border border-border/70 bg-card object-contain shadow-sm"
                              />
                            ) : (
                              <div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg border border-dashed border-border bg-secondary/60">
                                <BookOpen className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                                  {book.source_language} source
                                </p>
                                <h4 className="mt-1 font-display text-xl font-semibold text-foreground" dir="auto">
                                  {book.title}
                                </h4>
                                <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                                  {book.edition_title || book.publisher || book.author}
                                </p>
                              </div>
                              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                            </div>

                            <dl className="mt-4 grid gap-3 text-sm lg:grid-cols-2">
                              <div>
                                <dt className="text-xs text-muted-foreground">Languages available</dt>
                                <dd className="font-semibold text-foreground">
                                  {[book.source_language, ...book.available_languages.filter((l) => l !== book.source_language)].join(", ")}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted-foreground">Source / publisher</dt>
                                <dd className="font-semibold text-foreground" dir="auto">
                                  {book.publisher || book.attribution || "Source recorded"}
                                </dd>
                              </div>
                            </dl>

                            <div className="mt-5 flex flex-wrap gap-2">
                              <Link
                                to="/sacred-texts/$bookId"
                                params={{ bookId: book.id }}
                                className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground sm:px-4 sm:text-sm"
                              >
                                Explore references
                              </Link>
                              <Link
                                to="/read/$bookId"
                                params={{ bookId: book.id }}
                                search={{ lang: book.source_language, page: 1 }}
                                className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary sm:px-4 sm:text-sm"
                              >
                                Read source
                              </Link>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            [
              "1. Verify the source",
              "The exact source edition, attribution, source revision and reuse conditions are recorded before publication.",
            ],
            [
              "2. Preserve structure",
              "References follow the terminology and numbering of the sourced edition rather than forcing every tradition into one generic scheme.",
            ],
            [
              "3. Keep editions distinct",
              "Translations, commentaries, footnotes and scans keep their own source identity and are never silently merged into scripture text.",
            ],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <Search className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-display text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
