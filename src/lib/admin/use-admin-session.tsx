import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
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

/** Auth events this hard-resets on unconditionally — clears the cached
 * value entirely, so every consumer goes back to a genuine loading state
 * until a fresh fetch resolves. Reserved for events where the OLD data
 * must never be allowed to remain authoritative even for an instant:
 * - SIGNED_OUT: unambiguous — going from someone to no-one.
 * - PASSWORD_RECOVERY: a recovery session can belong to a different
 *   account than whoever was previously signed in on this browser; rare
 *   enough that a full spinner is not a real UX cost.
 * SIGNED_IN is handled separately, below — see its own comment. */
const HARD_RESET_EVENTS: ReadonlySet<AuthChangeEvent> = new Set([
  "SIGNED_OUT",
  "PASSWORD_RECOVERY",
]);

/** Auth events that mark the CURRENT (already-known) identity's own data
 * as possibly-stale, without the identity itself having changed: soft-
 * invalidate (background refetch, existing data stays visible and
 * authoritative-looking until the fresh result lands) rather than a hard
 * reset that would flash the whole admin shell back to a loading
 * spinner for no visible reason.
 * - USER_UPDATED: the signed-in user's own auth record changed — by
 *   definition the same identity.
 * - MFA_CHALLENGE_VERIFIED: an AAL bump for the same identity, not a
 *   different one. AdminMfaGate already calls sessionQuery.refetch()
 *   directly for the interactive case; this is the background-consistency
 *   backstop for any other mounted consumer. */
const SOFT_INVALIDATE_EVENTS: ReadonlySet<AuthChangeEvent> = new Set([
  "USER_UPDATED",
  "MFA_CHALLENGE_VERIFIED",
]);

/** Mount this exactly ONCE for the whole app — see <AdminSessionSync /> in
 * __root.tsx — never per useAdminSession() consumer.
 *
 * HISTORY — two real bugs found and fixed here, in order:
 *
 * 1. This subscription used to live INSIDE useAdminSession() itself,
 *    running once per MOUNT of every component that called the hook
 *    (AppHeader, AdminLayout, and every individual admin sub-page: books,
 *    users, research, support, settings, health). Since Supabase fires a
 *    synthetic INITIAL_SESSION event to every NEW onAuthStateChange
 *    subscriber (confirmed in @supabase/auth-js's GoTrueClient source:
 *    onAuthStateChange() unconditionally schedules _emitInitialSession()
 *    for every registration — not once per app load, once per
 *    subscriber) and INITIAL_SESSION was not excluded, a child admin
 *    page mounting its own useAdminSession() call triggered a fresh
 *    subscription, which immediately received its own INITIAL_SESSION,
 *    which reset the SHARED query, which made AdminLayout's loading gate
 *    unmount the very child that had just mounted (and its
 *    subscription), which remounted once the query resolved again,
 *    resubscribed, received another INITIAL_SESSION, and reset again —
 *    an unbounded mount -> reset -> unmount -> remount loop. Fixed by
 *    moving the subscription here (mounted exactly once) and excluding
 *    INITIAL_SESSION, which is redundant anyway: the query's own queryFn
 *    calls getSession(), which awaits the same initializePromise
 *    INITIAL_SESSION is itself gated on.
 *
 * 2. Even with exactly one global listener, a SECOND real bug remained:
 *    SIGNED_IN does not mean "someone just signed in" as reliably as the
 *    name suggests. Confirmed directly in @supabase/auth-js's
 *    GoTrueClient source: `_onVisibilityChanged` calls
 *    `_recoverAndRefresh()` every time the browser tab regains focus
 *    (`visibilitychange` -> visible), and `_recoverAndRefresh()` fires a
 *    SIGNED_IN event whenever it finds an already-valid session in
 *    storage — which is the ordinary case for an admin who simply
 *    tabbed away and back. Treating every SIGNED_IN as a brand-new
 *    identity and hard-resetting on it meant switching tabs and coming
 *    back could tear down the whole admin shell and show a full-page
 *    spinner for a session that never actually changed — exactly the
 *    kind of interruption an admin doing real work (checking something
 *    in another tab while on /admin/books or /admin/settings) would
 *    hit. Fixed below: SIGNED_IN compares the incoming session's user id
 *    against the last one this listener actually saw. Same id -> soft
 *    invalidate (background refetch, existing data stays visible).
 *    Different id, or no prior id recorded yet -> hard reset, since that
 *    IS a genuine identity change (or the first-ever event this
 *    listener has seen, where "assume nothing changed" would be the
 *    unsafe default) and old role/capability data must never be allowed
 *    to remain authoritative for a different account. This baseline is
 *    also seeded from INITIAL_SESSION itself (identity only — it still
 *    never resets or invalidates the query, per point 1 above): without
 *    that, an already signed-in visitor's very first real SIGNED_IN
 *    after page load (their first tab-focus reaffirmation) would have no
 *    prior id to compare against and hard-reset anyway, silently
 *    reintroducing the exact disruption this fix exists to remove. */
