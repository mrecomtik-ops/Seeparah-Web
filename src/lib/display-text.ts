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
  "into",
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
      const afterColon = index > 0 && /:$/u.test(words[index - 1] ?? "");
      if (
        !afterColon &&
        index > 0 &&
        index < words.length - 1 &&
        SMALL_TITLE_WORDS.has(lower.replace(/[,:;]+$/u, ""))
      )
        return lower;
      return lower.replace(
        /(^|[-—–(\x5b{"'“‘])([\p{L}\p{N}])/gu,
        (_, lead: string, char: string) => lead + char.toLocaleUpperCase(),
      );
    })
    .join(" ")
    .replace(/(['’])S\b/gu, "$1s")
    .replace(/;\s+or,\s+the\b/gu, "; or, The");
}
