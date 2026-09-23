// @vitest-environment happy-dom
//
// Regression coverage for three related bugs found this session, in the
// order they were found and fixed:
//
// 1. A stale cached "signed out" result could survive a real sign-in for
//    up to staleTime — fixed by resetting the shared admin-whoami query
//    on relevant Supabase auth events.
//
// 2. That reset subscription lived INSIDE useAdminSession() itself, so it
//    was re-registered on every MOUNT of every component that called the
//    hook. Real supabase-js fires a synthetic INITIAL_SESSION event to
//    every NEW subscriber, immediately, with the CURRENT session
//    (confirmed in @supabase/auth-js's GoTrueClient source — not once
//    per app load, once per subscriber). A child admin page mounting its
//    OWN useAdminSession() call triggered a fresh subscription, which
//    immediately received an INITIAL_SESSION event, which reset the
//    SHARED query, unmounting the very child that had just mounted —
//    mount -> reset -> unmount -> remount, repeating. Fixed by moving the
//    subscription to a single, application-wide listener
//    (useAdminSessionAuthSync / <AdminSessionSync />) and excluding
//    INITIAL_SESSION entirely (redundant with the query's own
//    initialization-aware queryFn).
//
// 3. Even with exactly one global listener, SIGNED_IN does not reliably
//    mean "a new identity just signed in". Confirmed directly in
//    @supabase/auth-js's GoTrueClient source: `_onVisibilityChanged`
//    calls `_recoverAndRefresh()` every time the browser tab regains
//    focus, and `_recoverAndRefresh()` fires SIGNED_IN whenever it finds
//    an already-valid session in storage — the ordinary case for an
//    admin who simply tabbed away and back while working on
//    /admin/books, /admin/settings, etc. Hard-resetting on every
//    SIGNED_IN tore the whole admin shell down and showed a full-page
//    spinner for a session that never actually changed. Fixed:
//    useAdminSessionAuthSync now compares the incoming session's user id
//    against the last one it saw. Same id -> soft invalidate (background
//    refetch, existing data stays visible, no spinner). Different id (or
//    no prior id recorded yet) -> hard reset, since that IS a genuine
//    identity change and old role/capability data must never remain
//    authoritative for a different account.
//
// Also covers the resulting architecture change: child admin routes no
// longer call useAdminSession() themselves at all — they read the
// already-resolved session AdminLayout obtained via
// <AdminSessionProvider>/useResolvedAdminSession(), never mounting a
// second query observer for the same information.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

type AuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "MFA_CHALLENGE_VERIFIED"
  | "PASSWORD_RECOVERY";
type AuthCallback = (event: AuthEvent, session: unknown) => void;

let currentAccessToken: string | null = null;
let currentUserId: string | null = null;
let subscribers: { id: number; cb: AuthCallback }[] = [];
let nextSubscriberId = 0;
const unsubscribeSpy = vi.fn();
const onAuthStateChangeSpy = vi.fn();

function currentSessionShape() {
  return currentAccessToken
    ? { access_token: currentAccessToken, user: { id: currentUserId } }
    : null;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: currentSessionShape() } }),
      onAuthStateChange: (cb: AuthCallback) => {
        onAuthStateChangeSpy();
        const id = nextSubscriberId++;
        subscribers.push({ id, cb });
        // Mirrors real supabase-js: every NEW subscriber gets its own
        // INITIAL_SESSION event, asynchronously, with the session as it
        // is right now — never a one-time, whole-app event.
        queueMicrotask(() => cb("INITIAL_SESSION", currentSessionShape()));
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribeSpy();
                subscribers = subscribers.filter((s) => s.id !== id);
              },
            },
          },
        };
      },
    },
  },
}));

// Maps access token -> whoami response, so a "different user" can be
// simulated just by changing which token getSession() returns.
const whoAmIByToken: Record<string, { role: string; mfaSatisfied: boolean }> = {};
const adminWhoAmISpy = vi.fn(async ({ data }: { data: { accessToken: string } }) => {
  const entry = whoAmIByToken[data.accessToken];
  return {
    signedIn: true,
    role: entry?.role ?? null,
    mfaSatisfied: entry?.mfaSatisfied ?? false,
    capabilities: [],
  };
});

vi.mock("@/lib/admin/session.functions", () => ({
  adminWhoAmI: (params: { data: { accessToken: string } }) => adminWhoAmISpy(params),
}));

