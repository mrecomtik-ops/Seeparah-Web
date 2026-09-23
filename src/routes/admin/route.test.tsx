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
  data: { signedIn: boolean; role: string | null; mfaSatisfied: boolean; capabilities: string[] } | undefined;
} = { isLoading: true, data: undefined };

vi.mock("@/lib/use-auth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/admin/use-admin-session", () => ({
  useAdminSession: () => sessionState,
  can: (session: typeof sessionState.data, capability: string) =>
    session?.capabilities.includes(capability) ?? false,
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
  sessionState = { isLoading: true, data: undefined };
});

describe("AdminLayout — no 'Sign in required' flash while auth is still resolving", () => {
  it("shows the loading state, not 'Sign in required', while useAuth is still loading", () => {
    authState = { loading: true, isDemo: true };
    sessionState = { isLoading: true, data: undefined };
    render(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).toBeNull();
  });

  it("shows the loading state, not 'Sign in required', while useAdminSession is still loading -- even once useAuth has already resolved authenticated", () => {
    authState = { loading: false, isDemo: false };
    sessionState = { isLoading: true, data: undefined };
    render(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).toBeNull();
  });

  it("never renders 'Sign in required' across the full resolve-to-authenticated sequence a hard refresh produces", () => {
    authState = { loading: true, isDemo: true };
    sessionState = { isLoading: true, data: undefined };
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
        data: { signedIn: true, role: "owner", mfaSatisfied: true, capabilities: ["users.read"] },
      };
    });
    rerender(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).toBeNull();
    expect(screen.queryByTestId("admin-outlet")).not.toBeNull();
  });

  it("still correctly renders 'Sign in required' once both have resolved and the visitor really is signed out", () => {
    authState = { loading: false, isDemo: true };
    sessionState = { isLoading: false, data: { signedIn: false, role: null, mfaSatisfied: false, capabilities: [] } };
    render(<AdminLayout />);
    expect(screen.queryByText("Sign in required")).not.toBeNull();
  });
});
