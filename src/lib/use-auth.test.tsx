// @vitest-environment happy-dom
//
// Regression coverage for the browser-QA-reported bug: authenticated
// admin hard refreshes intermittently rendered "Sign in required". The
// admin-session cache fix (use-admin-session.ts) was real but incomplete
// -- this covers the second, independent bug: useAuth() used to resolve
// its initial state from supabase.auth.getUser(), a real network request
// to re-verify the JWT server-side. A transient failure of that request
// (more likely on a cold, direct page load than on a client-side
// navigation, which never re-runs this effect) was silently swallowed
// and left `user` at its initial null -- making isDemo true even though
// the browser held a perfectly valid persisted session. admin/route.tsx
// gates on `isDemo || !session?.signedIn`, so isDemo alone was enough to
// show "Sign in required" regardless of what useAdminSession correctly
// reported. Fixed by resolving initial state from getSession() (local,
// no network call) instead.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";

let getSessionImpl: () => Promise<{ data: { session: Session | null } }> = () =>
  Promise.resolve({ data: { session: null } });
let authStateCallback: ((event: string, session: Session | null) => void) | null = null;
const unsubscribeSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => getSessionImpl(),
      onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: unsubscribeSpy } } };
      },
    },
  },
}));

vi.mock("@/lib/library", () => ({ DEMO_USER_ID: "demo-reader" }));

const { useAuth } = await import("./use-auth");

const owner: User = {
  id: "owner-1",
  email: "owner@example.test",
  user_metadata: {},
} as unknown as User;

function sessionFor(user: User): Session {
  return { access_token: "tok", user } as unknown as Session;
}

afterEach(() => {
  cleanup();
  authStateCallback = null;
  unsubscribeSpy.mockClear();
  getSessionImpl = () => Promise.resolve({ data: { session: null } });
});

describe("useAuth — resolves initial state from getSession(), not getUser()", () => {
  it("recognizes a persisted authenticated session immediately, with no network round-trip required", async () => {
    getSessionImpl = () => Promise.resolve({ data: { session: sessionFor(owner) } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isDemo).toBe(false);
    expect(result.current.userId).toBe("owner-1");
  });

  // The original bug was specifically that a NETWORK call (getUser())
  // could fail transiently while a perfectly valid LOCAL session existed.
  // The fixed code never makes that network call at all for this purpose
  // -- there's nothing left to fail in that way. This test proves it: the
  // mock below only ever implements getSession(), never a getUser()-style
  // endpoint, and a valid session alone is sufficient to resolve
  // signed-in (already proven by the test above). What genuinely remains
  // is the local getSession() call itself rejecting -- a different,
  // narrower failure mode (e.g. corrupted localStorage) that isn't
  // recoverable client-side either way; it degrades to the same safe
  // "demo" default as before, it just can no longer be TRIGGERED by an
  // unrelated network hiccup.
  it("a genuine local getSession() failure still degrades safely to demo, without crashing", async () => {
    getSessionImpl = () => Promise.reject(new Error("storage read error"));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isDemo).toBe(true);
  });

  it("a genuinely signed-out browser (no persisted session) correctly resolves to demo", async () => {
    getSessionImpl = () => Promise.resolve({ data: { session: null } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isDemo).toBe(true);
  });

  it("updates immediately on a SIGNED_IN auth event", async () => {
    getSessionImpl = () => Promise.resolve({ data: { session: null } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isDemo).toBe(true));

    act(() => {
      authStateCallback?.("SIGNED_IN", sessionFor(owner));
    });

    await waitFor(() => expect(result.current.isDemo).toBe(false));
    expect(result.current.userId).toBe("owner-1");
  });

  it("updates immediately on a SIGNED_OUT auth event", async () => {
    getSessionImpl = () => Promise.resolve({ data: { session: sessionFor(owner) } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isDemo).toBe(false));

    act(() => {
      authStateCallback?.("SIGNED_OUT", null);
    });

    await waitFor(() => expect(result.current.isDemo).toBe(true));
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useAuth());
    expect(unsubscribeSpy).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
