// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { states } = vi.hoisted(() => ({
  states: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: readonly string[] }) => states.get(queryKey[0]!) ?? {},
}));
vi.mock("@tanstack/react-router", async (original) => {
  const router = await original<typeof import("@tanstack/react-router")>();
  return {
    ...router,
    createFileRoute: () => (config: Record<string, unknown>) => config,
    Link: ({ to, children }: { to: string; children: React.ReactNode }) =>
      <a href={to}>{children}</a>,
  };
});
vi.mock("@/lib/admin/use-admin-session", () => ({ getAccessToken: vi.fn() }));
vi.mock("@/lib/admin/health.functions", () => ({ adminGetHealthSnapshot: vi.fn() }));
vi.mock("@/lib/admin/catalog.functions", () => ({ adminListCatalog: vi.fn() }));
vi.mock("@/lib/admin/overview.functions", () => ({ adminGetOverviewAnalytics: vi.fn() }));

const { Route } = await import("./index");
const Overview = (Route as unknown as { component: () => React.ReactElement }).component;
const health = {
  pendingTranslationRequests: 0,
  openSupportTickets: 0,
  failedJobs: [],
  geminiConfigured: false,
  unresolvedErrors: [],
};

function setup(override: Record<string, Record<string, unknown>> = {}) {
  states.clear();
  states.set("admin-health", { isLoading: false, isError: false, data: health });
  states.set("admin-catalog-count", { isFetching: false, isPending: false, isError: false, data: { total: 0 } });
  states.set("admin-overview-analytics", { isFetching: false, isPending: false, isError: false, data: undefined });
  for (const [name, state] of Object.entries(override)) states.set(name, state);
}

afterEach(() => { cleanup(); states.clear(); });

describe("SP-08 admin never presents a stale queue as all clear", () => {
  it("keeps the review queues checking during a background refetch", () => {
    setup({ "admin-catalog-count": { isFetching: true, isPending: false, isError: false, data: { total: 0 } } });
    render(<Overview />);
    expect(screen.getByRole("status").textContent).toMatch(/checking review queues/i);
    expect(screen.queryByText(/nothing needs immediate action/i)).toBeNull();
  });

  it("shows an explicit error rather than an all-clear on review count failure", () => {
    setup({ "admin-catalog-count": { isFetching: false, isPending: false, isError: true, data: undefined } });
    render(<Overview />);
    expect(screen.getByRole("alert").textContent).toMatch(/could not be loaded/i);
    expect(screen.queryByText(/nothing needs immediate action/i)).toBeNull();
  });

  it("only reports all clear once review counts are fully resolved", () => {
    setup();
    render(<Overview />);
    expect(screen.getByText(/nothing needs immediate action right now/i)).toBeTruthy();
  });
});
