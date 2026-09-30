import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  FlaskConical,
  Globe2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { getBook } from "@/lib/library";
import { coverFor } from "@/lib/covers";
import { getPrefs } from "@/lib/prefs";
import { formatAuthorName } from "@/lib/author-name";
import { publicBookDescription } from "@/lib/book-description";
import { safeJsonLd } from "@/lib/seo";
import { ShelfButtons } from "@/components/ShelfButtons";
import {
  SAMPLE_EXCERPT_BOOK_IDS,
  DEMO_MANUSCRIPT_BOOK_IDS,
  TRANSLATION_EXPLAINER_SHORT,
  REQUESTABLE_TRANSLATION_LANGUAGES,
  isReligiousBook,
} from "@/lib/data";
import {
  getBookTranslationLanguageStatus,
  getPublicBookEditions,
} from "@/lib/translation.functions";

export const Route = createFileRoute("/book/$bookId")({
  loader: async ({ params }) => {
    if (!z.string().uuid().safeParse(params.bookId).success) {
      throw notFound();
    }
    const book = await getBook(params.bookId);
    if (!book) throw notFound();
    return { book };
  },
  notFoundComponent: BookNotFoundPage,
  head: ({ loaderData }) => {
    const book = loaderData?.book;
    if (!book) {
      return {
        meta: [
          { title: "Book details — Seeparah" },
          { name: "description", content: "Read books and reviewed editions on Seeparah." },
        ],
      };
    }
    const author = formatAuthorName(book.author);
    const description = publicBookDescription({
      title: book.title,
      author,
      sourceLanguage: book.source_language,
      description: book.description,
    });
    const title = `${book.title} by ${author} — Seeparah`;
    const canonical = `https://seeparah.com/book/${book.id}`;
    const cover = coverFor(book.id, book.cover_url);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "book" },
        { property: "og:url", content: canonical },
        ...(cover ? [{ property: "og:image", content: cover }] : []),
        { name: "twitter:card", content: cover ? "summary_large_image" : "summary" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: BookDetailPage,
});

function BookNotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <p className="font-display text-2xl font-semibold text-foreground">
        We couldn't find that book
      </p>
      <Link to="/library" className="text-sm font-semibold text-primary hover:underline">
        Back to the library
      </Link>
    </div>
  );
}

