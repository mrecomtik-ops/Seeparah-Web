/** Presentation-only settings for a selected sacred source edition.
 * These do not modify source text, create headings, or infer print pagination.
 */
export type SacredReadingMode = "book" | "study";
export type SacredTextMeasure = "narrow" | "comfortable" | "wide";
export type SacredReaderTypeface = "literary" | "accessible";

export const SCRIPT_PROFILES: Record<string, { size: number; leading: number; measure: string; script: string }> = {
  Arabic: { size: 29, leading: 2.05, measure: "39rem", script: "Arabic" },
  Urdu: { size: 26, leading: 2.55, measure: "42rem", script: "Urdu Nastaliq" },
  Hebrew: { size: 25, leading: 1.95, measure: "42rem", script: "Hebrew" },
  Greek: { size: 19, leading: 1.9, measure: "44rem", script: "Polytonic Greek" },
  Pali: { size: 19, leading: 1.85, measure: "44rem", script: "Roman-script Pali" },
  Sanskrit: { size: 24, leading: 1.9, measure: "42rem", script: "Devanagari Sanskrit" },
  Hindi: { size: 23, leading: 1.9, measure: "42rem", script: "Devanagari Hindi" },
  Chinese: { size: 21, leading: 1.9, measure: "40rem", script: "Chinese" },
  Tibetan: { size: 26, leading: 2, measure: "44rem", script: "Tibetan" },
  English: { size: 19, leading: 1.85, measure: "44rem", script: "Latin" },
};
export function sacredReadingProfile(language: string) {
  return SCRIPT_PROFILES[language] ?? { size: 19, leading: 1.85, measure: "44rem", script: "Other" };
}
export function sourceEditionLabel(
  language: string,
  originalLanguage: string,
  hasTranslationCredit: boolean,
): string {
  // Never infer "original" from script alone (e.g., an English-source translation).
  if (hasTranslationCredit) return "Published translation";
  if (language === originalLanguage) return "Selected source edition";
  return "Published language edition";
}
export function sacredSourceDescription(language: string, title: string): string {
  if (language === "English" && /\b(new testament|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation)\b/i.test(title)) {
    return "The WEB Classic plain-text export does not preserve the publisher's original headings, paragraph or poetry layout. This is a readable reflow, not a facsimile.";
  }
  return "Modern reflowable reading layout. Original printed page and line breaks are not claimed.";
}
export function sacredReaderMeasure(choice: SacredTextMeasure, language: string): string {
  if (choice === "narrow") return "34rem";
  if (choice === "wide") return "60rem";
  return sacredReadingProfile(language).measure;
}
export function isSourcePoetryChunk(kind: string): boolean {
  // A structural hint is permitted only when explicitly encoded in the source node.
  return ["verse-line", "poetry", "stanza", "poem"].includes(kind.toLowerCase());
}

/** Font CSS is loaded only on the reading route, never into the global shell. */
export function sacredScriptFontHref(language: string): string | null {
  const fonts: Record<string, string> = {
    Arabic: "Noto+Naskh+Arabic:wght@400..700",
    Urdu: "Noto+Nastaliq+Urdu:wght@400..700",
    Hebrew: "Noto+Serif+Hebrew:wght@400..700",
    Sanskrit: "Noto+Serif+Devanagari:wght@400..700",
    Hindi: "Noto+Serif+Devanagari:wght@400..700",
    Greek: "Noto+Serif:wght@400..700",
    Pali: "Noto+Serif:wght@400..700",
    Tibetan: "Noto+Serif+Tibetan:wght@400..700",
    Chinese: "Noto+Serif+SC:wght@400..700",
  };
  const font = fonts[language];
  return font ? "https://fonts.googleapis.com/css2?family=" + font + "&display=swap" : null;
}
