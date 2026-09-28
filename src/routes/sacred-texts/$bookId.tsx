import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { ArrowLeft, BookOpen, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { getBook } from "@/lib/library";
import { isReligiousBook } from "@/lib/data";
import { getPublicBookEditions } from "@/lib/translation.functions";
import { getSacredTextReferenceIndex } from "@/lib/scripture.functions";

export const Route = createFileRoute("/sacred-texts/$bookId")({
  loader: async ({ params }) => {
    if (!z.string().uuid().safeParse(params.bookId).success) throw notFound();
    const book = await getBook(params.bookId);
    if (!book || !isReligiousBook(book)) throw notFound();
    return { book };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.book
          ? `${loaderData.book.title} — Sacred Text References | Seeparah`
          : "Sacred Text References | Seeparah",
      },
      {
        name: "description",
        content:
          "Explore canonical references, original-source provenance and verified sourced translations for this Sacred Text on Seeparah.",
      },
    ],
    links: loaderData?.book
      ? [
          {
            rel: "canonical",
            href: `https://seeparah.com/sacred-texts/${loaderData.book.id}`,
          },
        ]
      : [],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <BookOpen className="h-9 w-9 text-muted-foreground/50" />
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Sacred Text not available
      </h1>
      <Link to="/sacred-texts" className="text-sm font-semibold text-primary hover:underline">
        Back to Sacred Texts
      </Link>
    </div>
  ),
  component: SacredTextDetail,
});

function SacredTextDetail() {
  const { book } = Route.useLoaderData();
  const [language, setLanguage] = useState(book.source_language);
  const [referenceQuery, setReferenceQuery] = useState("");

  const referenceIndexQuery = useQuery({
    queryKey: ["sacred-reference-index", book.id, language],
    queryFn: () =>
      getSacredTextReferenceIndex({ data: { bookId: book.id, language } }),
  });
  const editionsQuery = useQuery({
    queryKey: ["public-book-editions", book.id],
    queryFn: () => getPublicBookEditions({ data: { bookId: book.id } }),
  });

  const references = referenceIndexQuery.data?.references ?? [];
  const filteredReferences = useMemo(() => {
    const q = referenceQuery.trim().toLocaleLowerCase();
    if (!q) return references.slice(0, 80);
    return references
      .filter((reference) =>
        [reference.canonicalRef, reference.label, reference.title, ...reference.path.map((p) => p.value)]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(q)),
      )
      .slice(0, 80);
  }, [references, referenceQuery]);

  const sourceLabel =
    book.attribution || book.edition_title || book.publisher || book.source_edition_id || "Recorded source";
  const translatedEditions = editionsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        <Link
          to="/sacred-texts"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Sacred Texts
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Sacred Text reference reader
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-foreground">{book.title}</h1>
            <p className="mt-2 text-muted-foreground">{book.author}</p>

            <div className="mt-6 rounded-2xl border border-primary/20 bg-card p-5 card-shadow">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="font-display text-lg font-semibold text-foreground">
                    Authentic source used by Seeparah
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    This is the provenance record for the original text shown on Seeparah. Rights
                    evidence used internally for publication review is kept separate from this
                    reader-facing source record.
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Source / authority</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">{sourceLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source edition / identifier</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {book.source_edition_id || book.source_scan_id || "Recorded in edition metadata"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Original language</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">{book.source_language}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Edition</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {book.edition_title || "Source edition"}
                    {book.edition_year ? ` · ${book.edition_year}` : ""}
                  </dd>
                </div>
              </dl>
              {book.authenticity_notes && (
                <p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-xs leading-relaxed text-secondary-foreground">
                  <strong>Authenticity / text notes:</strong> {book.authenticity_notes}
                </p>
              )}
              {book.source_url && (
                <a
                  href={book.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  View the authentic source record <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    Find a canonical reference
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Reference labels come from the sourced text itself. A Quran edition can use
                    Surah/Ayah, a Bible edition Book/Chapter/Verse, a Gita edition Chapter/Shloka,
                    and other scriptures can preserve their own authentic reference terminology.
                  </p>
                </div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Edition language
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    className="ml-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    {[book.source_language, ...book.available_languages.filter((l) => l !== book.source_language)].map(
                      (item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <label className="relative mt-5 block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={referenceQuery}
                  onChange={(event) => setReferenceQuery(event.target.value)}
                  placeholder="Enter a reference, chapter, verse, ayah, shloka, hymn…"
                  className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              {referenceIndexQuery.isLoading ? (
                <p className="mt-5 text-sm text-muted-foreground">Loading reference index…</p>
              ) : references.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-border bg-background p-6 text-center">
                  <p className="font-semibold text-foreground">Reference index not imported yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The text can only expose canonical references after the source structure has
                    been imported and reviewed. Seeparah does not invent chapter or verse
                    boundaries when the source data is missing.
                  </p>
                </div>
              ) : filteredReferences.length === 0 ? (
                <p className="mt-5 text-sm text-muted-foreground">No reference matches that search.</p>
              ) : (
                <div className="mt-5 max-h-[520px] divide-y divide-border overflow-y-auto rounded-xl border border-border">
                  {filteredReferences.map((reference) => (
                    <div
                      key={reference.nodeKey}
                      className="flex flex-col gap-3 bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{reference.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {reference.path.length > 0
                            ? reference.path.map((part) => `${part.label} ${part.value}`).join(" · ")
                            : `${reference.kind} · ${reference.canonicalRef}`}
                        </p>
                      </div>
                      <Link
                        to="/read/$bookId"
                        params={{ bookId: book.id }}
                        search={{ lang: language, page: reference.startChunkIndex + 1 }}
                        className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                      >
                        Open in context
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <h2 className="font-display text-lg font-semibold text-foreground">
                Available verified editions
              </h2>
              <div className="mt-3 rounded-xl bg-accent/50 p-3 text-sm">
                <p className="font-semibold text-foreground">{book.source_language} · original source</p>
                <p className="mt-1 text-xs text-muted-foreground">{sourceLabel}</p>
              </div>
              {translatedEditions.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No sourced translated editions are published yet.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {translatedEditions.map((edition) => (
                    <div key={edition.language} className="rounded-xl border border-border p-3">
                      <p className="text-sm font-semibold text-foreground">
                        {edition.language} translation
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {edition.editionTitle || "Verified sourced edition"}
                        {edition.translator ? ` · ${edition.translator}` : ""}
                      </p>
                      {edition.sourceUrl && (
                        <a
                          href={edition.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          Translation source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-secondary/60 p-5 text-sm leading-relaxed text-secondary-foreground">
              <strong className="text-foreground">Translation rule</strong>
              <p className="mt-2">
                Religious scripture is never sent through Seeparah&apos;s AI translation pipeline.
                Additional languages are added only from reviewed existing translations with their
                source and translator or organization identified.
              </p>
            </section>

            <Link
              to="/book/$bookId"
              params={{ bookId: book.id }}
              className="block rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-semibold text-foreground hover:bg-secondary"
            >
              Full edition details
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}
