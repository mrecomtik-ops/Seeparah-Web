export interface ScriptureReferencePathPart {
  kind: string;
  label: string;
  value: string;
}

export interface ScriptureReferenceEntry {
  nodeKey: string;
  canonicalRef: string;
  label: string;
  kind: string;
  title: string | null;
  startChunkIndex: number;
  endChunkIndex: number;
  depth: number;
  ordinal: number;
  path: ScriptureReferencePathPart[];
}

export interface ScriptureReferenceIndex {
  bookId: string;
  language: string;
  sourceVersion: number;
  references: ScriptureReferenceEntry[];
}

/**
 * Import contract for Sacred Text structure.
 *
 * Sourced scripture imports keep using book_structure_nodes so Reader V2
 * progress/highlights remain stable. Leaf or navigable nodes may add these
 * public-safe metadata keys:
 *
 * {
 *   "canonical_ref": "2:255",
 *   "reference_label": "Al-Baqarah 2:255",
 *   "reference_kind": "ayah",
 *   "reference_path": [
 *     {"kind":"surah","label":"Surah","value":"2"},
 *     {"kind":"ayah","label":"Ayah","value":"255"}
 *   ]
 * }
 *
 * The labels are intentionally data-driven: Bible-style book/chapter/verse,
 * Quran surah/ayah, chapter/shloka, canto/section, ang, hymn, or another
 * authentic canonical system can all be represented without forcing every
 * tradition into generic "chapter / verse" terminology.
 */
export const SCRIPTURE_REFERENCE_METADATA_KEYS = [
  "canonical_ref",
  "reference_label",
  "reference_kind",
  "reference_path",
] as const;