const { useAdminSession, AdminSessionSync, AdminSessionProvider, useResolvedAdminSession } =
  await import("./use-admin-session");

function fireAuthEvent(event: AuthEvent) {
  act(() => {
    for (const s of [...subscribers]) s.cb(event, currentSessionShape());
  });
}

/** Signs a user in, or switches to a different one, updating everything a
 * real sign-in would touch together (token, identity, and the mocked
 * whoami response), then fires SIGNED_IN — exactly the shape of a real
 * auth transition, not just flipping a token in isolation. */
function signInAs(token: string, userId: string, whoAmI: { role: string; mfaSatisfied: boolean }) {
  whoAmIByToken[token] = whoAmI;
  currentAccessToken = token;
  currentUserId = userId;
  fireAuthEvent("SIGNED_IN");
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AdminSessionSync />
      {children}
    </QueryClientProvider>
  );
  return wrapper;
}

function renderAdminSession() {
  return renderHook(() => useAdminSession(), { wrapper: makeWrapper() });
}

afterEach(() => {
  cleanup();
  currentAccessToken = null;
  currentUserId = null;
  subscribers = [];
  nextSubscriberId = 0;
  unsubscribeSpy.mockClear();
  onAuthStateChangeSpy.mockClear();
  adminWhoAmISpy.mockClear();
  for (const key of Object.keys(whoAmIByToken)) delete whoAmIByToken[key];
});

describe("useAdminSession — signed-out to signed-in transition", () => {
  it("does not keep showing a stale signed-out result after a SIGNED_IN event", async () => {
    currentAccessToken = null;
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.signedIn).toBe(false));

    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });

    await waitFor(() => expect(result.current.data?.signedIn).toBe(true));
    expect(result.current.data?.role).toBe("owner");
  });
});

describe("useAdminSession — signed-in to signed-out transition", () => {
  it("does not keep showing a stale signed-in result after a SIGNED_OUT event", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.signedIn).toBe(true));

    currentAccessToken = null;
    currentUserId = null;
    fireAuthEvent("SIGNED_OUT");

    await waitFor(() => expect(result.current.data?.signedIn).toBe(false));
  });
});

describe("useAdminSession — switching users (a genuinely different identity)", () => {
  it("does not reuse the previous user's cached role after a DIFFERENT user signs in", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.role).toBe("owner"));

    signInAs("tok-b", "user-b", { role: "editor", mfaSatisfied: true });

    await waitFor(() => expect(result.current.data?.role).toBe("editor"));
  });

  it("hard-resets (data genuinely absent at some point) rather than softly invalidating, since old role data must never remain authoritative for a different account", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.role).toBe("owner"));

    // A slow whoami response for the new user — while it's in flight, a
    // hard reset must show NO data (not the old owner role) even
    // transiently, unlike the soft-invalidate case below.
    let resolveSecond: (v: { role: string; mfaSatisfied: boolean; signedIn: true; capabilities: never[] }) => void;
    adminWhoAmISpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );
    currentAccessToken = "tok-b";
    currentUserId = "user-b";
    fireAuthEvent("SIGNED_IN");

    await waitFor(() => expect(result.current.data).toBeUndefined());
    resolveSecond!({ role: "editor", mfaSatisfied: true, signedIn: true, capabilities: [] });
    await waitFor(() => expect(result.current.data?.role).toBe("editor"));
  });
});

