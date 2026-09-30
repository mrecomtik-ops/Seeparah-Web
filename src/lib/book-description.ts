export const IMPORT_PLACEHOLDER_DESCRIPTION =
  "Imported from the reviewed acquisition package and awaiting Seeparah editorial review before publication.";

export function isPlaceholderBookDescription(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized === IMPORT_PLACEHOLDER_DESCRIPTION.toLowerCase() ||
    normalized.includes("awaiting seeparah editorial review before publication")
  );
}

export function publicBookDescription(input: {
  title: string;
  author: string;
  sourceLanguage: string;
  description?: string | null;
}): string {
  if (!isPlaceholderBookDescription(input.description)) return input.description!.trim();
  return `Read ${input.title} by ${input.author} in its ${input.sourceLanguage} edition on Seeparah.`;
}
