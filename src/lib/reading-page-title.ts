/** A descriptive client tab title for a visible source section or chapter. */
export function readingPageTitle(book: string, section?: string | null, language?: string | null): string {
  const parts = [book, section, language]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return parts.join(" — ") + " | Seeparah";
}
