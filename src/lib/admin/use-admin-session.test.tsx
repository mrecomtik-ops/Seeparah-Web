// @vitest-environment happy-dom
//
// Regression coverage for the browser-QA-reported bug: direct admin
// routes sometimes showed "Sign in required" for an already-authenticated
// admin, self-correcting on a later navigation. Root cause: useAdminSession
// used a single static React Query key ("admin-whoami") with no
// subscription of its own to Supabase auth state. Since AppHeader calls
// useAdminSession() on every route (not just /admin), it's very often the
// FIRST fetch under that key — sometimes while the visitor is still
// signed out. That signed-out result stayed cached and "fresh enough" for
// staleTime (15s) and got reused verbatim by admin/route.tsx's own gate
// after the visitor actually signed in, until some later remount happened
// to fall outside the stale window and a background refetch corrected it.
// The fix resets the query on every relevant Supabase auth event, so no
// consumer of useAdminSession() can ever render a stale signed-in/out
// mismatch — see use-admin-session.ts's own comment for the full reasoning.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

type AuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "MFA_CHALLENGE_VERIFIED"
  | "PASSWORD_RECOVERY";

let currentAccessToken: string | null = null;
let authStateCallback: ((event: AuthEvent, session: unknown) => void) | null = null;
const unsubscribeSpy = vi.fn();
const onAuthStateChangeSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: currentAccessToken ? { access_token: currentAccessToken } : null },
        }),
      onAuthStateChange: (cb: (event: AuthEvent, session: unknown) => void) => {
        onAuthStateChangeSpy();
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: unsubscribeSpy } } };
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

const { useAdminSession } = await import("./use-admin-session");

function fireAuthEvent(event: AuthEvent) {
  act(() => {
    authStateCallback?.(event, null);
  });
}

function renderAdminSession() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useAdminSession(), { wrapper });
}

afterEach(() => {
  cleanup();
  currentAccessToken = null;
  authStateCallback = null;
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

    // No reset means no transition through a pending/loading state and no
    // new fetch — the data stays exactly as it was, synchronously.
    expect(result.current.isPending).toBe(false);
    expect(result.current.data?.role).toBe("owner");
    expect(adminWhoAmISpy.mock.calls.length).toBe(callsBefore);
  });
});

describe("useAdminSession — subscription lifecycle", () => {
  it("subscribes to auth state changes and unsubscribes on unmount", () => {
    const { unmount } = renderAdminSession();
    expect(onAuthStateChangeSpy).toHaveBeenCalledTimes(1);
    expect(unsubscribeSpy).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
