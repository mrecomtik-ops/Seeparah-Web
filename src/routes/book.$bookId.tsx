import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, FlaskConical, Globe2, Loader2 } from "lucide-react";
import { getBook } from "@/lib/library";
import { coverFor } from "@/lib/covers";
import { getPrefs } from "@/lib/prefs";
import { ShelfButtons } from "@/components/ShelfButtons";
import {
  SAMPLE_EXCERPT_BOOK_IDS,
  DEMO_MANUSCRIPT_BOOK_IDS,
  TRANSLATION_EXPLAINER_SHORT,
  REQUESTABLE_TRANSLATION_LANGUAGES,
  isReligiousBook,
} from "@/lib/data";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";
import { getBookTranslationLanguageStatus } from "@/lib/translation.functions";

export const Route = createFileRoute("/book/$bookId")({
  head: () => ({
    meta: [
      { title: "Book details — Seeparah" },
      { name: "description", content: "Everything about this book on Seeparah: languages, length, and access." },
    ],
  }),
  component: BookDetailPage,
});

function BookDetailPage() {
  const { bookId } = Route.useParams();
  const bookQuery = useQuery({ queryKey: ["book", bookId], queryFn: () => getBook(bookId) });
  const settingsQuery = useQuery({
    queryKey: ["public-content-settings"],
    queryFn: () => getPublicContentSettings(),
  });
  const translationStatusQuery = useQuery({
    queryKey: ["translation-language-status", bookId],
    queryFn: () => getBookTranslationLanguageStatus({ data: { bookId } }),
  });
  const monetizationEnabled = settingsQuery.data?.["monetization_enabled"] === true;
  const book = bookQuery.data;
  const prefs = getPrefs();

  if (bookQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="font-display text-2xl font-semibold text-foreground">We couldn't find that book</p>
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

  return (
    <div className="min-h-screen bg-background">
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
              <img src={cover} alt={`Cover of ${book.title}`} className="aspect-[2/3] w-full object-cover" />
            ) : (
              <div className="flex aspect-[2/3] flex-col items-center justify-center gap-2 p-4 text-center">
                <BookOpen className="h-8 w-8 text-primary/50" />
                <span className="font-display text-lg font-semibold text-foreground">{book.title}</span>
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
                    {book.author}
                  </Link>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{book.author}</p>
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
                  <FlaskConical className="h-3 w-3" /> {isDemoManuscript ? "Demo manuscript" : "Sample chapters"}
                </span>
              )}
              {book.genre && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                  {book.genre}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                <Globe2 className="h-3 w-3" /> Original: {book.source_language}
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                {book.total_chunks} {book.total_chunks === 1 ? "page" : "pages"}
              </span>
            </div>

            <p className="mt-5 max-w-2xl leading-relaxed text-foreground">{book.description}</p>
            {isSample && (
              <p className="mt-2 max-w-2xl text-sm font-medium text-gold">
                This is an excerpt — {book.total_chunks}{" "}
                {book.total_chunks === 1 ? "page" : "pages"}, not the complete work.
              </p>
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
                {isSample ? `Read the sample in ${readLanguage}` : `Start reading in ${readLanguage}`}
              </Link>
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
