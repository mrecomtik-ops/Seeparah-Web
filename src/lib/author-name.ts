/** Convert catalogue-style creator strings to a reader-friendly primary author name.
 * The stored bibliographic value remains unchanged for provenance/audit use. */
export function formatAuthorName(raw: string): string {
  const primary = (raw.split(";")[0]?.trim() ?? raw.trim())
    .replace(/\b((?:[A-Z]\.\s*){1,4})\([^)]*\)\s*/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  if (!primary.includes(",")) return primary;

  const parts = primary
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return primary;

  const surname = parts[0] ?? "";
  const givenParts = parts
    .slice(1)
    .filter((part) => !/^\d{3,4}\s*-\s*\d{0,4}$/u.test(part) && !/^\d{3,4}-$/u.test(part));
  const given = givenParts.join(" ").trim();
  return given ? `${given} ${surname}`.replace(/\s+/g, " ").trim() : surname;
}

/** Canonical reader-facing author facet for alternate catalog name strings.
 * Does not rewrite source attribution or introduce unverified identities.
 * Honorifics and middle names must not fragment Walter Scott or Gaskell. */
export function canonicalAuthorKey(raw: string): string {
  const formatted = formatAuthorName(raw).normalize("NFKD").toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  const pieces = formatted.split(" ").filter(Boolean);
  const withoutTitles = pieces.filter((word) =>
    !["sir", "lady", "dame", "mrs", "mr", "ms", "dr", "rev", "prof"].includes(word));
  if (!withoutTitles.length) return formatted;
  if (withoutTitles.length === 1) return withoutTitles[0]!;
  return `${withoutTitles[0]} ${withoutTitles.at(-1)}`;
}
