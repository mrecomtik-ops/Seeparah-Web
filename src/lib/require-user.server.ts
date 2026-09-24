// Server-only. Verifies a Supabase access token and returns the real user id
// it belongs to. Never trust a client-supplied userId for anything
// security-sensitive (subscription state, premium content, job ownership) —
// always resolve it from the token instead.
export async function requireUserId(accessToken: string | null | undefined): Promise<string> {
  if (!accessToken) throw new Error("Unauthorized: no access token provided");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Unauthorized: invalid session");
  return data.user.id;
}

/** For guest-allowed endpoints that should still attach the real user id
 * when the caller happens to be signed in: verifies the token server-side
 * exactly like requireUserId, but returns null instead of throwing on a
 * missing/invalid token rather than rejecting the whole request — the
 * caller is choosing to allow anonymous submission, not to skip
 * verification of a token that IS present. Never trust a client-supplied
 * user id in place of this. */
export async function tryResolveUserId(
  accessToken: string | null | undefined,
): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
