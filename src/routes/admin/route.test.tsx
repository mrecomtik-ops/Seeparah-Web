// @vitest-environment happy-dom
//
// Component-level regression coverage for the actual reported symptom:
// an already-authenticated admin hitting /admin directly (or hard
// refreshing it) intermittently sees "Sign in required" before the real
// admin shell appears. This test drives useAuth()/useAdminSession()
// through the exact state sequence a hard refresh produces (both loading
// -> both resolved authenticated) and asserts "Sign in required" is
// never rendered at any point along the way -- not just that the FINAL
// state is correct, which alone wouldn't catch a transient wrong frame.
//
// SSR itself was checked separately (not with this test stack): a raw
// curl of a dev-server-rendered /admin returned the loading spinner
// markup, never "Sign in required" -- confirming the leak, when it
// happens, is a client-side state issue after hydration, not an SSR
// artifact. That's what this test exercises.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

let authState: { loading: boolean; isDemo: boolean } = { loading: true, isDemo: true };
let sessionState: {
  isLoading: boolean;
  isError: boolean;
  data: { signedIn: boolean; role: string | null; mfaSatisfied: boolean; capabilities: string[] } | undefined;
  refetch: () => void;
} = { isLoading: true, isError: false, data: undefined, refetch: () => {} };

const signOutMock = vi.fn().mockResolvedValue(undefined);
const navigateMock = vi.fn();

vi.mock("@/lib/use-auth", () => ({
  useAuth: () => authState,
  signOut: () => signOutMock(),
}));

vi.mock("@/lib/admin/use-admin-session", () => ({
  useAdminSession: () => sessionState,
  can: (session: typeof sessionState.data, capability: string) =>
    session?.capabilities.includes(capability) ?? false,
  // Real AdminSessionProvider is just a Context.Provider passthrough --
  // this test only exercises AdminLayout's own loading-gate logic, not
  // context consumption by children, so a plain passthrough is faithful
  // enough without importing React context machinery into the mock.
  AdminSessionProvider: ({ children }: { children: import("react").ReactNode }) => children,
}));

vi.mock("@/components/admin/AdminMfaGate", () => ({
  AdminMfaGate: () => null,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => config,
    useRouterState: () => "/admin",
    useNavigate: () => navigateMock,
    Outlet: () => <div data-testid="admin-outlet" />,
    Link: (props: { to: string; children: React.ReactNode; className?: string }) => (
      <a href={props.to} className={props.className}>
        {props.children}
      </a>
    ),
  };
});

const { Route } = await import("./route");
const AdminLayout = (Route as unknown as { component: () => React.ReactElement }).component;

afterEach(() => {
  cleanup();
  authState = { loading: true, isDemo: true };
  sessionState = { isLoading: true, isError: false, data: undefined, refetch: () => {} };
  signOutMock.mockClear();
  navigateMock.mockClear();
});

describe("AdminLayout — no 'Sign in required' flash while auth is still resolving", () => {
  it("shows the loading state, not 'Sign in required', while useAuth is still loading", () => {
    authState = { loading: true, isDemo: true };
    sessionState = { isLoading: true, isError: false, data: undefined, refetch: () => {} };
    render(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).toBeNull();
  });

  it("shows the loading state, not 'Sign in required', while useAdminSession is still loading -- even once useAuth has already resolved authenticated", () => {
    authState = { loading: false, isDemo: false };
    sessionState = { isLoading: true, isError: false, data: undefined, refetch: () => {} };
    render(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).toBeNull();
  });

  it("never renders 'Sign in required' across the full resolve-to-authenticated sequence a hard refresh produces", () => {
    authState = { loading: true, isDemo: true };
    sessionState = { isLoading: true, isError: false, data: undefined, refetch: () => {} };
    const { rerender } = render(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).toBeNull();

    // useAuth resolves first (now a local, no-network getSession() read).
    act(() => {
      authState = { loading: false, isDemo: false };
    });
    rerender(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).toBeNull();

    // useAdminSession resolves shortly after (its own network round trip
    // to adminWhoAmI).
    act(() => {
      sessionState = {
        isLoading: false,
        isError: false,
        data: { signedIn: true, role: "owner", mfaSatisfied: true, capabilities: ["users.read"] },
        refetch: () => {},
      };
    });
    rerender(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).toBeNull();
    expect(screen.queryByTestId("admin-outlet")).not.toBeNull();
  });

  it("still correctly renders 'Sign in required' once both have resolved and the visitor really is signed out", () => {
    authState = { loading: false, isDemo: true };
    sessionState = {
      isLoading: false,
      isError: false,
      data: { signedIn: false, role: null, mfaSatisfied: false, capabilities: [] },
      refetch: () => {},
    };
    render(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).not.toBeNull();
  });
});

// A missing/misconfigured server-side env var (SUPABASE_URL wiped by a
// `wrangler deploy` without keep_vars, in the incident that prompted
// this) made adminWhoAmI's server function throw. The transport layer
// still returned 200 (TanStack Start serializes the thrown error into
// the RPC response rather than a raw 5xx), so there was no network
// error and no console error -- but the query resolved to an error
// state, and data === undefined forever after an error is
// indistinguishable from "hasn't resolved yet" unless isError is
// checked explicitly. That's the bug this covers.
describe("AdminLayout — a failed adminWhoAmI query", () => {
  it("does not spin forever -- shows an error state with a retry action instead", () => {
    authState = { loading: false, isDemo: false };
    sessionState = { isLoading: false, isError: true, data: undefined, refetch: () => {} };
    render(<AdminLayout />);
    expect(screen.queryByText(/couldn.t verify admin access/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeNull();
    // Never a bare, unexplained spinner once the query has actually failed.
    expect(document.querySelector(".animate-spin")).toBeNull();
  });

  it("does not leak any secret/internal detail into the error UI", () => {
    authState = { loading: false, isDemo: false };
    sessionState = { isLoading: false, isError: true, data: undefined, refetch: () => {} };
    render(<AdminLayout />);
    expect(document.body.textContent).not.toMatch(/SUPABASE_URL|SERVICE_ROLE|env var|process\.env/i);
  });

  it("retry calls the query's own refetch", () => {
    const refetch = vi.fn();
    authState = { loading: false, isDemo: false };
    sessionState = { isLoading: false, isError: true, data: undefined, refetch };
    render(<AdminLayout />);
    screen.getByRole("button", { name: /retry/i }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("offers a sign-out option that actually signs out and returns to /auth", async () => {
    authState = { loading: false, isDemo: false };
    sessionState = { isLoading: false, isError: true, data: undefined, refetch: () => {} };
    render(<AdminLayout />);
    await act(async () => {
      screen.getByRole("button", { name: /sign out and sign in again/i }).click();
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/auth", search: { redirect: "/admin" } }),
    );
  });

  it("still shows the loading spinner, not the error state, for a genuinely pending query", () => {
    authState = { loading: false, isDemo: false };
    sessionState = { isLoading: true, isError: false, data: undefined, refetch: () => {} };
    render(<AdminLayout />);
    expect(screen.queryByText(/couldn.t verify admin access/i)).toBeNull();
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("still renders the normal admin shell for a successfully resolved owner session", () => {
    authState = { loading: false, isDemo: false };
    sessionState = {
      isLoading: false,
      isError: false,
      data: { signedIn: true, role: "owner", mfaSatisfied: true, capabilities: ["users.read"] },
      refetch: () => {},
    };
    render(<AdminLayout />);
    expect(screen.queryByText(/couldn.t verify admin access/i)).toBeNull();
    expect(screen.queryByTestId("admin-outlet")).not.toBeNull();
  });
});
