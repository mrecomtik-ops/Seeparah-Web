import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthChangeEvent } from "@supabase/supabase-js";
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

/** Auth events that can change who's signed in or their admin status, and
 * so must reset the cached admin-whoami result rather than let it sit
 * until staleTime happens to lapse. Two deliberate exclusions:
 *
 * - TOKEN_REFRESHED rotates the access token on Supabase's own timer
 *   (roughly hourly) without changing who's signed in or their AAL, and
 *   fires routinely during normal use — resetting on it would flash the
 *   whole admin shell back to a loading spinner while an admin is
 *   mid-session for no reason.
 * - INITIAL_SESSION is Supabase's own "here's the current session" event,
 *   fired to EVERY new onAuthStateChange subscriber as soon as the
 *   client's initializePromise resolves — not once per app load, once
 *   PER SUBSCRIBER, with whatever the CURRENT session is at the moment
 *   they subscribe (confirmed in @supabase/auth-js's GoTrueClient
 *   source: onAuthStateChange() unconditionally schedules
 *   _emitInitialSession() for every registration). Resetting on it is
 *   also redundant: the query's own queryFn calls getSession(), which
 *   awaits that same initializePromise, so it already gets the
 *   correctly-restored session on its own first fetch without any help
 *   from this event.
 *
 * See useAdminSessionAuthSync()'s own comment for why INITIAL_SESSION
 * firing per-subscriber matters architecturally, not just as an event
 * to filter out. */
const RESET_ON_EVENTS: ReadonlySet<AuthChangeEvent> = new Set([
  "SIGNED_IN",
  "SIGNED_OUT",
  "USER_UPDATED",
  "MFA_CHALLENGE_VERIFIED",
  "PASSWORD_RECOVERY",
]);

/** Mount this exactly ONCE for the whole app — see <AdminSessionSync /> in
 * __root.tsx — never per useAdminSession() consumer.
 *
 * It used to live inside useAdminSession() itself, running once per
 * MOUNT of every component that called the hook (AppHeader, AdminLayout,
 * and — critically — every individual admin sub-page: books, users,
 * research, support, settings, health). That was a real bug, not just an
 * inefficiency: since INITIAL_SESSION fires to every NEW subscriber (see
 * RESET_ON_EVENTS' comment) and was, at the time, not excluded, mounting
 * a child admin page triggered its own fresh onAuthStateChange
 * subscription, which immediately received an INITIAL_SESSION event,
 * whose handler reset the SHARED admin-whoami query — including the
 * parent AdminLayout's already-resolved one. AdminLayout's loading gate
 * then unmounted the very child that had just mounted (and its
 * subscription), which, once the query resolved again, remounted that
 * same child, which subscribed again, received another INITIAL_SESSION,
 * and reset again — an unbounded mount -> reset -> unmount -> remount
 * loop, exactly matching the observed symptom: /admin (whose Overview
 * page never calls useAdminSession() itself) worked fine, while
 * /admin/books, /admin/users, and every other admin sub-page that DOES
 * call it separately got stuck on a permanent parent-level spinner.
 * Fixed by (a) making useAdminSession() a plain query hook with no
 * subscription of its own, so mounting/unmounting a consumer can never
 * register or fire a new onAuthStateChange listener, and (b) excluding
 * INITIAL_SESSION from the reset list regardless, since it's redundant
 * with the query's own initialization-aware queryFn — even a single
 * global listener has no real reason to act on it. */
export function useAdminSessionAuthSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!RESET_ON_EVENTS.has(event)) return;
      queryClient.resetQueries({ queryKey: ADMIN_WHOAMI_QUERY_KEY });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);
}

/** Mounted once, application-wide, in __root.tsx — renders nothing. Kept
 * as its own tiny component (rather than inlining the hook call at the
 * root) so the "exactly once" contract has a single, greppable place it
 * lives, instead of being one more statement lost inside RootComponent. */
export function AdminSessionSync() {
  useAdminSessionAuthSync();
  return null;
}

/** This is purely a UI-decision cache (nav items, MFA prompt, "Sign in
 * required" vs. the real shell) — server-side authorization never trusts
 * it; every mutation re-derives identity/role/AAL fresh via requireAdmin.
 * A plain query hook: no subscription of its own (see
 * useAdminSessionAuthSync() above for where that lives and why it must
 * not live here). Safe to call from as many components as need it. */
export function useAdminSession() {
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
