import type { CSSProperties } from "react";
import { languageToBcp47 } from "@/lib/languages";
import { RTL_LANGUAGES } from "@/lib/data";
import { renderSacredInline } from "@/lib/sacred-inline-markup";

/** A Qur'an comparison may only pair the exact, source-reviewed ayah.
 * Never assume that two editions align from their array position alone. */
export type QuranVerseReference = {
  chunkIndex: number;
  canonicalRef: string;
  label: string;
};
export type QuranComparedVerse = QuranVerseReference & { content: string };

export function findVerifiedQuranVerse(
  source: QuranVerseReference,
  candidates: readonly QuranComparedVerse[] | undefined,
): QuranComparedVerse | null {
  const canonicalRef = source.canonicalRef.trim();
  if (!/^\d{1,3}:\d{1,3}$/.test(canonicalRef) || !candidates) return null;
  const matches = candidates.filter((candidate) =>
    candidate.chunkIndex === source.chunkIndex &&
    candidate.canonicalRef.trim() === canonicalRef &&
    candidate.content.trim().length > 0,
  );
  return matches.length === 1 ? matches[0]! : null;
}

/** Render immediately below its *own* Arabic/source verse, not in an adjacent column.
 * Translation spans deliberately do not carry data-sacred-source-text because
 * source-language highlighting must never be mislabeled as the original. */
export function QuranVerseTranslation({
  source, candidates, language, textStyle, loading = false, error = false,
}: {
  source: QuranVerseReference;
  candidates: readonly QuranComparedVerse[] | undefined;
  language: string;
  textStyle: CSSProperties;
  loading?: boolean;
  error?: boolean;
}) {
  const matched = loading || error ? null : findVerifiedQuranVerse(source, candidates);
  return (
    <div
      data-quran-inline-comparison={source.canonicalRef}
      lang={languageToBcp47(language)}
      dir={RTL_LANGUAGES.has(language) ? "rtl" : "ltr"}
      aria-label={`${language} edition for ayah ${source.canonicalRef}`}
      className="mt-4 rounded-lg border border-primary/15 bg-secondary/35 px-3 py-4 sm:px-5"
    >
      <p lang="en" dir="ltr" className="mb-3 text-xs font-semibold text-primary">
        {language === "Arabic" ? "Arabic source" : `${language} translation`} · {source.canonicalRef}
      </p>
      {loading ? (
        <p role="status" lang="en" dir="ltr" className="text-xs text-muted-foreground">Loading matching ayah…</p>
      ) : error ? (
        <p role="alert" lang="en" dir="ltr" className="text-xs text-destructive">
          This published edition could not be loaded. Source ayah remains unchanged.
        </p>
      ) : matched ? (
        <p
          data-quran-matched-reference={matched.canonicalRef}
          className="whitespace-pre-wrap break-words text-foreground"
          style={textStyle}
        >
          {renderSacredInline(matched.content)}
        </p>
      ) : (
        <p lang="en" dir="ltr" role="status" className="text-xs text-muted-foreground">
          No verified {language} text matches ayah {source.canonicalRef} in this published edition.
        </p>
      )}
    </div>
  );
}
