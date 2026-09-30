// @vitest-environment happy-dom
//
// Regression coverage for the owner-reported bug: on refresh, /profile
// visibly rendered "Demo Reader" / "demo reader — progress stays on this
// device" / "Sign in" / "Clear session" for an already-authenticated
// account, before switching to the real identity a moment later. Root
// cause: useAuth()'s initial (unresolved) state — userId falling back to
// DEMO_USER_ID, isDemo defaulting true — was rendered as though it were
// a confirmed answer, both in the header UI and in which reader-specific
// queries fired (risking a request, and a cached query entry, keyed to
// the wrong identity).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

let authState: {
  user: User | null;
  userId: string;
  displayName: string;
  isDemo: boolean;
  loading: boolean;
} = {
  user: null,
  userId: "demo-reader",
  displayName: "Demo Reader",
  isDemo: true,
  loading: true,
};

vi.mock("@/lib/use-auth", () => ({
  useAuth: () => authState,
  signOut: vi.fn(),
}));

const listProgressSpy = vi.fn((_userId: string) => Promise.resolve([]));
const listHighlightsSpy = vi.fn((_userId: string) => Promise.resolve([]));
const listSubscriptionsSpy = vi.fn((_userId: string) => Promise.resolve([]));
const getAuthorProfileSpy = vi.fn((_userId: string) => Promise.resolve(null));

vi.mock("@/lib/library", () => ({
  listBooks: () => Promise.resolve([]),
  listProgress: (userId: string) => listProgressSpy(userId),
  listHighlights: (userId: string) => listHighlightsSpy(userId),
  listSubscriptions: (userId: string) => listSubscriptionsSpy(userId),
  getAuthorProfile: (userId: string) => getAuthorProfileSpy(userId),
  saveAuthorProfile: vi.fn(),
}));

vi.mock("@/lib/data", () => ({ LANGUAGES: ["English"] }));
vi.mock("@/lib/prefs", () => ({
  getPrefs: () => ({ language: "English", weeklyGoalPages: 40 }),
  setPrefs: vi.fn(),
}));
vi.mock("@/components/ShelfButtons", () => ({
  useShelves: () => ({ data: [] }),
}));
vi.mock("@/lib/shelves", () => ({ SHELF_LABELS: {} }));
vi.mock("@/lib/admin/settings.functions", () => ({
  getPublicContentSettings: () => Promise.resolve({}),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => config,
    useNavigate: () => vi.fn(),
    Link: (props: { to: string; children: React.ReactNode; className?: string }) => (
      <a href={props.to} className={props.className}>
        {props.children}
      </a>
    ),
  };
});

const { Route } = await import("./profile");
const ProfilePage = (Route as unknown as { component: () => React.ReactElement }).component;

function renderProfile() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  authState = {
    user: null,
    userId: "demo-reader",
    displayName: "Demo Reader",
    isDemo: true,
    loading: true,
  };
  listProgressSpy.mockClear();
  listHighlightsSpy.mockClear();
  listSubscriptionsSpy.mockClear();
  getAuthorProfileSpy.mockClear();
});

describe("ProfilePage — no false guest identity while auth is resolving", () => {
  it("never renders 'Demo Reader' while auth is loading, for an account that turns out to be authenticated", async () => {
    authState = {
      user: null,
      userId: "demo-reader",
      displayName: "Demo Reader",
      isDemo: true,
      loading: true,
    };
    renderProfile();
    expect(screen.queryByText("Demo Reader")).toBeNull();
    expect(screen.queryByText("demo reader — progress stays on this device")).toBeNull();
  });

  it("never renders a 'Sign in' button while auth is loading", async () => {
    authState = {
      user: null,
      userId: "demo-reader",
      displayName: "Demo Reader",
      isDemo: true,
      loading: true,
    };
    renderProfile();
    expect(screen.queryByText("Sign in")).toBeNull();
    expect(screen.queryByText("Clear session")).toBeNull();
  });

  it("does not fire identity-scoped reader queries (progress/highlights/subscriptions/author-profile) while auth is still loading", async () => {
    authState = {
      user: null,
      userId: "demo-reader",
      displayName: "Demo Reader",
      isDemo: true,
      loading: true,
    };
    renderProfile();
    await new Promise((r) => setTimeout(r, 20));
    expect(listProgressSpy).not.toHaveBeenCalled();
    expect(listHighlightsSpy).not.toHaveBeenCalled();
    expect(listSubscriptionsSpy).not.toHaveBeenCalled();
    expect(getAuthorProfileSpy).not.toHaveBeenCalled();
  });

  it("once auth resolves to a real signed-in user, fires those queries with the REAL id, never the demo fallback", async () => {
    authState = {
      user: null,
      userId: "demo-reader",
      displayName: "Demo Reader",
      isDemo: true,
      loading: true,
    };
    const { rerender } = renderProfile();

    authState = {
      user: { id: "owner-1", email: "seeparah.app@gmail.com" } as unknown as User,
      userId: "owner-1",
      displayName: "Seeparah",
      isDemo: false,
      loading: false,
    };
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfilePage />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(listProgressSpy).toHaveBeenCalledWith("owner-1"));
    expect(listProgressSpy).not.toHaveBeenCalledWith("demo-reader");
    expect(listHighlightsSpy).toHaveBeenCalledWith("owner-1");
    expect(listSubscriptionsSpy).toHaveBeenCalledWith("owner-1");
    expect(getAuthorProfileSpy).toHaveBeenCalledWith("owner-1");
  });

  it("renders the real account once auth resolves authenticated — never 'Demo Reader'", async () => {
    authState = {
      user: { id: "owner-1", email: "seeparah.app@gmail.com" } as unknown as User,
      userId: "owner-1",
      displayName: "Seeparah",
      isDemo: false,
      loading: false,
    };
    renderProfile();
    await screen.findByText("Seeparah");
    expect(screen.queryByText("Demo Reader")).toBeNull();
    expect(screen.getByText("seeparah.app@gmail.com")).toBeTruthy();
    expect(screen.queryByText("Sign in")).toBeNull();
    expect(screen.getByText("Sign out")).toBeTruthy();
  });

  it("a genuinely signed-out visitor still sees Demo Reader / Sign in, but only AFTER auth initialization finishes", async () => {
    authState = {
      user: null,
      userId: "demo-reader",
      displayName: "Demo Reader",
      isDemo: true,
      loading: false,
    };
    renderProfile();
    await screen.findByText("Demo Reader");
    expect(screen.getByText("demo reader — progress stays on this device")).toBeTruthy();
    // Two legitimate "Sign in" links exist for a signed-out visitor (the
    // header, and the Author profile section's own prompt) — assert both
    // are present rather than assuming exactly one.
    expect(screen.getAllByText("Sign in").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Clear session")).toBeTruthy();
  });
});
