import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ArrowRight, Crown, FlaskConical } from "lucide-react";
import type { Book } from "@/lib/data";
import { SAMPLE_EXCERPT_BOOK_IDS, DEMO_MANUSCRIPT_BOOK_IDS } from "@/lib/data";
import { coverFor, isLowResolutionGutenbergCover } from "@/lib/covers";
import { getReaderBookPayload } from "@/lib/library";
import { sacredCoverSrc, sacredCoverAlt, isSharedSacredCollectionCover } from "@/lib/sacred-cover-artwork";
import { SacredWorkIdentity } from "@/components/SacredWorkIdentity";
import { BookCoverFallback } from "@/components/BookCoverFallback";
import { ShelfButtons } from "@/components/ShelfButtons";
import { getPrefs } from "@/lib/prefs";
import { formatAuthorName } from "@/lib/author-name";
import { publicBookDescription } from "@/lib/book-description";
import { displayTitleCase } from "@/lib/display-text";

export function BookCard({
  book,
  progress,
  withShelves = true,
  preferredLanguage,
  progressLanguage,
  monetizationEnabled = false,
  alternateEditionCount = 1,
}: {
  book: Book;
  progress?: number | null;
  withShelves?: boolean;
  /** Language to open this book in — e.g. the library's active language
   * filter. Falls back to the reader's saved preference, then the book's
   * source language, so a book always opens in a language the reader
   * actually chose rather than always defaulting to the original. */
  preferredLanguage?: string | null;
  /** The language this book's SAVED READING PROGRESS is actually keyed
   * under (from the caller's progress-by-book map), if any. Takes
   * priority over preferredLanguage/the device's generic language
   * preference — a "Continue reading" link must reopen the same
   * (book, language) the reader was actually reading, or the reader route's
   * saved-progress lookup won't find a matching row and silently restarts
   * at page 1. See src/routes/read.$bookId.tsx's seeding effect. */
  progressLanguage?: string | null;
  /** Defaults to false — a paid badge appears only when monetization is active, so a
   * "Premium" badge must never render unless the caller has confirmed
   * monetization is actually on (see content_settings.monetization_enabled).
   * Never infer this from `book.access_type` alone. */
  monetizationEnabled?: boolean;
  /** >1 only for sourced alternate editions of the same published work. */
  alternateEditionCount?: number;
}) {
  const queryClient = useQueryClient();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (prefetchTimer.current) clearTimeout(prefetchTimer.current); }, []);
  const displayAuthor = formatAuthorName(book.author);
  const displayTitle = displayTitleCase(book.title);
  const displayDescription = publicBookDescription({
    title: book.title,
    author: displayAuthor,
    sourceLanguage: book.source_language,
    description: book.description,
  });
  const isSample = SAMPLE_EXCERPT_BOOK_IDS.has(book.id);
  const isDemoManuscript = DEMO_MANUSCRIPT_BOOK_IDS.has(book.id);
  const cover = coverFor(book.id, book.cover_url);
  const listCover = cover?.includes("/book-covers/generated/SP-CAND-")
    ? cover.replace("/book-covers/generated/", "/book-covers/generated/thumbs/")
    : cover;
  const pct =
    progress != null && book.total_chunks > 0
      ? Math.min(100, Math.round(((progress + 1) / book.total_chunks) * 100))
      : null;
  const savedLanguage = getPrefs().language;
  const openLanguage =
    (progressLanguage && book.available_languages.includes(progressLanguage) && progressLanguage) ||
    (preferredLanguage &&
      book.available_languages.includes(preferredLanguage) &&
      preferredLanguage) ||
    (book.available_languages.includes(savedLanguage) && savedLanguage) ||
    book.source_language;
  const sharedCollectionArtwork = book.genre === "Sacred Text" && isSharedSacredCollectionCover(book);
  const imageForCard = book.genre === "Sacred Text" ? sacredCoverSrc(book, openLanguage) : listCover;
  const lowResGutenbergCover = isLowResolutionGutenbergCover(imageForCard);
  // Warm the book payload on a deliberate hover/focus, never during a long
  // library-list render. Query keys exactly match BookReaderV3's cache.
  const prefetchReader = () => {
    // The payload request is permission-sensitive; prefetch only public
    // free editions, never paid, sacred or unreleased translated editions.
    if (book.content_classification === "religious" || book.access_type !== "free") return;
    void queryClient.prefetchQuery({
      queryKey: ["reader-book-payload", book.id, openLanguage],
      queryFn: () => getReaderBookPayload(book.id, openLanguage),
      staleTime: 15 * 60 * 1000,
    });
  };
  const cancelPrefetch = () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  };
  const prefetchOnIntent = () => {
    cancelPrefetch();
    prefetchTimer.current = setTimeout(prefetchReader, 250);
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card card-shadow transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-primary/50 hover:card-shadow-lg focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/50 active:translate-y-0 motion-reduce:transform-none">
      {withShelves && (
        <div className="absolute right-3 top-3 z-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <ShelfButtons bookId={book.id} />
        </div>
      )}
      <Link
        to="/read/$bookId"
        params={{ bookId: book.id }}
        search={{ lang: openLanguage }}
        onMouseEnter={prefetchOnIntent}
        onMouseLeave={cancelPrefetch}
        onFocusCapture={prefetchReader}
        className="flex flex-1 flex-col rounded-2xl focus-visible:outline-none"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-secondary">
          {sharedCollectionArtwork ? (
            <SacredWorkIdentity book={book} language={openLanguage} />
          ) : imageForCard ? (
            <img
              src={imageForCard}
              alt={book.genre === "Sacred Text" ? sacredCoverAlt(book, openLanguage) : `Cover of ${displayTitle}`}
              loading="lazy"
              width={600}
              height={900}
              className={`absolute inset-0 m-auto h-full w-full ${lowResGutenbergCover ? "max-h-[300px] max-w-[200px] bg-card object-contain" : book.genre === "Sacred Text" || /gutenberg/i.test(book.source_edition_id ?? "") ? "bg-card object-contain" : "object-cover"} transition-transform duration-300 ${lowResGutenbergCover ? "" : "group-hover:scale-[1.03]"}`}
            />
          ) : (
            <BookCoverFallback bookId={book.id} title={displayTitle}
              author={displayAuthor} language={openLanguage} />
          )}
          {monetizationEnabled && book.access_type === "paid" && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[11px] font-semibold text-gold-foreground">
              <Crown className="h-3 w-3" /> Premium
            </span>
          )}
          {(isSample || isDemoManuscript) && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              <FlaskConical className="h-3 w-3" /> {isDemoManuscript ? "Demo" : "Sample chapters"}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div>
            <h3 className="font-display text-base font-semibold leading-snug text-foreground">
              {displayTitle}
            </h3>
            <p className="text-sm text-muted-foreground">{displayAuthor}</p>
            {alternateEditionCount > 1 && (
              <p className="mt-1 text-xs font-medium text-primary">
                {alternateEditionCount} source editions · {book.source_edition_id ?? "Seeparah edition"}
              </p>
            )}
          </div>
          {book.genre && (
            <span className="w-fit rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
              {book.genre}
            </span>
          )}
          {book.categories && book.categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {book.categories.slice(0, 2).map((c) => (
                <span
                  key={c}
                  className="w-fit rounded-full bg-accent/60 px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          <p className="line-clamp-2 text-sm text-muted-foreground">{displayDescription}</p>
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {book.available_languages.slice(0, 4).map((lang) => (
              <span
                key={lang}
                className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
              >
                {lang}
              </span>
            ))}
            {book.available_languages.length > 4 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                +{book.available_languages.length - 4}
              </span>
            )}
          </div>
          <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-primary transition-[color,gap] group-hover:gap-2.5 group-focus-within:gap-2.5">
            {pct != null ? "Continue reading" : "Start reading"}
            <ArrowRight className="h-4 w-4" />
          </span>
          {pct != null && (
            <div className="pt-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                {pct}% read — continue
              </p>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}