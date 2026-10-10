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
