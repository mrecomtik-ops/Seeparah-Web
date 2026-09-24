// @vitest-environment happy-dom
//
// Regression coverage for the bug found in live browser testing: the
// homepage rendered its own independent "Sign in with Google" button and
// never consulted the canonical useAuth() session state, so it kept
// showing "Sign in with Google" even after a successful sign-in. These
// tests use the REAL useAuth() hook (not a mock of the hook itself) so
// that its actual onAuthStateChange subscription wiring is what's under
// test — only the underlying Supabase client and the books query are
// faked, which is the appropriate boundary for this bug.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

type AuthChangeCallback = (event: string, session: { user: User } | null) => void;

let currentUser: User | null = null;
let authChangeCallback: AuthChangeCallback | null = null;
const signInWithOAuthMock = vi.fn().mockResolvedValue({ error: null });

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "reader@example.com",
    user_metadata: { full_name: "Real Reader" },
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as User;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      // useAuth() resolves its initial state from getSession() (local,
      // no network call), not getUser() — see use-auth.ts's own comment
      // for why. Mirrors currentUser the same way the old getUser() mock
      // did, just in getSession()'s actual response shape.
      getSession: () =>
        Promise.resolve({
          data: { session: currentUser ? { user: currentUser, access_token: "test-token" } : null },
        }),
      onAuthStateChange: (cb: AuthChangeCallback) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signInWithOAuth: signInWithOAuthMock,
    },
  },
}));

vi.mock("@/lib/library", () => ({
  DEMO_USER_ID: "demo-reader",
  listBooks: () => Promise.resolve([]),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
    // A real router harness isn't needed for these tests: only whether the
    // auth-aware control text/target renders correctly is under test.
    Link: (props: { to: string; children: React.ReactNode; className?: string }) => (
      <a href={props.to} className={props.className}>
        {props.children}
      </a>
    ),
  };
});

const { LandingPage } = await import("./index");

function renderHomepage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LandingPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentUser = null;
  authChangeCallback = null;
  signInWithOAuthMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("homepage header auth state", () => {
  it("shows Sign in with Google while signed out", async () => {
    renderHomepage();
    expect(await screen.findByText("Sign in with Google")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Real Reader/i })).toBeNull();
  });

  it("hides Sign in with Google and shows the profile control while signed in", async () => {
    currentUser = makeUser();
    renderHomepage();

    const profileLink = await screen.findByRole("link", { name: /Real Reader/i });
    expect(profileLink.getAttribute("href")).toBe("/profile");
    expect(screen.queryByText("Sign in with Google")).toBeNull();
  });

  it("updates immediately when auth state changes, with no remount/refresh", async () => {
    renderHomepage();
    expect(await screen.findByText("Sign in with Google")).toBeTruthy();

    const user = makeUser({ user_metadata: { full_name: "Newly Signed In" } });
    act(() => {
      authChangeCallback?.("SIGNED_IN", { user });
    });

    await waitFor(() => {
      expect(screen.queryByText("Sign in with Google")).toBeNull();
    });
    const profileLink = await screen.findByRole("link", { name: /Newly Signed In/i });
    expect(profileLink.getAttribute("href")).toBe("/profile");

    // Signing out again — same live subscription, no remount required.
    act(() => {
      authChangeCallback?.("SIGNED_OUT", null);
    });
    await waitFor(() => {
      expect(screen.queryByText("Sign in with Google")).toBeTruthy();
    });
  });
});

describe("homepage Google sign-in always offers account selection", () => {
  it("passes queryParams.prompt = 'select_account' (not login_hint) while preserving redirectTo", async () => {
    renderHomepage();
    const button = await screen.findByText("Sign in with Google");
    fireEvent.click(button);

    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalledTimes(1));
    const call = signInWithOAuthMock.mock.calls[0]![0];
    expect(call.provider).toBe("google");
    expect(call.options.redirectTo).toBe(window.location.origin);
    expect(call.options.queryParams).toEqual({ prompt: "select_account" });
    expect(call.options.queryParams.login_hint).toBeUndefined();
  });
});
