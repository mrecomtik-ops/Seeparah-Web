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
