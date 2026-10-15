import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShelfButtons } from "@/components/ShelfButtons";
import { getSacredReaderSection } from "@/lib/scripture.functions";
import { getPublicBookEditions } from "@/lib/translation.functions";
import { saveProgress } from "@/lib/library";
import { RTL_LANGUAGES, type Book } from "@/lib/data";
import { useAuth } from "@/lib/use-auth";
import { renderSacredInline } from "@/lib/sacred-inline-markup";

function languageToBcp47(language: string): string {
  const map: Record<string, string> = {
    English: "en",
    Urdu: "ur",
    Hindi: "hi",
    Arabic: "ar",
    Chinese: "zh-CN",
    Hebrew: "he",
    Greek: "el",
    Pali: "pi",
    Tibetan: "bo",
    Sanskrit: "sa",
    Persian: "fa",
    Pashto: "ps",
  };
  return map[language] ?? language.toLowerCase().slice(0, 2);
}

function scriptureFontFamily(language: string): string | undefined {
  const stacks: Record<string, string> = {
    Arabic: "'Noto Naskh Arabic', 'Traditional Arabic', serif",
    Urdu: "'Noto Nastaliq Urdu', 'Urdu Typesetting', serif",
    Hebrew: "'Noto Serif Hebrew', 'Times New Roman', serif",
    Greek: "'Noto Serif', 'Times New Roman', serif",
    Pali: "'Noto Serif', 'Times New Roman', serif",
    Tibetan: "'Noto Serif Tibetan', 'Microsoft Himalaya', serif",
    Sanskrit: "'Noto Serif Devanagari', 'Nirmala UI', serif",
    Hindi: "'Noto Serif Devanagari', 'Nirmala UI', serif",
    Chinese: "'Noto Serif CJK SC', 'Songti SC', SimSun, serif",
  };
  return stacks[language];
}

function annotationLabel(type: string): string {
  if (type === "footnote") return "Footnote";
  if (type === "commentary") return "Commentary";
  if (type === "subcommentary") return "Subcommentary";
  return "Editorial note";
}

