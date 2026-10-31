/** Canonical BCP 47 script tags for reader accessibility and text-to-speech.
 * Unknown catalog edition labels must never be truncated to an unrelated
 * language (e.g. "Bilingual" -> Bislama "bi").
 */
const LANGUAGE_TAGS: Record<string, string> = {
  English: "en", Urdu: "ur", Hindi: "hi", Arabic: "ar", Chinese: "zh-CN",
  Spanish: "es", French: "fr", German: "de", Russian: "ru", Portuguese: "pt",
  Bengali: "bn", Japanese: "ja", Korean: "ko", Indonesian: "id",
  Turkish: "tr", Persian: "fa", Hebrew: "he", Greek: "el",
  Pali: "pi", Tibetan: "bo", Sanskrit: "sa", Punjabi: "pa",
  Italian: "it", Dutch: "nl", Polish: "pl", Ukrainian: "uk",
  Vietnamese: "vi", Thai: "th", Swahili: "sw", Pashto: "ps",
  Malay: "ms", Tamil: "ta", Telugu: "te", Marathi: "mr",
  Gujarati: "gu", Filipino: "fil", Bilingual: "mul",
};

export function languageToBcp47(language: string): string {
  return LANGUAGE_TAGS[language] ?? "und";
}