export function useAdminSessionAuthSync() {
  const queryClient = useQueryClient();
  // Deliberately a ref, not state: this is bookkeeping for the event
  // handler's own logic, not something that should ever trigger a
  // re-render on its own.
  const lastKnownUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_IN") {
        const newUserId = session?.user.id ?? null;
        const sameIdentity =
          lastKnownUserId.current !== undefined && lastKnownUserId.current === newUserId;
        lastKnownUserId.current = newUserId;
        if (sameIdentity) {
          queryClient.invalidateQueries({ queryKey: ADMIN_WHOAMI_QUERY_KEY });
        } else {
          queryClient.resetQueries({ queryKey: ADMIN_WHOAMI_QUERY_KEY });
        }
        return;
      }
      if (event === "SIGNED_OUT") {
        lastKnownUserId.current = null;
      }
      if (event === "INITIAL_SESSION") {
        // Seeds the identity baseline WITHOUT resetting/invalidating
        // anything — INITIAL_SESSION itself stays a pure no-op for the
        // query (see the module comment for why). But leaving
        // lastKnownUserId at its initial `undefined` here was its own
        // real gap: on a normal page load for an ALREADY signed-in
        // visitor, INITIAL_SESSION is the only event this listener sees
        // before the first later SIGNED_IN (e.g. the first tab-focus
        // reaffirmation) — with no baseline recorded, that SIGNED_IN
        // would be treated as "no prior identity to compare against" and
        // hard-reset, exactly the disruptive full-shell spinner this
        // whole mechanism exists to avoid. Recording the identity here
        // means the very first real SIGNED_IN after load can already be
        // correctly recognized as a reaffirmation.
        lastKnownUserId.current = session?.user.id ?? null;
      }
      if (HARD_RESET_EVENTS.has(event)) {
        queryClient.resetQueries({ queryKey: ADMIN_WHOAMI_QUERY_KEY });
      } else if (SOFT_INVALIDATE_EVENTS.has(event)) {
        queryClient.invalidateQueries({ queryKey: ADMIN_WHOAMI_QUERY_KEY });
      }
      // TOKEN_REFRESHED: still a full no-op, including for the identity
      // baseline — it never changes who's signed in.
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
 * not live here).
 *
 * Call this from AdminLayout only. Every admin CHILD route should use
 * useResolvedAdminSession() instead (below) — it reads the SAME already-
 * resolved result AdminLayout obtained, via context, rather than
 * mounting a second independent query observer for information the
 * parent already has. This isn't just deduplication: it removes any
 * possibility of a child page's own observer interacting with the
 * shared query's lifecycle in a way that's subtle to reason about. */
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

// ---------------------------------------------------------------------------
// Resolved-session context — for admin CHILD routes. AdminLayout is the
// only component that calls useAdminSession() (the actual query); every
// route rendered through its <Outlet /> reads the same already-resolved
// result via useResolvedAdminSession() instead of re-querying.
// ---------------------------------------------------------------------------
const AdminSessionContext = createContext<AdminSession | undefined>(undefined);

export function AdminSessionProvider({
  session,
  children,
}: {
  session: AdminSession;
  children: ReactNode;
}) {
  return <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>;
}

/** For admin child routes that only need the already-resolved parent
 * session for UI-only capability checks (show/hide a Publish button, a
 * category-management control, a recovery action, a settings control —
 * never for authorizing anything: every server function still calls
 * requireAdmin() itself, independent of whatever this returns). Throws
 * if rendered outside <AdminSessionProvider> (i.e. outside AdminLayout's
 * <Outlet />) rather than silently falling back to "no capabilities" —
 * a missing provider should be a loud bug, not a control that quietly
 * hides itself with no explanation. */
export function useResolvedAdminSession(): AdminSession {
  const session = useContext(AdminSessionContext);
  if (session === undefined) {
    throw new Error(
      "useResolvedAdminSession() was called outside <AdminSessionProvider> — it must be used from a route rendered through AdminLayout's <Outlet />, not standalone.",
    );
  }
  return session;
}
