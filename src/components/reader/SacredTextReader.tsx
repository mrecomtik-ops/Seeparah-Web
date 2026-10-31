import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Settings2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Copy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShelfButtons } from "@/components/ShelfButtons";
import { getSacredReaderSection, getSacredTextReferenceIndex } from "@/lib/scripture.functions";
import { getPublicBookEditions } from "@/lib/translation.functions";
import { saveProgress } from "@/lib/library";
import { RTL_LANGUAGES, type Book } from "@/lib/data";
import { useAuth } from "@/lib/use-auth";
import { renderSacredInline } from "@/lib/sacred-inline-markup";
import {
  readSacredPrefs,
  persistSacredPrefs,
  canRetainCanonicalPosition,
  sacredEditionLayout,
  sacredReferenceGroupLabel,
} from "@/lib/sacred-reader-prefs";
import {
  DhammapadaStanza,
  BilaraDiscourse,
  DaoWithWangBi,
  bilingualAnalectsKind,
  type DhammapadaLayoutData,
  type DiscourseLayoutData,
} from "@/components/reader/SacredSourceStructure";
import {
  sacredReadingProfile,
  sacredReaderMeasure,
  sourceEditionLabel,
  sacredSourceDescription,
  isSourcePoetryChunk,
  sacredScriptFontHref,
  type SacredReadingMode,
  type SacredTextMeasure,
} from "@/lib/sacred-reader-layout";

