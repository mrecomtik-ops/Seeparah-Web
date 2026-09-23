import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminWhoAmI } from "@/lib/admin/session.functions";
import type { AdminRole, Capability } from "@/lib/admin/permissions";

export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error("Sign in required");
  return t;
}

export interface AdminSession {
  signedIn: boolean;
  role: AdminRole | null;
  mfaSatisfied: boolean;
  capabilities: Capability[];
}

export const ADMIN_WHOAMI_QUERY_KEY = ["admin-whoami"];

/** This is purely a UI-decision cache (nav items, MFA prompt, "Sign in
 * required" vs. the real shell) — server-side authorization never trusts
 * it; every mutation re-derives identity/role/AAL fresh via requireAdmin.
 *
 * The query key is intentionally NOT scoped to the current user. What
 * keeps it correct across a sign-in/sign-out/user-switch/MFA transition
 * is the effect below, not the key: this hook is called from many places
 * that mount at different times relative to auth changing (AppHeader
 * renders on every route, so its own useAdminSession() call is very
 * often the FIRST fetch under this key — possibly while the visitor is
 * still signed out, or before Supabase finishes restoring a session from
 * storage on initial load). Without an explicit tie to Supabase's own
 * auth events, that fetch stays "fresh enough" for staleTime and gets
 * reused by every other consumer of this same key — including
 * admin/route.tsx's own signed-in gate — showing "Sign in required" (or,
 * symmetrically, a stale signed-in shell after signing out, or a
 * different user's cached role after switching accounts) until staleTime
 * happens to lapse on some later remount and a background refetch
 * quietly corrects it.
 *
 * resetQueries (not invalidateQueries) is deliberate: reset clears the
 * cached value and puts every consumer back into a genuine loading state
 * immediately, so nothing stale is ever rendered even for the instant
 * before the refetch resolves — invalidateQueries alone would keep
 * serving the stale value while refetching in the background, which is
 * exactly the bug.
 *
 * TOKEN_REFRESHED is the one event deliberately excluded: it rotates the
 * access token on Supabase's own timer (roughly hourly) without changing
 * who's signed in or their AAL, and fires routinely during normal use —
 * resetting on it would flash the whole admin shell back to a loading
 * spinner while an admin is mid-session for no reason. Every other event
 * (SIGNED_IN, SIGNED_OUT, INITIAL_SESSION, MFA_CHALLENGE_VERIFIED,
 * USER_UPDATED, PASSWORD_RECOVERY, and anything Supabase adds later) can
 * change who's signed in or their admin status, so all of them reset it. */
export function useAdminSession() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      queryClient.resetQueries({ queryKey: ADMIN_WHOAMI_QUERY_KEY });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  return useQuery<AdminSession>({
    queryKey: ADMIN_WHOAMI_QUERY_KEY,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken)
        return { signedIn: false, role: null, mfaSatisfied: false, capabilities: [] };
      return adminWhoAmI({ data: { accessToken } });
    },
    staleTime: 15_000,
  });
}

export function can(session: AdminSession | undefined, capability: Capability): boolean {
  return session?.capabilities.includes(capability) ?? false;
}