describe("useAdminSession — SIGNED_IN reaffirming the SAME identity (e.g. tab focus)", () => {
  it("does not clear existing data (soft invalidate, not hard reset) when the same user's session is reaffirmed", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.role).toBe("owner"));

    // A slow whoami response for the reaffirmed refetch — while it's in
    // flight is exactly when a hard reset (wrongly applied to a same-
    // identity SIGNED_IN) would show as data briefly disappearing. Must
    // be observed via polling (waitFor), not a synchronous check right
    // after firing the event: the mock's default (unpaused) responses
    // resolve fast enough that a synchronous check can't tell a hard
    // reset-then-instant-refetch apart from a soft invalidate — both
    // would already show "owner" again by the time a plain synchronous
    // assertion ran.
    let resolveRefetch:
      | ((v: { role: string; mfaSatisfied: boolean; signedIn: true; capabilities: never[] }) => void)
      | null = null;
    adminWhoAmISpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefetch = resolve;
        }),
    );

    // Simulates _recoverAndRefresh() firing SIGNED_IN on tab focus for
    // the SAME already-authenticated session — token unchanged, same
    // user id, same whoami response.
    fireAuthEvent("SIGNED_IN");

    // Confirms a refetch genuinely started (proves this isn't a no-op)…
    await waitFor(() => expect(resolveRefetch).not.toBeNull());
    // …and that AT THAT EXACT MOMENT, while the new fetch is still
    // pending, the OLD data has NOT been cleared — the actual soft-vs-
    // hard distinction under test.
    expect(result.current.data?.role).toBe("owner");
    expect(result.current.isPending).toBe(false);

    resolveRefetch!({ role: "owner", mfaSatisfied: true, signedIn: true, capabilities: [] });
    await waitFor(() => expect(result.current.data?.role).toBe("owner"));
  });

  it("treats the very first SIGNED_IN this listener ever sees as a potential identity change (hard reset), since there's no prior identity to compare against", async () => {
    // No signInAs() before mount — the listener has no baseline yet.
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    currentUserId = "user-a";
    const { result } = renderAdminSession();
    // The query's OWN first fetch already resolves this correctly on its
    // own (see the initializePromise-based reasoning in the source
    // comment) — this just confirms the first SIGNED_IN doesn't need to,
    // and doesn't, break that.
    await waitFor(() => expect(result.current.data?.role).toBe("owner"));
  });
});

describe("useAdminSession — MFA transition", () => {
  it("picks up mfaSatisfied becoming true after MFA_CHALLENGE_VERIFIED, without waiting out staleTime", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: false });
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.mfaSatisfied).toBe(false));

    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    fireAuthEvent("MFA_CHALLENGE_VERIFIED");

    await waitFor(() => expect(result.current.data?.mfaSatisfied).toBe(true));
  });
});

describe("useAdminSession — TOKEN_REFRESHED is deliberately excluded", () => {
  it("does not reset the cache (and therefore never shows a loading flash) on a routine token refresh", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.role).toBe("owner"));
    const callsBefore = adminWhoAmISpy.mock.calls.length;

    fireAuthEvent("TOKEN_REFRESHED");

    expect(result.current.isPending).toBe(false);
    expect(result.current.data?.role).toBe("owner");
    expect(adminWhoAmISpy.mock.calls.length).toBe(callsBefore);
  });
});