function BookDetailPage() {
  const { bookId } = Route.useParams();
  const { book: initialBook } = Route.useLoaderData();
  const bookQuery = useQuery({
    queryKey: ["book", bookId],
    queryFn: () => getBook(bookId),
    initialData: initialBook,
  });
  const translationStatusQuery = useQuery({
    queryKey: ["translation-language-status", bookId],
    queryFn: () => getBookTranslationLanguageStatus({ data: { bookId } }),
  });
  const editionInfoQuery = useQuery({
    queryKey: ["public-book-editions", bookId],
    queryFn: () => getPublicBookEditions({ data: { bookId } }),
  });
  const book = bookQuery.data;
  const prefs = getPrefs();

  if (bookQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (bookQuery.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="font-display text-2xl font-semibold text-foreground">
          We couldn't load this book right now
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          The catalog request failed. Try again rather than treating a temporary service problem as
          a missing book.
        </p>
        <button
          type="button"
          onClick={() => void bookQuery.refetch()}
          className="min-h-11 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-95 active:scale-[0.98]"
        >
          Try again
        </button>
        <Link to="/library" className="text-sm font-semibold text-primary hover:underline">
          Back to the library
        </Link>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="font-display text-2xl font-semibold text-foreground">
          We couldn't find that book
        </p>
        <Link to="/library" className="text-sm font-semibold text-primary hover:underline">
          Back to the library
        </Link>
      </div>
    );
  }

  const readLanguage = book.available_languages.includes(prefs.language)
    ? prefs.language
    : book.source_language;
  const cover = coverFor(book.id, book.cover_url);
  const isSample = SAMPLE_EXCERPT_BOOK_IDS.has(book.id);
  const isDemoManuscript = DEMO_MANUSCRIPT_BOOK_IDS.has(book.id);
  const isReligious = isReligiousBook(book);
  const offersDistinctSample = false;
  const displayAuthor = formatAuthorName(book.author);
  const displayDescription = publicBookDescription({
    title: book.title,
    author: displayAuthor,
    sourceLanguage: book.source_language,
    description: book.description,
  });
  const schema = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    author: { "@type": "Person", name: displayAuthor },
    inLanguage: book.source_language,
    url: `https://seeparah.com/book/${book.id}`,
    description: displayDescription,
    ...(cover ? { image: cover } : {}),
    ...(book.isbn ? { isbn: book.isbn } : {}),
    ...(book.publisher ? { publisher: { "@type": "Organization", name: book.publisher } } : {}),
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6">
        <Link
          to="/library"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Library
        </Link>

        <div className="mt-6 grid gap-8 sm:grid-cols-[220px_1fr]">
          <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl border border-border bg-secondary card-shadow sm:mx-0">
            {cover ? (
              <img
                src={cover}
                alt={`Cover of ${book.title}`}
                className="aspect-[2/3] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[2/3] flex-col items-center justify-center gap-2 p-4 text-center">
                <BookOpen className="h-8 w-8 text-primary/50" />
                <span className="font-display text-lg font-semibold text-foreground">
                  {book.title}
                </span>
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
                  {book.title}
                </h1>
                {book.author_id ? (
                  <Link
                    to="/author/$authorId"
                    params={{ authorId: book.author_id }}
                    className="mt-1 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {displayAuthor}
                  </Link>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{displayAuthor}</p>
                )}
              </div>
              <ShelfButtons bookId={book.id} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                Original edition · Free
              </span>
              {isReligious && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                  Religious · Always free
                </span>
              )}
              {(isSample || isDemoManuscript) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                  <FlaskConical className="h-3 w-3" />{" "}
                  {isDemoManuscript ? "Demo manuscript" : "Sample chapters"}
                </span>
              )}
              {book.genre && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                  {book.genre}
                </span>
              )}
              {(book.categories ?? []).map((category) => (
                <span
                  key={category}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground"
                >
                  {category}
                </span>
              ))}
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                <Globe2 className="h-3 w-3" /> Original: {book.source_language}
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                {book.total_chunks} {book.total_chunks === 1 ? "page" : "pages"}
              </span>
            </div>

            <p className="mt-5 max-w-2xl leading-relaxed text-foreground">{displayDescription}</p>
            {isSample && (
              <p className="mt-2 max-w-2xl text-sm font-medium text-gold">
                This is an excerpt — {book.total_chunks}{" "}
                {book.total_chunks === 1 ? "page" : "pages"}, not the complete work.
              </p>
            )}

            <section className="mt-6 rounded-2xl border border-border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Book & edition details
              </h2>
              <dl className="mt-3 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Original language</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{book.source_language}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Original publication</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {book.original_publication_year
                      ? book.original_publication_year < 0
                        ? `${Math.abs(book.original_publication_year)} BCE`
                        : book.original_publication_year
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Edition</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {book.edition_title || "—"}
                    {book.edition_year ? ` · ${book.edition_year}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Publisher</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{book.publisher || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Length</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {book.word_count
                      ? `${book.word_count.toLocaleString()} words`
                      : `${book.total_chunks} reading ${book.total_chunks === 1 ? "section" : "sections"}`}
                    {book.estimated_reading_minutes
                      ? ` · about ${book.estimated_reading_minutes} min`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reader typography</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {book.typography_profile === "facsimile_preserving"
                      ? "Source-preserving"
                      : book.typography_profile?.replaceAll("_", " ") || "Standard"}
                  </dd>
                </div>
              </dl>
              {book.authenticity_notes && (
                <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-xs leading-relaxed text-secondary-foreground">
                  <strong>Authenticity notes:</strong> {book.authenticity_notes}
                </p>
              )}
            </section>

            {isReligious && (
              <section className="mt-4 rounded-2xl border border-primary/20 bg-accent/30 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-foreground">
                      Authentic source provenance
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      This record identifies where Seeparah sourced the original scripture text.
                      Internal rights-review evidence is kept separate from this reader-facing
                      provenance.
                    </p>
                    <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Source / authority</dt>
                        <dd className="mt-0.5 font-semibold text-foreground">
                          {book.attribution ||
                            book.publisher ||
                            book.edition_title ||
                            "Recorded source"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Source edition / identifier</dt>
                        <dd className="mt-0.5 font-semibold text-foreground">
                          {book.source_edition_id ||
                            book.source_scan_id ||
                            "Recorded in edition metadata"}
                        </dd>
                      </div>
                      {book.translator && (
                        <div>
                          <dt className="text-muted-foreground">Translator / editor</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {book.translator}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {book.source_url && (
                        <a
                          href={book.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        >
                          View authentic source <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Link
                        to="/sacred-texts/$bookId"
                        params={{ bookId: book.id }}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Browse canonical references
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Editions
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {book.available_languages.map((l) => (
                  <span
                    key={l}
                    className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                  >
                    {l} · published
                  </span>
                ))}
                {(translationStatusQuery.data ?? [])
                  .filter((s) => !book.available_languages.includes(s.language))
                  .map((s) => (
                    <span
                      key={s.language}
                      className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {s.language} · translation in progress
                    </span>
                  ))}
                {!isReligious &&
                  REQUESTABLE_TRANSLATION_LANGUAGES.filter(
                    (l) =>
                      !book.available_languages.includes(l) &&
                      l !== book.source_language &&
                      !(translationStatusQuery.data ?? []).some((s) => s.language === l),
                  ).map((l) => (
                    <span
                      key={l}
                      className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {l} · available on request
                    </span>
                  ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{TRANSLATION_EXPLAINER_SHORT}</p>
              {isReligious && (
                <p className="mt-2 rounded-lg bg-accent/50 px-3 py-2 text-xs leading-relaxed text-accent-foreground">
                  Seeparah does not generate machine translations for Religious books. Additional
                  languages are added only from verified sourced editions, with script, diacritics,
                  numbering and typography preserved as closely as the digital format allows.
                </p>
              )}
              {(editionInfoQuery.data ?? []).length > 0 && (
                <div className="mt-4 space-y-2">
                  {(editionInfoQuery.data ?? []).map((edition) => (
                    <article
                      key={edition.language}
                      className="rounded-xl border border-border bg-background px-3 py-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-foreground">{edition.language} edition</strong>
                        <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                          {edition.provenanceType === "ai_assisted"
                            ? "Reviewed AI-assisted translation"
                            : edition.provenanceType === "human_translation"
                              ? "Verified human translation"
                              : edition.provenanceType === "licensed_translation"
                                ? "Licensed translation"
                                : "Public-domain translation"}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        {edition.editionTitle && <p>Edition: {edition.editionTitle}</p>}
                        {edition.translator && <p>Translator/editor: {edition.translator}</p>}
                        {edition.sourceEditionId && (
                          <p>Source edition ID: {edition.sourceEditionId}</p>
                        )}
                        {edition.authenticityNotes && (
                          <p>Text/typography notes: {edition.authenticityNotes}</p>
                        )}
                        {edition.sourceUrl && (
                          <p>
                            <a
                              href={edition.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                            >
                              View the authentic translation source
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {offersDistinctSample && (
                <Link
                  to="/read/$bookId"
                  params={{ bookId: book.id }}
                  search={{ lang: book.source_language }}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground card-shadow hover:bg-secondary"
                >
                  Read the free opening page
                </Link>
              )}
              <Link
                to="/read/$bookId"
                params={{ bookId: book.id }}
                search={{ lang: readLanguage }}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground card-shadow transition-transform hover:-translate-y-0.5"
              >
                {isSample
                  ? `Read the sample in ${readLanguage}`
                  : `Start reading in ${readLanguage}`}
              </Link>
              {isReligious && (
                <Link
                  to="/sacred-texts/$bookId"
                  params={{ bookId: book.id }}
                  className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-card px-5 py-3 text-sm font-semibold text-primary hover:bg-accent/40"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Source & references
                </Link>
              )}
              {offersDistinctSample && (
                <Link
                  to="/subscribe"
                  search={{ book: book.id }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-gold-foreground card-shadow"
                >
                  See subscription plan
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
