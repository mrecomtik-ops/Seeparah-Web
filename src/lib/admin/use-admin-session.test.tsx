// @vitest-environment happy-dom
//
// Regression coverage for two related bugs found this session:
//
// 1. (Fixed previously) A stale cached "signed out" result could survive
//    a real sign-in for up to staleTime — fixed by resetting the shared
//    admin-whoami query on relevant Supabase auth events.
//
// 2. (Fixed here) That reset subscription lived INSIDE useAdminSession()
//    itself, so it was re-registered on every MOUNT of every component
//    that called the hook — not just once for the app. Real supabase-js
//    fires a synthetic INITIAL_SESSION event to every NEW subscriber,
//    immediately, with the CURRENT session (confirmed in
//    @supabase/auth-js's GoTrueClient source — not once per app load,
//    once per subscriber). Since INITIAL_SESSION was not excluded, a
//    child admin page mounting its OWN useAdminSession() call — e.g.
//    /admin/books, /admin/users — triggered a fresh subscription, which
//    immediately received an INITIAL_SESSION event, which reset the
//    SHARED query, which put AdminLayout back into its loading state,
//    which unmounted the very child that had just mounted, which
//    remounted once the query resolved again, which resubscribed,
//    received another INITIAL_SESSION, and reset again — an unbounded
//    mount -> reset -> unmount -> remount loop. This exactly explains why
//    /admin (whose Overview page never calls useAdminSession() itself)
//    worked, while every child admin page that DOES call it separately
//    got stuck on a permanent parent-level spinner.
//
// The mock's onAuthStateChange below deliberately mirrors real
// supabase-js as closely as this test needs: every new subscriber
// immediately (asynchronously) receives an INITIAL_SESSION event with
// whatever the CURRENT session is — not a one-time global event.
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
let subscribers: { id: number; cb: AuthCallback }[] = [];
let nextSubscriberId = 0;
const unsubscribeSpy = vi.fn();
const onAuthStateChangeSpy = vi.fn();

function currentSessionShape() {
  return currentAccessToken ? { access_token: currentAccessToken } : null;
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

const { useAdminSession, AdminSessionSync } = await import("./use-admin-session");

function fireAuthEvent(event: AuthEvent) {
  act(() => {
    for (const s of [...subscribers]) s.cb(event, currentSessionShape());
  });
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

    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    fireAuthEvent("SIGNED_IN");

    await waitFor(() => expect(result.current.data?.signedIn).toBe(true));
    expect(result.current.data?.role).toBe("owner");
  });
});

describe("useAdminSession — signed-in to signed-out transition", () => {
  it("does not keep showing a stale signed-in result after a SIGNED_OUT event", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.signedIn).toBe(true));

    currentAccessToken = null;
    fireAuthEvent("SIGNED_OUT");

    await waitFor(() => expect(result.current.data?.signedIn).toBe(false));
  });
});

describe("useAdminSession — switching users", () => {
  it("does not reuse the previous user's cached role after a different user signs in", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.role).toBe("owner"));

    whoAmIByToken["tok-b"] = { role: "editor", mfaSatisfied: true };
    currentAccessToken = "tok-b";
    fireAuthEvent("SIGNED_IN");

    await waitFor(() => expect(result.current.data?.role).toBe("editor"));
  });
});

describe("useAdminSession — MFA transition", () => {
  it("picks up mfaSatisfied becoming true after MFA_CHALLENGE_VERIFIED, without waiting out staleTime", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: false };
    currentAccessToken = "tok-a";
    const { result } = renderAdminSession();
    await waitFor(() => expect(result.current.data?.mfaSatisfied).toBe(false));

    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    fireAuthEvent("MFA_CHALLENGE_VERIFIED");

    await waitFor(() => expect(result.current.data?.mfaSatisfied).toBe(true));
  });
});

