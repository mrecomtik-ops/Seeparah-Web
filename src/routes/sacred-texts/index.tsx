import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { listBooks } from "@/lib/library";
import { isReligiousBook } from "@/lib/data";

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
          "Read Religious and sacred texts with visible source provenance, canonical references, original text, and verified sourced translations — never platform-generated scripture translations.",
      },
      { property: "og:title", content: "Sacred Texts on Seeparah" },
      {
        property: "og:description",
        content:
          "Source-aware scripture reading with authentic source records, canonical references and verified existing translations.",
      },
    ],
    links: [{ rel: "canonical", href: "https://seeparah.com/sacred-texts" }],
  }),
  component: SacredTextsPage,
});

function SacredTextsPage() {
  const { books } = Route.useLoaderData();
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Sacred Texts on Seeparah",
    url: "https://seeparah.com/sacred-texts",
    description:
      "A source-aware collection of published Religious texts and verified sourced translations.",
  };

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
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
                Religious books on Seeparah use a source-preserving workflow. Readers can see where
                the original text was sourced, which established translation they are reading,
                and the canonical reference that connects the original with its translations.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
                  Original source identified
                </span>
                <span className="rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold">
                  Verified existing translations only
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
                Seeparah does not generate machine translations for Religious scriptures. Every
                translated edition must come from a verified existing source and keep its source
                identity visible to the reader.
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Published Sacred Texts
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Only source-reviewed Religious editions appear here.
              </p>
            </div>
            <span className="text-sm text-muted-foreground">
              {books.length} {books.length === 1 ? "text" : "texts"}
            </span>
          </div>

          {books.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-border bg-card p-10 text-center card-shadow">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <h3 className="mt-3 font-display text-xl font-semibold text-foreground">
                Verified source editions are being prepared
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                The source collection is being assembled separately. Nothing appears here until
                the original source, reference structure and any translated edition have been
                reviewed and recorded with their provenance.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {books.map((book) => (
                <article
                  key={book.id}
                  className="rounded-2xl border border-border bg-card p-5 card-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Sacred Text
                      </p>
                      <h3 className="mt-1 font-display text-xl font-semibold text-foreground">
                        {book.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{book.author}</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Original language</dt>
                      <dd className="font-semibold text-foreground">{book.source_language}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Source</dt>
                      <dd className="font-semibold text-foreground">
                        {book.attribution || book.publisher || book.edition_title || "Source recorded"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      to="/sacred-texts/$bookId"
                      params={{ bookId: book.id }}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      Explore references
                    </Link>
                    <Link
                      to="/book/$bookId"
                      params={{ bookId: book.id }}
                      className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
                    >
                      Edition details
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            [
              "1. Verify the source",
              "The exact source link, source edition or identifier, attribution and edition notes are recorded before publication.",
            ],
            [
              "2. Preserve references",
              "Canonical references are imported with the text so readers can jump by the terminology used by that scripture.",
            ],
            [
              "3. Connect translations",
              "Verified translated editions map back to the same canonical reference while keeping translator and source provenance visible.",
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
