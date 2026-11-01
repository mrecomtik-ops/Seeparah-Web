export type SacredReadingMode = "book" | "study";
export type SacredTextMeasure = "narrow" | "comfortable" | "wide";
export type SacredPrefs = {
  mode: SacredReadingMode;
  fontDelta: number;
  lineDelta: number;
  measure: SacredTextMeasure;
  sans: boolean;
};
export const READER_PREFS_KEY = "seeparah-sacred-reader-settings-v1";
export const DEFAULT_SACRED_PREFS: SacredPrefs = {
  mode: "book",
  fontDelta: 0,
  lineDelta: 0,
  measure: "comfortable",
  sans: false,
};
const FONT_VALUES = [-4, 0, 4, 8];
const LINE_VALUES = [-0.15, 0, 0.25];
const MEASURES = ["narrow", "comfortable", "wide"];
export function parseSacredPrefs(json: string | null): SacredPrefs {
  if (!json) return { ...DEFAULT_SACRED_PREFS };
  try {
    const input: unknown = JSON.parse(json);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return { ...DEFAULT_SACRED_PREFS };
    const p = input as Record<string, unknown>;
    return {
      mode: p["mode"] === "study" ? "study" : "book",
      fontDelta: FONT_VALUES.includes(Number(p["fontDelta"])) ? Number(p["fontDelta"]) : 0,
      lineDelta: LINE_VALUES.includes(Number(p["lineDelta"])) ? Number(p["lineDelta"]) : 0,
      measure: MEASURES.includes(String(p["measure"]))
        ? (p["measure"] as SacredTextMeasure)
        : "comfortable",
      sans: p["sans"] === true,
    };
  } catch {
    return { ...DEFAULT_SACRED_PREFS };
  }
}
export function readSacredPrefs(storage: Pick<Storage, "getItem"> | null): SacredPrefs {
  try {
    return parseSacredPrefs(storage?.getItem(READER_PREFS_KEY) ?? null);
  } catch {
    return { ...DEFAULT_SACRED_PREFS };
  }
}
export function persistSacredPrefs(storage: Pick<Storage, "setItem"> | null, prefs: SacredPrefs) {
  try {
    storage?.setItem(READER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* blocked/private storage */
  }
}

/** These four identities have matching source-leaf node keys and canonical
 * references verified on 19 Oct 2026 in production, for every language pair.
 * No cross-edition alignment is inferred for other texts.
 */
export const VERIFIED_LANGUAGE_ALIGNMENT = {
  "f7e3a9f0-931a-5207-9859-a27210cc2ca8": ["Arabic", "English", "Urdu", "Hindi", "Chinese"],
  "3e2c1103-36a9-5a44-987c-259d27dea072": ["Pali", "English"],
  "bbbca884-54f8-5d97-bf28-3a3346ea9e34": ["Hebrew", "English"],
  "87205571-41a9-540a-abd2-3784a4079fad": ["Hebrew", "English"],
} as const;
export function canRetainCanonicalPosition(
  bookId: string,
  fromLanguage: string,
  toLanguage: string,
  totalChunks: number,
  chunkIndex: number,
): boolean {
  if (fromLanguage === toLanguage) return true;
  const match = VERIFIED_LANGUAGE_ALIGNMENT[bookId as keyof typeof VERIFIED_LANGUAGE_ALIGNMENT];
  return Boolean(
    match &&
    (match as readonly string[]).includes(fromLanguage) &&
    (match as readonly string[]).includes(toLanguage) &&
    chunkIndex >= 0 &&
    chunkIndex < totalChunks,
  );
}
export type SacredEditionLayout =
  | "quran"
  | "bible"
  | "psalms"
  | "gita"
  | "dhammapada"
  | "digha"
  | "analects"
  | "dao"
  | "book-of-mormon"
  | "other";
export function sacredEditionLayout(title: string): SacredEditionLayout {
  const s = title.toLowerCase();
  if (s.includes("qur’an") || s.includes("quran")) return "quran";
  if (s === "psalms") return "psalms";
  if (s === "bhagavad gita") return "gita";
  if (s === "dhammapada") return "dhammapada";
  if (s.includes("dīgha nikāya")) return "digha";
  if (s.includes("analects")) return "analects";
  if (s.includes("dao de jing") && s.includes("wang bi")) return "dao";
  if (s.includes("book of mormon")) return "book-of-mormon";
  if (
    /^(matthew|mark|luke|john|acts|romans|1 corinthians|2 corinthians|galatians|ephesians|philippians|colossians|1 thessalonians|2 thessalonians|1 timothy|2 timothy|titus|philemon|hebrews|james|1 peter|2 peter|1 john|2 john|3 john|jude|revelation)$/.test(
      s,
    )
  )
    return "bible";
  return "other";
}
export function sacredReferenceGroupLabel(layout: SacredEditionLayout, kind: string): string {
  if (layout === "quran") return "Ayahs";
  if (layout === "bible" || layout === "psalms") return "Verses";
  if (layout === "gita") return "Shlokas (source units)";
  if (layout === "dhammapada") return "Stanzas";
  if (layout === "digha") return "Discourses";
  if (layout === "analects") return "Source passages";
  if (layout === "dao") return "Chapters";
  if (layout === "book-of-mormon") return "Chapters";
  return kind === "chapter" ? "Chapters" : "Sections";
}
/** UTF-16 code-unit FNV fingerprint of the unmodified display string. */
export function sacredSourceFingerprint(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
