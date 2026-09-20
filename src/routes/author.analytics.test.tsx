// @vitest-environment happy-dom
//
// Regression coverage for the live-preview finding on commit 83878fc:
// Author Studio's analytics page must not show any payout/revenue UI —
// not even a degraded "Not active yet" placeholder — while there's no
// active paid plan, and must show the real figures once monetization is
// genuinely turned on. Renders the real component with only the
// monetization-settings query and book list faked, so the actual
// conditional JSX is what's under test.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let monetizationEnabled = false;

vi.mock("@/lib/use-auth", () => ({
  useAuth: () => ({ userId: "test-user", isDemo: false }),
}));

vi.mock("@/lib/library", () => ({
  listMyBooks: () =>
    Promise.resolve([
      {
        id: "book-1",
        title: "Test Book",
        author: "Test Author",
        total_chunks: 10,
        available_languages: ["English"],
        access_type: "paid",
        subscription_price_usd: 4.99,
      },
    ]),
}));

vi.mock("@/lib/admin/settings.functions", () => ({
  getPublicContentSettings: () =>
    Promise.resolve({ monetization_enabled: monetizationEnabled }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, createFileRoute: () => (config: unknown) => config };
});

const { AnalyticsPage } = await import("./author.analytics");

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  monetizationEnabled = false;
});

describe("Author Studio analytics — payout/revenue UI", () => {
  it("shows no payout tile, no 'Not active yet' placeholder, and no Revenue summary card while monetization is off", async () => {
    monetizationEnabled = false;
    renderPage();
    // Wait for the settings query to resolve.
    await screen.findByText("Book performance");

    expect(screen.queryByText("Payouts")).toBeNull();
    expect(screen.queryByText("Not active yet")).toBeNull();
    expect(screen.queryByText("Your payout (est./mo)")).toBeNull();
    expect(screen.queryByText("Revenue summary")).toBeNull();
  });

  it("shows the real payout tile and Revenue summary card once monetization is genuinely enabled", async () => {
    monetizationEnabled = true;
    renderPage();
    await screen.findByText("Revenue summary");

    expect(screen.getByText("Your payout (est./mo)")).toBeTruthy();
    expect(screen.getAllByText(/Your payout \(70%\)/).length).toBeGreaterThan(0);
  });
});
