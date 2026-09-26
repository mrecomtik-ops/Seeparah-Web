export function friendlyTranslationError(message: string | null | undefined): string | null {
  if (!message) return null;
  const raw = message.trim();
  if (!raw) return null;

  if (/PERMISSION_DENIED|project has been denied access|\b403\b/i.test(raw)) {
    return "Google denied access to the Gemini project (403). Fix the provider/account access before retrying this job.";
  }
  if (/RESOURCE_EXHAUSTED|rate limit|\b429\b/i.test(raw)) {
    return "The translation provider rate-limited this job. Wait for the provider limit to recover before retrying.";
  }
  if (/GEMINI_API_KEY|API key not valid|API_KEY_INVALID/i.test(raw)) {
    return "The Gemini API key is missing or invalid in the translation worker runtime.";
  }

  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: number; status?: string };
    };
    if (parsed.error?.message) {
      const suffix = [
        parsed.error.code ? `code ${parsed.error.code}` : null,
        parsed.error.status ?? null,
      ]
        .filter(Boolean)
        .join(", ");
      return suffix ? `${parsed.error.message} (${suffix})` : parsed.error.message;
    }
  } catch {
    // Plain-text provider/application error: return it as-is.
  }

  return raw;
}
