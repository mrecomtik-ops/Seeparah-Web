import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { ArrowLeft, BookOpen, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { getBook } from "@/lib/library";
import { isReligiousBook } from "@/lib/data";
import { getPublicBookEditions } from "@/lib/translation.functions";
import { getSacredTextReferenceIndex } from "@/lib/scripture.functions";
import { isSharedSacredCollectionCover, sacredCoverAlt, sacredCoverSrc } from "@/lib/sacred-cover-artwork";
import { SacredWorkIdentity } from "@/components/SacredWorkIdentity";

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
          "Explore canonical references, exact source provenance, edition metadata and verified sourced translations for this sacred text on Seeparah.",
      },
    ],
    links: loaderData?.book
      ? [{ rel: "canonical", href: `https://seeparah.com/sacred-texts/${loaderData.book.id}` }]
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
    queryFn: () => getSacredTextReferenceIndex({ data: { bookId: book.id, language } }),
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
        [
          reference.canonicalRef,
          reference.label,
          reference.title,
          ...reference.path.flatMap((p) => [p.label, p.value]),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(q)),
      )
      .slice(0, 80);
  }, [references, referenceQuery]);

  const editions = editionsQuery.data ?? [];
  const selectedEdition = editions.find((edition) => edition.language === language);
  const selectedIsSource =
    language === book.source_language || selectedEdition?.provenanceType === "source_text";
  const sourceLabel =
    selectedEdition?.editionTitle ||
    (selectedIsSource
      ? book.attribution || book.edition_title || book.publisher || book.source_edition_id
      : null) ||
    "Recorded sourced edition";
  const selectedSourceUrl =
    selectedEdition?.sourceUrl ?? (selectedIsSource ? book.source_url : null);
  const selectedReuseNotice =
    selectedEdition?.reuseNotice ?? (selectedIsSource ? book.reuse_notice : null);
  const selectedSourceEditionId =
    selectedEdition?.sourceEditionId ??
    (selectedIsSource ? book.source_edition_id || book.source_scan_id : null);
  const selectedPublisher =
    selectedEdition?.publisher ?? (selectedIsSource ? book.publisher : null);
  const selectedEditor =
    selectedEdition?.editor ?? (selectedIsSource ? book.editor : null);
  const selectedTranslator =
    selectedEdition?.translator ?? (selectedIsSource ? book.translator : null);
  const selectedVersion =
    selectedEdition?.versionLabel ?? (selectedIsSource ? book.source_revision : null);
  const selectedAuthenticityNotes =
    selectedEdition?.authenticityNotes ?? (selectedIsSource ? book.authenticity_notes : null);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        <Link
          to="/sacred-texts"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Sacred Texts
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Sacred Text reference reader
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-foreground" dir="auto">
              {book.title}
            </h1>
            <p className="mt-2 text-muted-foreground" dir="auto">{book.author}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                to="/read/$bookId"
                params={{ bookId: book.id }}
                search={{ lang: language }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Read {language}
              </Link>
              <p className="text-sm text-muted-foreground">Read the verified edition in the selected language.</p>
            </div>

            <div className="mt-6 rounded-2xl border border-primary/20 bg-card p-5 card-shadow">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="font-display text-lg font-semibold text-foreground">
                    Exact source edition
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Reader text is tied to a named source edition and source revision. Translation,
                    commentary and footnote material stays separate from the scripture text.
                  </p>
                </div>
              </div>

              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Source / authority</dt>
                  <dd className="mt-0.5 font-semibold text-foreground" dir="auto">{sourceLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source edition / identifier</dt>
                  <dd className="mt-0.5 font-semibold text-foreground" dir="auto">
                    {selectedSourceEditionId || "Recorded in edition metadata"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source language</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">{language}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Publisher / editor</dt>
                  <dd className="mt-0.5 font-semibold text-foreground" dir="auto">
                    {[selectedPublisher, selectedEditor].filter(Boolean).join(" · ") || "Recorded source"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Edition</dt>
                  <dd className="mt-0.5 font-semibold text-foreground" dir="auto">
                    {selectedEdition?.editionTitle || (selectedIsSource ? book.edition_title : null) || "Sourced edition"}
                    {selectedIsSource && book.edition_year ? ` · ${book.edition_year}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source revision</dt>
                  <dd className="mt-0.5 font-semibold text-foreground" dir="auto">
                    {selectedVersion || "Recorded with source files"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Translator</dt>
                  <dd className="mt-0.5 font-semibold text-foreground" dir="auto">
                    {selectedTranslator || (selectedIsSource ? "Source text" : "Recorded sourced translation")}
                  </dd>
                </div>
              </dl>

              {selectedAuthenticityNotes && (
                <p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-xs leading-relaxed text-secondary-foreground" dir="auto">
                  <strong>Text / edition notes:</strong> {selectedAuthenticityNotes}
                </p>
              )}

              {selectedReuseNotice && (
                <div className="mt-4 rounded-xl border border-border bg-background px-3 py-3 text-xs leading-relaxed text-muted-foreground" dir="auto">
                  <strong className="text-foreground">Reuse notice:</strong> {selectedReuseNotice}
                </div>
              )}

              {selectedSourceUrl && (
                <a
                  href={selectedSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  View selected edition source <ExternalLink className="h-3.5 w-3.5" />
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
                    Reference labels preserve the sourced edition&apos;s terminology: for example
                    Surah/Ayah, Book/Chapter/Verse, or the source&apos;s own section system.
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
                      (item) => <option key={item} value={item}>{item}</option>,
                    )}
                  </select>
                </label>
              </div>

              <label className="relative mt-5 block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <span className="sr-only">Find a canonical reference</span>
                <input
                  value={referenceQuery}
                  onChange={(event) => setReferenceQuery(event.target.value)}
                  placeholder="Enter a chapter, verse, ayah, hymn or section…"
                  className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              {referenceIndexQuery.isLoading ? (
                <p className="mt-5 text-sm text-muted-foreground">Loading reference index…</p>
              ) : references.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-border bg-background p-6 text-center">
                  <p className="font-semibold text-foreground">Reference index not imported yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Seeparah does not invent chapter or verse boundaries when the source data is missing.
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
                      <div className="min-w-0" dir="auto">
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
                        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
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
            {isSharedSacredCollectionCover(book) ? (
              <figure className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl border border-border bg-card p-2 card-shadow">
                <div className="aspect-[2/3] w-full overflow-hidden rounded-xl">
                  <SacredWorkIdentity book={book} language={language} />
                </div>
                <figcaption className="px-2 py-2 text-center text-xs leading-relaxed text-muted-foreground">
                  Individual-work title panel. The shared collection artwork is shown on the Sacred Texts overview.
                </figcaption>
              </figure>
            ) : sacredCoverSrc(book, language) ? (
              <figure className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl border border-border bg-card p-2 card-shadow">
                <img
                  src={sacredCoverSrc(book, language) ?? undefined}
                  alt={sacredCoverAlt(book, language)}
                  width={800}
                  height={1200}
                  decoding="async"
                  className="aspect-[2/3] w-full rounded-xl bg-card object-contain"
                />
              </figure>
            ) : (
              <div className="mx-auto flex aspect-[2/3] w-full max-w-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/40 p-6 text-center">
                <BookOpen className="h-9 w-9 text-primary/50" aria-hidden="true" />
                <strong className="font-display text-xl text-foreground" dir="auto">{book.title}</strong>
                <span className="text-xs text-muted-foreground">No dedicated cover for this edition</span>
              </div>
            )}

            <section className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <h2 className="font-display text-lg font-semibold text-foreground">
                Available verified editions
              </h2>
              {editionsQuery.isLoading ? (
                <p className="mt-3 text-sm text-muted-foreground">Loading editions…</p>
              ) : editions.length === 0 ? (
                <div className="mt-3 rounded-xl bg-accent/50 p-3 text-sm">
                  <p className="font-semibold text-foreground">
                    {book.source_language} · source edition
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="auto">{sourceLabel}</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {editions.map((edition) => {
                    const sourceEdition =
                      edition.language === book.source_language || edition.provenanceType === "source_text";
                    return (
                      <div key={edition.language} className="rounded-xl border border-border p-3">
                        <p className="text-sm font-semibold text-foreground">
                          {edition.language} · {sourceEdition ? "source text" : "published translation"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                          {edition.editionTitle || "Verified sourced edition"}
                          {edition.versionLabel ? ` · ${edition.versionLabel}` : ""}
                        </p>
                        {(edition.translator || edition.editor || edition.publisher) && (
                          <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                            {edition.translator ? `Translator: ${edition.translator}` : ""}
                            {edition.translator && (edition.editor || edition.publisher) ? " · " : ""}
                            {edition.editor ? `Editor: ${edition.editor}` : ""}
                            {edition.editor && edition.publisher ? " · " : ""}
                            {edition.publisher || ""}
                          </p>
                        )}
                        {edition.reuseNotice && (
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground" dir="auto">
                            <strong className="text-foreground">Reuse:</strong> {edition.reuseNotice}
                          </p>
                        )}
                        {edition.sourceUrl && (
                          <a
                            href={edition.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            {sourceEdition ? "Source record" : "Translation source"}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-secondary/60 p-5 text-sm leading-relaxed text-secondary-foreground">
              <strong className="text-foreground">No generated scripture translations</strong>
              <p className="mt-2">
                Sacred texts are excluded from Seeparah&apos;s AI translation and automatic rewriting
                pipeline. Additional languages are added only from reviewed existing editions.
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
