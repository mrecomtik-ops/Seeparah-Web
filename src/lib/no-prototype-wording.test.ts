// Regression coverage for live-preview findings on commit 83878fc: several
// pages used "Demo"/"Try demo" framing that implied a fake preview rather
// than genuine guest/signed-out functionality, and "Plans" was shown as
// primary site navigation with no active paid plan behind it. These check
// the actual source text directly (same technique already established in
// src/lib/support-notification-boundary.test.ts) — precise and durable for
// facts that are now simply absent from the code, not conditional on
// runtime state (author.analytics.test.tsx below covers the conditional
// payout/revenue cases, which this technique can't verify).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("removed prototype/demo wording", () => {
  it('library.tsx no longer calls guest browsing "Demo reader"', () => {
    const source = read("src/routes/library.tsx");
    expect(source).not.toContain("Demo reader");
    expect(source).toContain("Reading as a guest");
  });

  it('author/index.tsx no longer calls guest authoring "Demo author studio"', () => {
    const source = read("src/routes/author/index.tsx");
    expect(source).not.toContain("Demo author studio");
    expect(source).toContain("Signed out");
  });

  it('auth.tsx no longer offers "Try demo"', () => {
    const source = read("src/routes/auth.tsx");
    expect(source).not.toContain("Try demo");
    expect(source).toContain("Continue without an account");
  });
});

describe("removed paid-plan navigation/copy during free launch", () => {
  it('AppHeader has no "Plans" nav entry and no NAV link to /subscribe', () => {
    const source = read("src/components/AppHeader.tsx");
    expect(source).not.toMatch(/label:\s*"Plans"/);
    expect(source).not.toMatch(/to:\s*"\/subscribe"/);
  });

  it("Author Studio's free-launch copy no longer forward-references payouts/earnings", () => {
    const source = read("src/routes/author/index.tsx");
    expect(source).not.toMatch(/earnings and payouts/i);
    expect(source).not.toMatch(/nothing to pay out/i);
  });
});
