const SMALL_TITLE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "nor",
  "of",
  "on",
  "or",
  "per",
  "the",
  "to",
  "up",
  "via",
]);

const HONORIFICS = new Map([
  ["dr.", "Dr."],
  ["mr.", "Mr."],
  ["mrs.", "Mrs."],
  ["ms.", "Ms."],
  ["st.", "St."],
]);

export function displayTitleCase(value: string): string {
  const words = value.trim().split(/\s+/u);
  return words
    .map((word, index) => {
      const lower = word.toLocaleLowerCase();
      const honorific = HONORIFICS.get(lower);
      if (honorific) return honorific;
      if (index > 0 && index < words.length - 1 && SMALL_TITLE_WORDS.has(lower)) return lower;
      return lower.replace(
        /(^|[-—–(\x5b{"'“‘])([\p{L}\p{N}])/gu,
        (_, lead: string, char: string) => lead + char.toLocaleUpperCase(),
      );
    })
    .join(" ")
    .replace(/(['’])S\b/gu, "$1s");
}