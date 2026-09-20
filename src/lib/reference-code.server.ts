import { randomBytes } from "node:crypto";

// No ambiguous characters (0/O, 1/I) — this is read aloud/typed back by
// visitors referencing a support request, not just displayed on screen.
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REF_LENGTH = 8;

/** A short, visitor-facing tracking code — deliberately distinct from the
 * row's internal UUID (never shown to visitors). Not a secret; safe to
 * return to the browser and to email. Uniqueness is enforced at the
 * database level (a partial unique index), not just by this function's
 * entropy — callers should be prepared to retry on a rare collision. */
export function generateReferenceCode(): string {
  const bytes = randomBytes(REF_LENGTH);
  let code = "";
  for (const byte of bytes) {
    code += REF_ALPHABET.charAt(byte % REF_ALPHABET.length);
  }
  return `SPRH-${code}`;
}
