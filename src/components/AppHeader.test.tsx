// @vitest-environment happy-dom
//
// Regression coverage for the owner-reported bug: on refresh, the header
// visibly rendered "Sign in" as if the visitor were confirmed signed out,
// then a moment later switched to the real authenticated state. Root
// cause: isDemo starts (and stays, on a genuine getSession() failure)
// true while useAuth() is still resolving — that's "unknown yet," not
// "confirmed signed out" — and AppHeader rendered "Sign in" off isDemo
// alone, with no regard for the loading state.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let authState: { isDemo: boolean; loading: boolean } = { isDemo: true, loading: true };
let adminSessionState: { data: { role: string | null } | undefined } = { data: undefined };

vi.mock("@/lib/use-auth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/admin/use-admin-session", () => ({
  useAdminSession: () => adminSessionState,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => "/library",
    Link: (props: { to: string; children: React.ReactNode; className?: string }) => (
      <a href={props.to} className={props.className}>
        {props.children}
      </a>
    ),
  };
});

const { AppHeader } = await import("./AppHeader");

afterEach(() => {
  cleanup();
  authState = { isDemo: true, loading: true };
  adminSessionState = { data: undefined };
});

describe("AppHeader — does not show a false guest state while auth is still resolving", () => {
  it("does not render 'Sign in' while auth is loading, even though isDemo still holds its initial true value", () => {
    authState = { isDemo: true, loading: true };
    render(<AppHeader />);
    expect(screen.queryByText("Sign in")).toBeNull();
  });

  it("does not render 'Sign in' once resolved as actually authenticated", () => {
    authState = { isDemo: false, loading: false };
    render(<AppHeader />);
    expect(screen.queryByText("Sign in")).toBeNull();
  });

  it("renders 'Sign in' once auth has genuinely resolved to signed-out", () => {
    authState = { isDemo: true, loading: false };
    render(<AppHeader />);
    expect(screen.queryByText("Sign in")).not.toBeNull();
  });

  it("never shows the Admin link before an admin role is confirmed, loading or not", () => {
    authState = { isDemo: true, loading: true };
    adminSessionState = { data: undefined };
    render(<AppHeader />);
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("shows the Admin link once the visitor is confirmed authenticated with an admin role", () => {
    authState = { isDemo: false, loading: false };
    adminSessionState = { data: { role: "owner" } };
    render(<AppHeader />);
    expect(screen.queryByText("Admin")).not.toBeNull();
  });
});