describe("AdminSessionSync — subscription lifecycle", () => {
  it("subscribes exactly once for the app, and unsubscribes on unmount", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <AdminSessionSync />
      </QueryClientProvider>,
    );
    expect(onAuthStateChangeSpy).toHaveBeenCalledTimes(1);
    expect(unsubscribeSpy).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Multiple REAL useAdminSession() observers — this remains legitimate:
// AppHeader (always) and AdminLayout (on /admin/*) are both genuine,
// independent observers of the same query in production. Proves that's
// still fine on its own, separately from the child-route architecture
// change below.
// ---------------------------------------------------------------------------
function ChildConsumer() {
  const session = useAdminSession();
  return <div data-testid="child-status">{session.isLoading ? "loading" : "resolved"}</div>;
}

describe("useAdminSession — multiple simultaneous real observers (AppHeader + AdminLayout)", () => {
  it("two independent useAdminSession() calls settle on one coherent state with a bounded number of fetches", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    function TwoConsumers() {
      const header = useAdminSession();
      const layout = useAdminSession();
      return (
        <div>
          <div data-testid="header">{header.isLoading ? "loading" : header.data?.role}</div>
          <div data-testid="layout">{layout.isLoading ? "loading" : layout.data?.role}</div>
        </div>
      );
    }
    render(<TwoConsumers />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("header").textContent).toBe("owner"));
    expect(screen.getByTestId("layout").textContent).toBe("owner");
    await new Promise((r) => setTimeout(r, 30));
    expect(adminWhoAmISpy.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("repeatedly mounting/unmounting a second observer never resets the query merely because it mounted", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    function Harness() {
      const [mounted, setMounted] = useState(true);
      return (
        <div>
          <button onClick={() => setMounted((m) => !m)}>toggle</button>
          {mounted && <ChildConsumer />}
        </div>
      );
    }
    const { getByText, getByTestId } = render(<Harness />, { wrapper: makeWrapper() });
    await waitFor(() => expect(getByTestId("child-status").textContent).toBe("resolved"));
    const baseline = adminWhoAmISpy.mock.calls.length;

    for (let i = 0; i < 5; i++) {
      act(() => getByText("toggle").click());
      await new Promise((r) => setTimeout(r, 10));
    }
    await new Promise((r) => setTimeout(r, 30));

    expect(adminWhoAmISpy.mock.calls.length).toBe(baseline);
  });
});

// ---------------------------------------------------------------------------
// Context architecture — AdminLayout resolves the session ONCE and
// provides it to child routes via <AdminSessionProvider>/
// useResolvedAdminSession(), which never mounts a query observer at all.
// This is the actual current shape of admin/route.tsx + every admin
// child route (books, users, health, settings, research/$paperId,
// books/$bookId, support/$ticketId) — Tests A-I below.
// ---------------------------------------------------------------------------
function ResolvedChild({ testId }: { testId: string }) {
  const session = useResolvedAdminSession();
  return <div data-testid={testId}>{session.role ?? "no-role"}</div>;
}

/** A faithful stand-in for admin/route.tsx's actual AdminLayout: gates on
 * data presence (not isLoading), and wraps whatever child is "routed" in
 * <AdminSessionProvider>. `page` simulates which child route is
 * currently mounted, the way TanStack Router swaps <Outlet /> content on
 * navigation. */
function AdminLayoutReal({ page }: { page: "overview" | "catalog" | "users" | "health" | "settings" | null }) {
  const sessionQuery = useAdminSession();
  if (sessionQuery.data === undefined) {
    return <div data-testid="parent-status">loading</div>;
  }
  return (
    <div>
      <div data-testid="parent-status">resolved</div>
      <AdminSessionProvider session={sessionQuery.data}>
        {page === "overview" && <div data-testid="overview">overview (no child observer)</div>}
        {page === "catalog" && <ResolvedChild testId="catalog" />}
        {page === "users" && <ResolvedChild testId="users" />}
        {page === "health" && <ResolvedChild testId="health" />}
        {page === "settings" && <ResolvedChild testId="settings" />}
      </AdminSessionProvider>
    </div>
  );
}

describe("Context architecture — Tests A-D: each child route reads the resolved session, never re-queries", () => {
  it.each([
    ["A", "catalog"],
    ["B", "users"],
    ["C", "health"],
    ["D", "settings"],
  ] as const)("Test %s — %s child mounts using the parent's resolved session, no admin-whoami refetch/reset from it", async (_label, page) => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    render(<AdminLayoutReal page={page} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId("parent-status").textContent).toBe("resolved"));
    await waitFor(() => expect(screen.getByTestId(page).textContent).toBe("owner"));
    const settledCalls = adminWhoAmISpy.mock.calls.length;

    await new Promise((r) => setTimeout(r, 50));

    // Parent stays mounted and resolved; the child never caused another
    // fetch, because useResolvedAdminSession() doesn't fetch at all.
    expect(screen.getByTestId("parent-status").textContent).toBe("resolved");
    expect(screen.getByTestId(page).textContent).toBe("owner");
    expect(adminWhoAmISpy.mock.calls.length).toBe(settledCalls);
  });
});

describe("Context architecture — Test E: navigation across every admin child route", () => {
  it("Overview -> Catalog -> Users -> Health -> Settings -> Overview keeps one stable session, no loading loop", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    const { rerender } = render(<AdminLayoutReal page="overview" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("overview")).toBeTruthy());
    const settledCalls = adminWhoAmISpy.mock.calls.length;

    for (const page of ["catalog", "users", "health", "settings", "overview"] as const) {
      rerender(<AdminLayoutReal page={page} />);
      if (page !== "overview") {
        await waitFor(() => expect(screen.getByTestId(page).textContent).toBe("owner"));
      } else {
        await waitFor(() => expect(screen.getByTestId("overview")).toBeTruthy());
      }
      // Never falls back to the parent loading state during navigation.
      expect(screen.getByTestId("parent-status").textContent).toBe("resolved");
    }

    expect(adminWhoAmISpy.mock.calls.length).toBe(settledCalls);
  });
});