export function SacredTextReader({
  book,
  initialLanguage,
  initialChunkIndex,
}: {
  book: Book;
  initialLanguage?: string | undefined;
  initialChunkIndex?: number | undefined;
}) {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [language, setLanguage] = useState(
    initialLanguage && book.available_languages.includes(initialLanguage)
      ? initialLanguage
      : book.source_language,
  );
  const [chunkIndex, setChunkIndex] = useState(
    Math.max(0, Math.min(book.total_chunks - 1, initialChunkIndex ?? 0)),
  );
  const lastSavedRef = useRef<string>("");

  const sectionQuery = useQuery({
    queryKey: ["sacred-reader-section", book.id, language, chunkIndex],
    queryFn: () =>
      getSacredReaderSection({
        data: { bookId: book.id, language, chunkIndex },
      }),
    staleTime: 15 * 60 * 1000,
  });

  const editionsQuery = useQuery({
    queryKey: ["public-book-editions", book.id],
    queryFn: () => getPublicBookEditions({ data: { bookId: book.id } }),
    staleTime: 15 * 60 * 1000,
  });
  const selectedEdition = (editionsQuery.data ?? []).find(
    (edition) => edition.language === language,
  );
  const sourceUrl =
    selectedEdition?.sourceUrl ?? (language === book.source_language ? book.source_url : null);
  const reuseNotice =
    selectedEdition?.reuseNotice ??
    (language === book.source_language ? book.reuse_notice : null);
  const editionLabel =
    selectedEdition?.editionTitle ??
    (language === book.source_language ? book.edition_title : null);
  const editionPeople = [
    selectedEdition?.translator ? "Translator: " + selectedEdition.translator : null,
    selectedEdition?.editor ? "Editor: " + selectedEdition.editor : null,
    selectedEdition?.publisher ?? (language === book.source_language ? book.publisher : null),
  ].filter(Boolean);
  const versionLabel =
    selectedEdition?.versionLabel ??
    (language === book.source_language ? book.source_revision : null);

  const direction = RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
  const availableLanguages = useMemo(
    () => [
      book.source_language,
      ...book.available_languages.filter((item) => item !== book.source_language),
    ],
    [book.available_languages, book.source_language],
  );

  const updateLocation = (nextLanguage: string, nextChunkIndex: number, replace = false) => {
    setLanguage(nextLanguage);
    setChunkIndex(nextChunkIndex);
    void navigate({
      to: "/read/$bookId",
      params: { bookId: book.id },
      search: { lang: nextLanguage, page: nextChunkIndex + 1 },
      replace,
    });
  };

  useEffect(() => {
    const section = sectionQuery.data;
    if (!section) return;
    const target = document.getElementById(`sacred-chunk-${chunkIndex}`);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));

    const saveKey = `${userId}:${book.id}:${language}:${chunkIndex}`;
    if (lastSavedRef.current !== saveKey) {
      lastSavedRef.current = saveKey;
      void saveProgress(userId, book.id, language, chunkIndex);
    }
  }, [book.id, chunkIndex, language, sectionQuery.data, userId]);

  if (sectionQuery.isLoading) {
    return (
      <main className="flex min-h-[72vh] items-center justify-center bg-background px-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Loading sacred-text section…</p>
        </div>
      </main>
    );
  }

  const section = sectionQuery.data;
  if (!section || sectionQuery.isError) {
    return (
      <main className="flex min-h-[72vh] items-center justify-center bg-background px-4">
        <div className="max-w-lg text-center">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            This sourced edition could not be opened
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seeparah does not substitute another scripture edition when the requested source is unavailable.
          </p>
          <Link
            to="/sacred-texts/$bookId"
            params={{ bookId: book.id }}
            className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            View edition details
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-3 sm:px-6">
          <Link
            to="/sacred-texts/$bookId"
            params={{ bookId: book.id }}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">References</span>
          </Link>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate font-display text-base font-semibold text-foreground" dir="auto">
              {book.title}
            </p>
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              {section.title}
            </p>
          </div>

          <label className="shrink-0">
            <span className="sr-only">Edition language</span>
            <select
              value={language}
              onChange={(event) => updateLocation(event.target.value, chunkIndex, true)}
              className="max-w-[118px] rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-semibold text-foreground sm:max-w-none"
            >
              {availableLanguages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 pb-28 pt-5 sm:px-6">
        <section className="rounded-2xl border border-primary/20 bg-card p-4 card-shadow sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.17em] text-primary">
                {section.kind}
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold text-foreground" dir="auto">
                {section.title}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {section.startChunkIndex + 1}–{section.endChunkIndex + 1} of {book.total_chunks} source units
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground">Source-only edition</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border/70 bg-background/70 px-3 py-3 text-xs leading-relaxed text-muted-foreground" dir="auto">
            <p>
              <strong className="text-foreground">Selected edition:</strong>{" "}
              {editionLabel || language + " sourced edition"}
              {versionLabel ? " · " + versionLabel : ""}
            </p>
            {editionPeople.length > 0 && <p className="mt-1">{editionPeople.join(" · ")}</p>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <ShelfButtons bookId={book.id} showLabels={false} />
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                Selected edition source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {reuseNotice && (
            <p className="mt-4 rounded-xl bg-secondary/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground" dir="auto">
              <strong className="text-foreground">Reuse:</strong> {reuseNotice}
            </p>
          )}
        </section>

        <section
          className="mt-5 overflow-hidden rounded-2xl border border-border bg-card card-shadow"
          lang={languageToBcp47(language)}
          dir={direction}
          style={{ fontFamily: scriptureFontFamily(language) }}
          aria-label={`${book.title} — ${section.title}`}
        >
          {section.chunks.map((chunk) => {
            const active = chunk.chunkIndex === chunkIndex;
            return (
              <article
                key={chunk.chunkIndex}
                id={`sacred-chunk-${chunk.chunkIndex}`}
                className={[
                  "border-b border-border px-4 py-5 last:border-b-0 sm:px-7",
                  active ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : "",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between gap-3" dir="auto">
                  <button
                    type="button"
                    onClick={() => updateLocation(language, chunk.chunkIndex, true)}
                    className="text-xs font-semibold text-primary hover:underline"
                    aria-label={`Reference ${chunk.label}`}
                  >
                    {chunk.label}
                  </button>
                  <span className="text-[11px] text-muted-foreground">{chunk.kind}</span>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-[1.08rem] leading-8 text-foreground sm:text-lg" dir={direction}>
                  {renderSacredInline(chunk.content)}
                </p>

                {chunk.annotations.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-border/70 pt-3" dir="auto">
                    {chunk.annotations.map((annotation) => (
                      <details
                        key={`${annotation.type}-${annotation.ordinal}`}
                        className="rounded-lg bg-secondary/60 px-3 py-2 text-sm"
                      >
                        <summary className="cursor-pointer font-semibold text-foreground">
                          {annotationLabel(annotation.type)}
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                          {renderSacredInline(annotation.content)}
                        </p>
                      </details>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <nav className="mt-5 grid grid-cols-2 gap-3" aria-label="Sacred text sections">
          {section.previousChunkIndex != null ? (
            <button
              type="button"
              onClick={() => updateLocation(language, section.previousChunkIndex!)}
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              <ChevronLeft className="h-4 w-4" /> Previous section
            </button>
          ) : (
            <div />
          )}
          {section.nextChunkIndex != null ? (
            <button
              type="button"
              onClick={() => updateLocation(language, section.nextChunkIndex!)}
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              Next section <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <Link
              to="/sacred-texts/$bookId"
              params={{ bookId: book.id }}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              Edition details
            </Link>
          )}
        </nav>
      </main>
    </div>
  );
}
