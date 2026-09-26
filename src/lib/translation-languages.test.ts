import { describe, expect, it } from "vitest";
import {
  LANGUAGES,
  REQUESTABLE_TRANSLATION_LANGUAGES,
  isRequestableTranslationLanguage,
} from "@/lib/data";
import { validateTranslationOutput } from "@/lib/translation";

describe("supported translation languages", () => {
  it("lets readers request the major languages explicitly requested for Seeparah", () => {
    for (const language of ["Urdu", "Hindi", "Arabic", "Russian", "Chinese"]) {
      expect(isRequestableTranslationLanguage(language)).toBe(true);
      expect(REQUESTABLE_TRANSLATION_LANGUAGES).toContain(language);
    }
  });

  it("keeps requestable targets aligned with the supported language catalog", () => {
    expect(REQUESTABLE_TRANSLATION_LANGUAGES).toEqual(LANGUAGES);
  });

  it("rejects arbitrary target-language names", () => {
    expect(isRequestableTranslationLanguage("Klingon")).toBe(false);
    expect(isRequestableTranslationLanguage("Unknown")).toBe(false);
  });

  it("recognizes representative scripts in the expanded validation layer", () => {
    expect(
      validateTranslationOutput({
        targetLanguage: "Bengali",
        sourceLanguage: "English",
        sourceText: "This is a sufficiently long source sentence used for translation validation.",
        translatedText: "এটি অনুবাদ যাচাইয়ের জন্য একটি যথেষ্ট দীর্ঘ বাংলা বাক্য।",
      }).ok,
    ).toBe(true);

    expect(
      validateTranslationOutput({
        targetLanguage: "Japanese",
        sourceLanguage: "English",
        sourceText: "This is a sufficiently long source sentence used for translation validation.",
        translatedText: "これは翻訳の検証に使用する十分に長い日本語の文章です。",
      }).ok,
    ).toBe(true);

    expect(
      validateTranslationOutput({
        targetLanguage: "Persian",
        sourceLanguage: "English",
        sourceText: "This is a sufficiently long source sentence used for translation validation.",
        translatedText: "این یک جمله فارسی به اندازه کافی طولانی برای بررسی ترجمه است.",
      }).ok,
    ).toBe(true);
  });
});
