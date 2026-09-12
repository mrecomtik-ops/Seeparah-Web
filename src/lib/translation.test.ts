import { describe, expect, it } from "vitest";
import { retryDelayMs, validateTranslationOutput } from "@/lib/translation";

describe("validateTranslationOutput", () => {
  const sourceText =
    "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families.";

  it("rejects empty output", () => {
    const result = validateTranslationOutput({
      targetLanguage: "French",
      sourceLanguage: "English",
      sourceText,
      translatedText: "",
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("empty_output");
  });

  it("rejects the model echoing the English source back for a French request", () => {
    // This is the exact failure mode reported: requested French, got English.
    const result = validateTranslationOutput({
      targetLanguage: "French",
      sourceLanguage: "English",
      sourceText,
      translatedText: sourceText,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("untranslated_source_fallback");
  });

  it("accepts a genuine French translation", () => {
    const result = validateTranslationOutput({
      targetLanguage: "French",
      sourceLanguage: "English",
      sourceText,
      translatedText:
        "C'est une vérité universellement reconnue qu'un célibataire pourvu d'une belle fortune doit avoir envie de se marier. Si peu que l'on connaisse les sentiments ou les vues d'un tel homme à son arrivée dans un voisinage, cette vérité est si bien fixée dans l'esprit des familles d'alentour.",
      });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects Urdu output that is actually in the wrong script", () => {
    const result = validateTranslationOutput({
      targetLanguage: "Urdu",
      sourceLanguage: "English",
      sourceText,
      translatedText: "This is just English text pretending to be a translation into Urdu for testing purposes today.",
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("wrong_script_for_target_language");
  });

  it("accepts genuine Urdu script output", () => {
    const result = validateTranslationOutput({
      targetLanguage: "Urdu",
      sourceLanguage: "English",
      sourceText,
      translatedText:
        "یہ ایک مسلمہ حقیقت ہے کہ اچھی دولت کا مالک کنوارا مرد ضرور بیوی چاہتا ہوگا۔ ایسے شخص کے جذبات یا نظریات کتنے ہی پوشیدہ کیوں نہ ہوں۔",
    });
    expect(result.ok).toBe(true);
  });

  it("allows a legitimate proper noun in Latin script inside an Urdu passage", () => {
    const result = validateTranslationOutput({
      targetLanguage: "Urdu",
      sourceLanguage: "English",
      sourceText,
      translatedText:
        "مسٹر Darcy ایک امیر آدمی تھا اور یہ ایک مسلمہ حقیقت ہے کہ اچھی دولت کا مالک کنوارا مرد ضرور بیوی چاہتا ہوگا۔",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects obviously truncated output", () => {
    const result = validateTranslationOutput({
      targetLanguage: "French",
      sourceLanguage: "English",
      sourceText,
      translatedText: "Oui.",
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("truncated_output");
  });

  it("flags Spanish output that is actually still English", () => {
    const result = validateTranslationOutput({
      targetLanguage: "Spanish",
      sourceLanguage: "English",
      sourceText,
      translatedText:
        "The quick brown fox jumps over the lazy dog and this text does not contain any Spanish markers at all today.",
    });
    expect(result.ok).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("increases with attempt number and stays bounded", () => {
    const first = retryDelayMs(1);
    const second = retryDelayMs(2);
    const tenth = retryDelayMs(10);
    expect(second).toBeGreaterThan(first - 1000); // jitter-tolerant
    expect(tenth).toBeLessThanOrEqual(30 * 60_000 + 1000);
  });
});
