// Shared "return to where you were" validation for the sign-in flow. A
// redirect target is only ever trusted if it is a same-origin path — never
// an absolute URL, and never a protocol-relative one, so a crafted
// `/auth?redirect=` value (or a compromised link) can never send a reader
// off Seeparah after they sign in.
export const DEFAULT_POST_AUTH_REDIRECT = "/library";

export function isSafeRedirectPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  // Exactly one leading slash: rejects absolute URLs ("https://..."),
  // scheme-relative ones ("//evil.com" — browsers treat this as a full URL
  // using the current scheme), and the backslash variant ("/\evil.com")
  // some browsers normalize to the same thing.
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return true;
}

export function resolveAuthRedirect(value: unknown): string {
  return isSafeRedirectPath(value) ? value : DEFAULT_POST_AUTH_REDIRECT;
}
