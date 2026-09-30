// @vitest-environment happy-dom
//
// Regression coverage for /auth's "Sign in with Google" button: it must
// always ask Google to show the account chooser (queryParams.prompt =
// 'select_account'), never login_hint (which pins a specific account
// instead of offering a choice), while still passing the existing
// redirectTo through unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const signInWithOAuthMock = vi.fn().mockResolvedValue({ error: null });
const getUserMock = vi.fn().mockResolvedValue({ data: { user: null } });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: () => getUserMock(),
      signInWithOAuth: signInWithOAuthMock,
    },
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => ({
      ...config,
      useSearch: () => ({ redirect: undefined }),
    }),
    useNavigate: () => vi.fn(),
    Link: (props: { to: string; children: React.ReactNode; className?: string }) => (
      <a href={props.to} className={props.className}>
        {props.children}
      </a>
    ),
  };
});

const { Route } = await import("./auth");
const AuthPage = (Route as unknown as { component: () => React.ReactElement }).component;

beforeEach(() => {
  signInWithOAuthMock.mockClear();
  getUserMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("/auth Google sign-in always offers account selection", () => {
  it("passes queryParams.prompt = 'select_account' (not login_hint) while preserving redirectTo", async () => {
    render(<AuthPage />);
    const button = await screen.findByText("Sign in with Google");
    fireEvent.click(button);

    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalledTimes(1));
    const call = signInWithOAuthMock.mock.calls[0]![0];
    expect(call.provider).toBe("google");
    expect(call.options.redirectTo).toBe(`${window.location.origin}/library`);
    expect(call.options.queryParams).toEqual({ prompt: "select_account" });
    expect(call.options.queryParams.login_hint).toBeUndefined();
  });
});