function languageToBcp47(language: string): string {
  const map: Record<string, string> = {
    English: "en",
    Bilingual: "mul",
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
  return map[language] ?? "und";
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
    Chinese: "'Noto Serif SC', 'Noto Serif CJK SC', 'Songti SC', SimSun, serif",
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
  const [readingMode, setReadingMode] = useState<SacredReadingMode>("book");
  const [fontDelta, setFontDelta] = useState(0);
  const [lineDelta, setLineDelta] = useState(0);
  const [textMeasure, setTextMeasure] = useState<SacredTextMeasure>("comfortable");
  const [useSans, setUseSans] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const [languageResetNote, setLanguageResetNote] = useState("");
  const [dhpSource, setDhpSource] = useState<DhammapadaLayoutData | null>(null);
  const [dnSource, setDnSource] = useState<DiscourseLayoutData | null>(null);
  const editionLayout = sacredEditionLayout(book.title);

  useEffect(() => {
    const prefs = readSacredPrefs(window.localStorage);
    setReadingMode(prefs.mode);
    setFontDelta(prefs.fontDelta);
    setLineDelta(prefs.lineDelta);
    setTextMeasure(prefs.measure);
    setUseSans(prefs.sans);
    setPrefsReady(true);
  }, []);
  useEffect(() => {
    if (!prefsReady) return;
    persistSacredPrefs(window.localStorage, {
      mode: readingMode,
      fontDelta,
      lineDelta,
      measure: textMeasure,
      sans: useSans,
    });
  }, [prefsReady, readingMode, fontDelta, lineDelta, textMeasure, useSans]);
  useEffect(() => {
    let active = true;
    if (editionLayout === "dhammapada") {
      void import("@/lib/sacred-bilara-dhp-lines.json").then(({ default: data }) => {
        if (active) setDhpSource(data as DhammapadaLayoutData);
      });
    } else if (editionLayout === "digha") {
      void import("@/lib/sacred-bilara-dn-structure.json").then(({ default: data }) => {
        if (active) setDnSource(data as DiscourseLayoutData);
      });
    }
    return () => {
      active = false;
    };
  }, [editionLayout]);

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
  const referenceQuery = useQuery({
    queryKey: ["sacred-reference-index", book.id, language],
    queryFn: () => getSacredTextReferenceIndex({ data: { bookId: book.id, language } }),
    enabled: contentsOpen,
    staleTime: 15 * 60 * 1000,
  });
  const referenceChapters = (referenceQuery.data?.references ?? []).filter(
    (entry) => entry.depth === 0 && entry.startChunkIndex >= 0,
  );
  const currentCanonicalSection = referenceChapters.find(
    (item) => item.startChunkIndex <= chunkIndex && item.endChunkIndex >= chunkIndex,
  );
  const selectedEdition = (editionsQuery.data ?? []).find(
    (edition) => edition.language === language,
  );
  const sourceUrl =
    selectedEdition?.sourceUrl ?? (language === book.source_language ? book.source_url : null);
  const reuseNotice =
    selectedEdition?.reuseNotice ?? (language === book.source_language ? book.reuse_notice : null);
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

  useEffect(() => {
    const href = sacredScriptFontHref(language);
    if (!href) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset["sacredReaderFont"] = language;
    document.head.appendChild(link);
    return () => link.remove();
  }, [language]);

  const direction = RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
  const profile = sacredReadingProfile(language);
  const hasTranslationCredit = Boolean(selectedEdition?.translator);
  const editionType = sourceEditionLabel(language, book.source_language, hasTranslationCredit);
  const contentFont =
    useSans && language === "English"
      ? "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
      : (scriptureFontFamily(language) ?? "Georgia, 'Noto Serif', serif");
  const contentStyle = {
    fontSize: Math.max(16, profile.size + fontDelta) + "px",
    lineHeight: profile.leading + lineDelta,
    fontFamily: contentFont,
  };
  const availableLanguages = useMemo(
    () => [
      book.source_language,
      ...book.available_languages.filter((item) => item !== book.source_language),
    ],
    [book.available_languages, book.source_language],
  );

  const changeLanguage = (nextLanguage: string) => {
    if (nextLanguage === language) return;
    const retain = canRetainCanonicalPosition(
      book.id,
      language,
      nextLanguage,
      book.total_chunks,
      chunkIndex,
    );
    setLanguageResetNote(
      retain
        ? ""
        : "This edition has no verified matching reference at your current position. Reading starts at its first section.",
    );
    updateLocation(nextLanguage, retain ? chunkIndex : 0, true);
  };
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
    // Long source units (for example an entire Dīgha discourse) must open at
    // their beginning, not their vertical midpoint. Respect scroll-mt-28.
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));

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
            Seeparah does not substitute another scripture edition when the requested source is
            unavailable.
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
            className="inline-flex min-h-11 shrink-0 items-center gap-2 px-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
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
              onChange={(event) => changeLanguage(event.target.value)}
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
        <section className="mx-auto max-w-3xl px-1 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {editionType} · {language}
              </p>
              <h1
                className="mt-1 font-display text-xl font-semibold text-foreground sm:text-2xl"
                dir="auto"
              >
                {section.title}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {sacredReferenceGroupLabel(editionLayout, section.kind)} {section.chunks[0]?.label}
                {section.chunks.length > 1
                  ? " – " + section.chunks[section.chunks.length - 1]?.label
                  : ""}
              </p>
            </div>
            <ShelfButtons bookId={book.id} showLabels={false} />
          </div>
          {languageResetNote && (
            <p
              className="mt-2 rounded-md bg-secondary/60 px-3 py-2 text-xs text-foreground"
              role="status"
            >
              {languageResetNote}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Reading presentation">
            <div
              className="inline-flex rounded-lg border border-border bg-card p-1"
              role="group"
              aria-label="Reading mode"
            >
              <button
                type="button"
                aria-pressed={readingMode === "book"}
                onClick={() => setReadingMode("book")}
                className={
                  "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium " +
                  (readingMode === "book"
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "text-foreground hover:bg-secondary")
                }
              >
                <BookOpen className="h-4 w-4" /> Book
              </button>
              <button
                type="button"
                aria-pressed={readingMode === "study"}
                onClick={() => setReadingMode("study")}
                className={
                  "min-h-9 rounded-md px-3 text-sm font-medium " +
                  (readingMode === "study"
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "text-foreground hover:bg-secondary")
                }
              >
                Study
              </button>
            </div>
            <button
              type="button"
              onClick={() => setContentsOpen((open) => !open)}
              aria-expanded={contentsOpen}
              className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-secondary"
            >
              Contents
            </button>
            <details className="group rounded-lg border border-border bg-card text-sm">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 font-medium text-foreground hover:bg-secondary">
                <Settings2 className="h-4 w-4" /> Reading settings
              </summary>
              <div className="grid w-full max-w-[calc(100vw-2rem)] min-w-0 grid-cols-1 gap-3 border-t border-border px-3 py-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  <span className="flex items-baseline justify-between gap-2">
                    Text size
                    <output aria-live="polite" className="tabular-nums text-muted-foreground">
                      {Math.max(16, profile.size + fontDelta)} px
                    </output>
                  </span>
                  <select
                    aria-label="Text size"
                    value={fontDelta}
                    onChange={(event) => setFontDelta(Number(event.target.value))}
                    className="min-h-10 rounded-lg border border-border bg-background px-2"
                  >
                    <option value={-4}>Smaller</option>
                    <option value={0}>Standard</option>
                    <option value={4}>Larger</option>
                    <option value={8}>Extra large</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  Line spacing
                  <select
                    aria-label="Line spacing"
                    value={lineDelta}
                    onChange={(event) => setLineDelta(Number(event.target.value))}
                    className="min-h-10 rounded-lg border border-border bg-background px-2"
                  >
                    <option value={-0.15}>Compact</option>
                    <option value={0}>Standard</option>
                    <option value={0.25}>Spacious</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  Text width
                  <select
                    aria-label="Text width"
                    value={textMeasure}
                    onChange={(event) => setTextMeasure(event.target.value as SacredTextMeasure)}
                    className="min-h-10 rounded-lg border border-border bg-background px-2"
                  >
                    <option value="narrow">Narrow</option>
                    <option value="comfortable">Comfortable</option>
                    <option value="wide">Wide</option>
                  </select>
                </label>
                {language === "English" && (
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={useSans}
                      onChange={(event) => setUseSans(event.target.checked)}
                      className="h-4 w-4"
                    />
                    Accessible sans-serif
                  </label>
                )}
              </div>
            </details>
            <details className="min-w-0 max-w-full rounded-lg border border-border bg-card text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 font-medium text-foreground hover:bg-secondary">
                Edition and source details
              </summary>
              <div
                className="max-w-xl space-y-2 px-4 pb-4 text-xs leading-relaxed text-muted-foreground"
                dir="auto"
              >
                <p>
                  <strong className="text-foreground">Selected edition:</strong>{" "}
                  {editionLabel || language + " sourced edition"}
                  {versionLabel ? " · " + versionLabel : ""}
                </p>
                {editionPeople.length > 0 && <p>{editionPeople.join(" · ")}</p>}
                <p>{sacredSourceDescription(language, book.title)}</p>
                {reuseNotice && (
                  <p>
                    <strong className="text-foreground">Reuse:</strong> {reuseNotice}
                  </p>
                )}
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-primary underline"
                  >
                    Edition source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </details>
          </div>
          {contentsOpen && (
            <div className="mt-3 rounded-lg border border-border bg-card p-3">
              <label
                htmlFor="sacred-chapter-selector"
                className="mb-2 block text-xs font-medium text-muted-foreground"
              >
                Navigate by source chapter or section
              </label>
              {referenceQuery.isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading source references…
                </p>
              ) : referenceChapters.length ? (
                <select
                  id="sacred-chapter-selector"
                  value={currentCanonicalSection?.startChunkIndex ?? ""}
                  onChange={(event) => {
                    if (event.target.value !== "") {
                      updateLocation(language, Number(event.target.value));
                    }
                  }}
                  className="min-h-11 w-full max-w-lg rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Select a source chapter</option>
                  {referenceChapters.map((entry) => (
                    <option key={entry.nodeKey} value={entry.startChunkIndex}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Source-defined chapter boundaries are not available for this edition.
                </p>
              )}
            </div>
          )}
        </section>

        <section
          className={
            readingMode === "book"
              ? "mx-auto rounded-xl bg-card px-4 py-7 shadow-sm sm:px-8 sm:py-10"
              : "mx-auto rounded-xl border border-border bg-card p-3 sm:p-6"
          }
          style={{
            maxWidth: sacredReaderMeasure(textMeasure, language),
            fontSize: Math.max(16, profile.size + fontDelta) + "px",
            lineHeight: profile.leading + lineDelta,
          }}
          data-reading-mode={readingMode}
          data-text-size-px={Math.max(16, profile.size + fontDelta)}
          lang={languageToBcp47(language)}
          dir={direction}
          aria-label={book.title + " — " + section.title}
        >
          {section.chunks.map((chunk) => {
            const active = chunk.chunkIndex === chunkIndex;
            const isStudy = readingMode === "study";
            const compactVerse =
              !isStudy &&
              (editionLayout === "quran" ||
                editionLayout === "bible" ||
                editionLayout === "psalms");
            const analectsKind =
              editionLayout === "analects" && language === "Bilingual"
                ? bilingualAnalectsKind(chunk.content)
                : null;
            const sourceVerseNumber = editionLayout === "dhammapada" ? chunk.chunkIndex + 1 : 0;
            return (
              <article
                key={chunk.chunkIndex}
                id={"sacred-chunk-" + chunk.chunkIndex}
                lang={analectsKind ? (analectsKind.startsWith("chinese") ? "zh-Hant" : "en") : undefined}
                className={[
                  "scroll-mt-28",
                  isStudy
                    ? "rounded-lg border-b border-border px-3 py-4 last:border-0 sm:px-5"
                    : compactVerse
                      ? "inline"
                      : "block py-2 first:pt-0 last:pb-0",
                  active && isStudy ? "bg-primary/5 ring-1 ring-inset ring-primary/15" : "",
                  !isStudy && editionLayout === "gita" ? "my-1.5" : "",
                ].join(" ")}
              >
                {isStudy ? (
                  <>
                    <div className="mb-2 flex items-baseline justify-between gap-3" dir="auto">
                      <button
                        type="button"
                        onClick={() => updateLocation(language, chunk.chunkIndex, true)}
                        className="text-xs font-semibold text-primary hover:underline"
                        aria-label={"Go to reference " + chunk.label}
                      >
                        {chunk.label}
                      </button>
                      <span className="text-xs text-muted-foreground">{chunk.kind}</span>
                      <button
                        type="button"
                        title="Copy exact original source text"
                        onClick={() => void navigator.clipboard?.writeText(chunk.content)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy text
                      </button>
                    </div>
                    <p
                      className="whitespace-pre-wrap break-words text-foreground"
                      dir={direction}
                      style={contentStyle}
                    >
                      {renderSacredInline(chunk.content)}
                    </p>
                  </>
                ) : compactVerse ? (
                  <span
                    className="sacred-book-verse whitespace-pre-wrap break-words text-foreground"
                    style={contentStyle}
                  >
                    {editionLayout !== "quran" && (
                      <sup
                        aria-label={"Reference " + chunk.label}
                        dir="ltr"
                        className="me-1 align-super text-[0.68em] font-medium text-primary/80"
                      >
                        {chunk.label}
                      </sup>
                    )}
                    {renderSacredInline(chunk.content)}
                    {editionLayout === "quran" && (
                      <sup
                        dir="ltr"
                        aria-label={"Ayah " + chunk.label}
                        className="ms-1 inline-block align-middle text-[0.63em] font-semibold text-primary/80"
                      >
                        &#xFD3E;{chunk.label}&#xFD3F;
                      </sup>
                    )}{" "}
                  </span>
                ) : (
                  <>
                    {analectsKind && (
                      <p className="mb-1 text-xs font-medium text-muted-foreground" dir="auto">
                        {analectsKind === "chinese-heading"
                          ? "Chinese source · book heading"
                          : analectsKind === "english-heading"
                            ? "Legge English · book heading"
                            : analectsKind === "chinese"
                              ? "Chinese source"
                              : "Legge English translation"}
                      </p>
                    )}
                    {editionLayout === "dhammapada" ? (
                      <div className="my-3">
                        <p
                          className="mb-1 text-[0.75em] font-medium text-muted-foreground"
                          dir="auto"
                        >
                          {chunk.label}
                        </p>
                        <DhammapadaStanza
                          content={chunk.content}
                          language={language}
                          verseNumber={sourceVerseNumber}
                          data={dhpSource}
                          style={contentStyle}
                        />
                      </div>
                    ) : editionLayout === "digha" ? (
                      <BilaraDiscourse
                        content={chunk.content}
                        ranges={section.sourceSegments}
                        data={dnSource}
                        style={contentStyle}
                        language={language}
                      />
                    ) : editionLayout === "dao" ? (
                      <DaoWithWangBi content={chunk.content} style={contentStyle} />
                    ) : editionLayout === "gita" && language === "Sanskrit" ? (
                      <div
                        className="sacred-shloka whitespace-normal break-words text-foreground"
                        dir={direction}
                        aria-label={chunk.label}
                      >
                        <p className="mb-1 text-[0.72em] font-medium text-muted-foreground">
                          {chunk.label}
                        </p>
                        {chunk.content
                          .split(/\n+/)
                          .filter((line) => line.length > 0)
                          .map((line, i) => (
                            <p
                              key={i}
                              className={
                                line.trim().endsWith("उवाच") ? "mb-1 font-semibold" : "my-0"
                              }
                              style={contentStyle}
                            >
                              {renderSacredInline(line)}
                            </p>
                          ))}
                      </div>
                    ) : (
                      <div
                        className={
                          analectsKind === "chinese-heading" || analectsKind === "english-heading"
                            ? "my-4 font-semibold"
                            : "my-2"
                        }
                        dir={direction}
                      >
                        <p
                          className="whitespace-pre-line break-words text-foreground"
                          style={contentStyle}
                        >
                          {renderSacredInline(chunk.content)}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {chunk.annotations.length > 0 && (
                  <div className="mt-2 space-y-2" dir="auto">
                    {chunk.annotations.map((annotation) => (
                      <details
                        key={annotation.type + "-" + annotation.ordinal}
                        className="rounded-md border border-border/60 px-3 py-2 text-sm"
                      >
                        <summary className="cursor-pointer font-medium text-muted-foreground">
                          {annotationLabel(annotation.type)}
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground">
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

        {reuseNotice && (
          <p
            className="mx-auto mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground"
            dir="auto"
          >
            <strong>Edition reuse notice:</strong> {reuseNotice}
          </p>
        )}

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
