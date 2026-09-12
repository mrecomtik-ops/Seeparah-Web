// Server-only. The single point of contact with Google Gemini. Everything
// else in the translation pipeline (translation.server.ts) is provider-
// agnostic and calls only translateSectionWithGemini() — swapping providers
// later means changing this one file, not the orchestration logic.
//
// Uses the official @google/genai SDK (googleapis/js-genai), not a proxy.
// Secret comes from GEMINI_API_KEY (server-only env var — see .env.example).
// Never import this module from client-rendered route components.
import { GoogleGenAI, Type } from "@google/genai";

const DEFAULT_MODEL = "gemini-flash-latest";

let cachedClient: GoogleGenAI | null = null;

function getApiKey(): string | undefined {
  return process.env["GEMINI_API_KEY"];
}

/** True when a Gemini key is configured. Never logs or returns the key
 * itself — callers use this only to decide whether to attempt a call. */
export function isGeminiConfigured(): boolean {
  return Boolean(getApiKey());
}

export function getTranslationModel(): string {
  return process.env["GEMINI_TRANSLATION_MODEL"]?.trim() || DEFAULT_MODEL;
}

function getClient(): GoogleGenAI {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "Gemini is not configured: GEMINI_API_KEY is missing. Set it in .env.local for local " +
        "development, or in the deployed server's secret configuration — see .env.example.",
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

const SECTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    section_id: {
      type: Type.STRING,
      description: "Echo back the exact section id you were given, unchanged.",
    },
    detected_source_language_ok: {
      type: Type.BOOLEAN,
      description: "True if the provided source text is actually in the stated source language.",
    },
    translated_text: {
      type: Type.STRING,
      description: "The full translation of the section, and nothing else.",
    },
  },
  required: ["section_id", "translated_text"],
};

export interface GeminiSectionTranslation {
  sectionId: string;
  translatedText: string;
  model: string;
  promptTokens: number | null;
  outputTokens: number | null;
}

/**
 * Translates one section and returns structured output validated against a
 * schema (stable section id echoed back, translated text). Throws on any
 * provider error, refusal, empty response, malformed JSON, or a mismatched
 * section id — callers (translation.server.ts) treat all of these as a
 * failed attempt eligible for retry with backoff, never as success.
 */
export async function translateSectionWithGemini(params: {
  sectionId: string;
  systemInstruction: string;
  userPrompt: string;
}): Promise<GeminiSectionTranslation> {
  const ai = getClient();
  const model = getTranslationModel();

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ text: `section_id: ${params.sectionId}\n\n${params.userPrompt}` }],
      },
    ],
    config: {
      systemInstruction: params.systemInstruction,
      responseMimeType: "application/json",
      responseSchema: SECTION_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blocked the request (${blockReason})`);
  }

  const text = response.text;
  if (!text || !text.trim()) {
    const finishReason = response.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned an empty response${finishReason ? ` (finishReason: ${finishReason})` : ""}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned malformed JSON output");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)["section_id"] !== "string" ||
    typeof (parsed as Record<string, unknown>)["translated_text"] !== "string"
  ) {
    throw new Error("Gemini response did not match the expected structured schema");
  }

  const sectionId = (parsed as Record<string, unknown>)["section_id"] as string;
  const translatedText = (parsed as Record<string, unknown>)["translated_text"] as string;

  if (sectionId !== params.sectionId) {
    throw new Error(
      `Gemini returned section_id "${sectionId}", expected "${params.sectionId}" — rejecting to avoid a section mismatch`,
    );
  }

  const usage = response.usageMetadata;
  return {
    sectionId,
    translatedText,
    model,
    promptTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage?.candidatesTokenCount ?? null,
  };
}

/**
 * Minimal live connectivity check — one short, cheap request. Used for
 * verifying configuration, never for bulk work. Returns the raw text so the
 * caller can confirm the key/model actually work end to end.
 */
export async function pingGemini(): Promise<{ model: string; text: string }> {
  const ai = getClient();
  const model = getTranslationModel();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: "Reply with exactly one word: pong" }] }],
    config: { temperature: 0 },
  });
  const text = response.text?.trim() ?? "";
  if (!text) throw new Error("Gemini returned an empty response to the connectivity check");
  return { model, text };
}
