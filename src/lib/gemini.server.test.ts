import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();

vi.mock("@google/genai", () => ({
  // A real constructor function, not an arrow function — arrow functions
  // can never be invoked with `new`, which is exactly what the SDK client
  // construction does.
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAIMock(this: {
    models: { generateContent: typeof generateContentMock };
  }) {
    this.models = { generateContent: generateContentMock };
  }),
  Type: { OBJECT: "OBJECT", STRING: "STRING", BOOLEAN: "BOOLEAN" },
}));

const { translateSectionWithGemini } = await import("@/lib/gemini.server");

describe("translateSectionWithGemini (mocked provider — no live calls)", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    generateContentMock.mockReset();
    process.env["GEMINI_API_KEY"] = "test-key-not-real";
    process.env["GEMINI_TRANSLATION_MODEL"] = "gemini-test-model";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts a well-formed structured response and echoes usage", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ section_id: "3", translated_text: "Bonjour le monde." }),
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });
    const result = await translateSectionWithGemini({
      sectionId: "3",
      systemInstruction: "system",
      userPrompt: "user",
    });
    expect(result.translatedText).toBe("Bonjour le monde.");
    expect(result.promptTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
  });

  it("rejects a response whose section_id doesn't match what was requested", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ section_id: "wrong-id", translated_text: "Bonjour." }),
    });
    await expect(
      translateSectionWithGemini({ sectionId: "3", systemInstruction: "s", userPrompt: "u" }),
    ).rejects.toThrow(/section_id/);
  });

  it("rejects an empty response instead of treating it as success", async () => {
    generateContentMock.mockResolvedValue({ text: "", candidates: [{ finishReason: "SAFETY" }] });
    await expect(
      translateSectionWithGemini({ sectionId: "0", systemInstruction: "s", userPrompt: "u" }),
    ).rejects.toThrow(/empty/i);
  });

  it("rejects malformed JSON instead of guessing at the content", async () => {
    generateContentMock.mockResolvedValue({ text: "not json at all" });
    await expect(
      translateSectionWithGemini({ sectionId: "0", systemInstruction: "s", userPrompt: "u" }),
    ).rejects.toThrow(/malformed/i);
  });

  it("surfaces a safety block as a failure, never as a successful translation", async () => {
    generateContentMock.mockResolvedValue({
      promptFeedback: { blockReason: "SAFETY" },
    });
    await expect(
      translateSectionWithGemini({ sectionId: "0", systemInstruction: "s", userPrompt: "u" }),
    ).rejects.toThrow(/blocked/i);
  });

  it("refuses to run without GEMINI_API_KEY configured", async () => {
    delete process.env["GEMINI_API_KEY"];
    await expect(
      translateSectionWithGemini({ sectionId: "0", systemInstruction: "s", userPrompt: "u" }),
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
