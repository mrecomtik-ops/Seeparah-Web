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
let adminSessionState: { data: { role: string | null } | undefined; isError?: boolean } = {
  data: undefined,
};

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
    expect(screen.queryAllByText("Admin").length).toBeGreaterThan(0);
  });
});

describe("AppHeader — Admin nav slot is reserved while the role is unresolved", () => {
  it("shows a placeholder (not the Admin link) while auth is still loading", () => {
    authState = { isDemo: true, loading: true };
    adminSessionState = { data: undefined };
    render(<AppHeader />);
    expect(screen.getByTestId("admin-nav-placeholder")).toBeTruthy();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("shows a placeholder while signed in and the admin role query has not resolved", () => {
    authState = { isDemo: false, loading: false };
    adminSessionState = { data: undefined };
    render(<AppHeader />);
    expect(screen.getByTestId("admin-nav-placeholder")).toBeTruthy();
  });

  it("replaces the placeholder with the Admin link once an admin role resolves", () => {
    authState = { isDemo: false, loading: false };
    adminSessionState = { data: { role: "owner" } };
    render(<AppHeader />);
    expect(screen.queryByTestId("admin-nav-placeholder")).toBeNull();
    expect(screen.getAllByText("Admin")[0]).toBeTruthy();
  });

  it("renders neither placeholder nor Admin link for a resolved non-admin", () => {
    authState = { isDemo: false, loading: false };
    adminSessionState = { data: { role: null } };
    render(<AppHeader />);
    expect(screen.queryByTestId("admin-nav-placeholder")).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("does not leave a permanent placeholder when the role lookup fails", () => {
    authState = { isDemo: false, loading: false };
    adminSessionState = { data: undefined, isError: true };
    render(<AppHeader />);
    expect(screen.queryByTestId("admin-nav-placeholder")).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("renders no placeholder for a resolved signed-out visitor", () => {
    authState = { isDemo: true, loading: false };
    adminSessionState = { data: undefined };
    render(<AppHeader />);
    expect(screen.queryByTestId("admin-nav-placeholder")).toBeNull();
  });
});

describe("AppHeader — mobile bottom nav", () => {
  it("includes an Admin entry for a resolved admin (desktop + mobile = 2 links)", () => {
    authState = { isDemo: false, loading: false };
    adminSessionState = { data: { role: "owner" } };
    render(<AppHeader />);
    expect(screen.getAllByText("Admin")).toHaveLength(2);
  });

  it("has no Admin entry anywhere for a non-admin", () => {
    authState = { isDemo: false, loading: false };
    adminSessionState = { data: { role: null } };
    render(<AppHeader />);
    expect(screen.queryAllByText("Admin")).toHaveLength(0);
  });
});


describe("AppHeader — role/auth resolution cannot shift the desktop nav", () => {
  const states: Array<[string, typeof authState, typeof adminSessionState]> = [
    ["resolving", { isDemo: true, loading: true }, { data: undefined }],
    ["admin", { isDemo: false, loading: false }, { data: { role: "owner" } }],
    ["non-admin", { isDemo: false, loading: false }, { data: { role: null } }],
    ["signed-out", { isDemo: true, loading: false }, { data: undefined }],
  ];

  it.each(states)("%s: Admin slot content lives in an out-of-flow slot", (_n, auth, admin) => {
    authState = auth;
    adminSessionState = admin;
    const { container } = render(<AppHeader />);
    const nav = container.querySelector("header nav")!;
    const slot = screen.getByTestId("admin-nav-slot");
    expect(nav.className).toContain("relative");
    expect(slot.parentElement).toBe(nav);
    expect(slot.className).toContain("absolute");
    // Nothing Admin-related is a direct in-flow child of the nav.
    const inFlow = [...nav.children].filter((c) => c !== slot);
    expect(inFlow.map((c) => c.getAttribute("href"))).toEqual([
      "/dashboard",
      "/library",
      "/research",
      "/author",
      "/profile",
    ]);
  });

  it.each(states)("%s: right-hand auth slot keeps a constant desktop width", (_n, auth, admin) => {
    authState = auth;
    adminSessionState = admin;
    const { container } = render(<AppHeader />);
    const right = container.querySelector("header nav")!.nextElementSibling!;
    expect(right.className).toContain("sm:min-w-[92px]");
  });
});