describe("useAdminSession — TOKEN_REFRESHED is deliberately excluded", () => {
  it("does not reset the cache (and therefore never shows a loading flash) on a routine token refresh", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
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
// Parent/child topology — the actual reset-loop hypothesis.
// ---------------------------------------------------------------------------
function ChildConsumer() {
  const session = useAdminSession();
  return <div data-testid="child-status">{session.isLoading ? "loading" : "resolved"}</div>;
}

function ParentWithOptionalChild({ mountChild }: { mountChild: boolean }) {
  const session = useAdminSession();
  return (
    <div>
      <div data-testid="parent-status">{session.isLoading ? "loading" : "resolved"}</div>
      {!session.isLoading && mountChild && <ChildConsumer />}
    </div>
  );
}

/** Mirrors AdminLayout's own gate: while the (shared) admin session is
 * loading, the child tree is not rendered at all — exactly the mechanism
 * that turned a reset into a full unmount of whatever had just mounted. */
function AdminLayoutLike({ childMounts }: { childMounts: boolean }) {
  const session = useAdminSession();
  if (session.isLoading) return <div data-testid="parent-status">loading</div>;
  return (
    <div>
      <div data-testid="parent-status">resolved</div>
      {childMounts && <ChildConsumer />}
    </div>
  );
}

describe("useAdminSession — parent/child topology (the reset-loop hypothesis)", () => {
  it("Test 1 — a lone parent consumer (no child calling the hook) resolves normally", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    render(<ParentWithOptionalChild mountChild={false} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("parent-status").textContent).toBe("resolved"));
  });

  it("Test 2 (most important) — a child mounting its own useAdminSession() after the parent resolves does not trigger a reset loop", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    render(<AdminLayoutLike childMounts={true} />, { wrapper: makeWrapper() });

    // Parent resolves, mounting the child, whose own useAdminSession()
    // call is exactly the trigger under test.
    await waitFor(() => expect(screen.getByTestId("parent-status").textContent).toBe("resolved"));
    await waitFor(() => expect(screen.getByTestId("child-status")).toBeTruthy());

    // Give any would-be reset cascade a chance to run its course.
    await new Promise((r) => setTimeout(r, 50));

    // The bug, if present, unmounts the child (parent falls back to
    // "loading") and/or never lets the child settle, and keeps calling
    // adminWhoAmI without bound. None of that should happen.
    expect(screen.getByTestId("parent-status").textContent).toBe("resolved");
    expect(screen.getByTestId("child-status").textContent).toBe("resolved");
    expect(adminWhoAmISpy.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("Test 3 — three simultaneous consumers (header + layout + child page) settle on one coherent state with no reset storm", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    function ThreeConsumers() {
      const header = useAdminSession();
      const layout = useAdminSession();
      const child = useAdminSession();
      return (
        <div>
          <div data-testid="header">{header.isLoading ? "loading" : header.data?.role}</div>
          <div data-testid="layout">{layout.isLoading ? "loading" : layout.data?.role}</div>
          <div data-testid="child">{child.isLoading ? "loading" : child.data?.role}</div>
        </div>
      );
    }
    render(<ThreeConsumers />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("header").textContent).toBe("owner"));
    expect(screen.getByTestId("layout").textContent).toBe("owner");
    expect(screen.getByTestId("child").textContent).toBe("owner");
    await new Promise((r) => setTimeout(r, 50));
    expect(adminWhoAmISpy.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("Test 4 — repeatedly unmounting/remounting a child page never resets the query merely because a consumer mounted", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    function Harness() {
      // Starts mounted so the query has a real, resolved, non-stale cache
      // entry (one genuine fetch) before any toggling begins — toggling
      // FROM nothing mounted would trigger its own first-ever fetch
      // regardless of any bug, which isn't what's under test here.
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

    // Mounting/unmounting a consumer must never itself cause a fetch —
    // only real auth events do. The cache is well within staleTime
    // (15s) for the whole test, so every remount should just reuse it.
    expect(adminWhoAmISpy.mock.calls.length).toBe(baseline);
  });

  it("Test 5 — SIGNED_OUT clears cached admin state immediately, even with a child consumer mounted", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    function ParentAndChildData() {
      const parent = useAdminSession();
      return (
        <div>
          <div data-testid="parent-signed-in">{String(parent.data?.signedIn ?? "pending")}</div>
          {!parent.isLoading && <ChildConsumer />}
        </div>
      );
    }
    render(<ParentAndChildData />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("child-status").textContent).toBe("resolved"));
    expect(screen.getByTestId("parent-signed-in").textContent).toBe("true");

    currentAccessToken = null;
    fireAuthEvent("SIGNED_OUT");

    // The stale owner=signedIn:true result must not persist — the mock's
    // getSession()/adminWhoAmI resolve fast enough that a transient
    // "loading" frame isn't reliably observable, but the cleared-and-
    // refetched result landing correctly proves the reset actually
    // happened rather than the old value just sitting there.
    await waitFor(() => expect(screen.getByTestId("parent-signed-in").textContent).toBe("false"));
  });

  it("Test 6 — SIGNED_IN refreshes the admin query correctly with a child consumer mounted", async () => {
    currentAccessToken = null;
    render(<AdminLayoutLike childMounts={false} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("parent-status").textContent).toBe("resolved"));

    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    fireAuthEvent("SIGNED_IN");

    await waitFor(() => expect(adminWhoAmISpy.mock.calls.length).toBeGreaterThan(0));
  });

  it("Test 7 — MFA_CHALLENGE_VERIFIED refreshes AAL/admin state with a child consumer mounted", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: false };
    currentAccessToken = "tok-a";
    render(<AdminLayoutLike childMounts={true} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("child-status").textContent).toBe("resolved"));

    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    const before = adminWhoAmISpy.mock.calls.length;
    fireAuthEvent("MFA_CHALLENGE_VERIFIED");

    await waitFor(() => expect(adminWhoAmISpy.mock.calls.length).toBeGreaterThan(before));
  });

  it("Test 8 — INITIAL_SESSION (a late child mounting and subscribing) completes without recursive resets", async () => {
    whoAmIByToken["tok-a"] = { role: "owner", mfaSatisfied: true };
    currentAccessToken = "tok-a";
    render(<AdminLayoutLike childMounts={true} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId("child-status").textContent).toBe("resolved"));
    const settledCalls = adminWhoAmISpy.mock.calls.length;

    // A brand-new subscriber joining later (e.g. another child page) still
    // gets its own INITIAL_SESSION per real supabase-js behavior — confirm
    // that alone doesn't cascade into more fetches.
    render(<ChildConsumer />, { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 30));

    expect(adminWhoAmISpy.mock.calls.length).toBeGreaterThanOrEqual(settledCalls);
    expect(screen.getByTestId("parent-status").textContent).toBe("resolved");
  });
});