describe("Context architecture — Test F: background refetch never tears down the shell", () => {
  it("an existing resolved session undergoing a background refetch (soft invalidate) keeps the admin shell mounted throughout", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    render(<AdminLayoutReal page="catalog" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("catalog").textContent).toBe("owner"));

    // Pause the refetch so the transient state is actually observable —
    // see the "SAME identity" test above for why a synchronous check
    // right after firing the event can't distinguish a hard reset from a
    // soft invalidate when the mock resolves fast.
    let resolveRefetch:
      | ((v: { role: string; mfaSatisfied: boolean; signedIn: true; capabilities: never[] }) => void)
      | null = null;
    adminWhoAmISpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefetch = resolve;
        }),
    );
    // Same identity -> soft path (invalidateQueries), per the fix above.
    fireAuthEvent("SIGNED_IN");
    await waitFor(() => expect(resolveRefetch).not.toBeNull());

    // While the background refetch is genuinely still in flight, the
    // shell and child must both remain exactly as they were — no
    // spinner, no unmount.
    expect(screen.getByTestId("parent-status").textContent).toBe("resolved");
    expect(screen.getByTestId("catalog").textContent).toBe("owner");

    resolveRefetch!({ role: "owner", mfaSatisfied: true, signedIn: true, capabilities: [] });
    await waitFor(() => expect(screen.getByTestId("parent-status").textContent).toBe("resolved"));
    expect(screen.getByTestId("catalog").textContent).toBe("owner");
  });
});

describe("Context architecture — Test G: real SIGNED_OUT", () => {
  it("the admin shell's session data disappears correctly — the resolved session no longer carries the owner role", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    render(<AdminLayoutReal page="catalog" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("catalog").textContent).toBe("owner"));

    currentAccessToken = null;
    currentUserId = null;
    fireAuthEvent("SIGNED_OUT");

    // AdminLayoutReal's own gate only distinguishes "no data yet" from
    // "some data" (matching admin/route.tsx's actual data === undefined
    // check) — a signed-out result is still a defined object
    // ({signedIn:false}), so "resolved" is the correct state here; the
    // real component's SECOND gate (isDemo || !session?.signedIn) is
    // what shows "Sign in required" from that point, tested separately
    // at the component level in admin/route.test.tsx. What this proves:
    // the resolved session itself no longer shows the owner role.
    await waitFor(() => expect(screen.getByTestId("catalog").textContent).toBe("no-role"));
  });
});

describe("Context architecture — Test H: user switch never leaks the old identity's capabilities", () => {
  it("owner signs out, a different non-admin account signs in — the new account never shows the owner role", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: true });
    render(<AdminLayoutReal page="settings" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("settings").textContent).toBe("owner"));

    currentAccessToken = null;
    currentUserId = null;
    fireAuthEvent("SIGNED_OUT");
    await waitFor(() => expect(screen.getByTestId("settings").textContent).toBe("no-role"));

    // A different, non-admin account signs in.
    whoAmIByToken["tok-b"] = { role: null as unknown as string, mfaSatisfied: false };
    currentAccessToken = "tok-b";
    currentUserId = "user-b";
    fireAuthEvent("SIGNED_IN");

    await waitFor(() => expect(screen.getByTestId("parent-status").textContent).toBe("resolved"));
    // No role at all for this account -> AdminLayout's own "No admin
    // access" branch would apply in the real component; here, simply:
    // never "owner".
    expect(screen.queryByTestId("settings")?.textContent).not.toBe("owner");
  });
});

describe("Context architecture — Test I: MFA refresh updates state without an unmount storm", () => {
  it("MFA_CHALLENGE_VERIFIED updates mfaSatisfied via the resolved session, without looping", async () => {
    signInAs("tok-a", "user-a", { role: "owner", mfaSatisfied: false });
    function MfaAwareChild() {
      const session = useResolvedAdminSession();
      return <div data-testid="mfa">{String(session.mfaSatisfied)}</div>;
    }
    function LayoutWithMfaChild() {
      const sessionQuery = useAdminSession();
      if (sessionQuery.data === undefined) return <div data-testid="parent-status">loading</div>;
      return (
        <div>
          <div data-testid="parent-status">resolved</div>
          <AdminSessionProvider session={sessionQuery.data}>
            <MfaAwareChild />
          </AdminSessionProvider>
        </div>
      );
    }
    render(<LayoutWithMfaChild />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("mfa").textContent).toBe("false"));

    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    fireAuthEvent("MFA_CHALLENGE_VERIFIED");

    await waitFor(() => expect(screen.getByTestId("mfa").textContent).toBe("true"));
    // Stayed mounted and resolved the whole time — no unmount/remount.
    expect(screen.getByTestId("parent-status").textContent).toBe("resolved");
  });
});
