// Coverage for the old pre-/legal URLs (/privacy, /terms, /copyright,
// /support) that production QA found 404ing -- each is a redirect-only
// route to the matching /legal#<anchor> section, not a duplicate page.
import { describe, expect, it } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    // Isolates each route's own beforeLoad logic from real router
    // machinery -- same convention as legal.test.tsx / admin/route.test.tsx.
    createFileRoute: () => (config: { beforeLoad: () => void }) => config,
  };
});

const cases = [
  ["./privacy", "privacy"],
  ["./terms", "terms"],
  ["./copyright", "copyright"],
  ["./support", "support"],
] as const;

describe("old legal URL redirects", () => {
  it.each(cases)("%s beforeLoad throws a permanent redirect to /legal#%s", async (path, hash) => {
    const { Route } = (await import(path)) as { Route: { beforeLoad: () => void } };
    let caught: unknown;
    try {
      Route.beforeLoad();
    } catch (thrown) {
      caught = thrown;
    }
    expect(isRedirect(caught)).toBe(true);
    const redirect = caught as { options: { to?: string; hash?: string; statusCode?: number } };
    expect(redirect.options.to).toBe("/legal");
    expect(redirect.options.hash).toBe(hash);
    expect(redirect.options.statusCode).toBe(301);
  });
});
