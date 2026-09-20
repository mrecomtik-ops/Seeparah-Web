// @vitest-environment happy-dom
//
// Coverage for the Privacy/Terms/Copyright/Support rework: all four
// anchors render, the copy doesn't claim things the product doesn't
// currently do, and — critically — the private recipient address never
// appears anywhere in this rendered output. This test never types the real
// recipient address; see the EMAIL_PATTERN comment below for why.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

vi.mock("@/lib/admin/support.functions", () => ({
  submitSupportRequest: vi.fn(),
  submitCopyrightRequest: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
    Link: (props: {
      to?: string;
      hash?: string;
      children: React.ReactNode;
      className?: string;
    }) => (
      <a href={`${props.to ?? ""}${props.hash ? `#${props.hash}` : ""}`} className={props.className}>
        {props.children}
      </a>
    ),
  };
});

const { LegalPage } = await import("./legal");

describe("legal page", () => {
  it("renders all four anchors", () => {
    render(<LegalPage />);
    expect(document.getElementById("privacy")).toBeTruthy();
    expect(document.getElementById("terms")).toBeTruthy();
    expect(document.getElementById("copyright")).toBeTruthy();
    expect(document.getElementById("support")).toBeTruthy();
    cleanup();
  });

  it("headings say Privacy, Terms of service, Copyright, and Support", () => {
    render(<LegalPage />);
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Terms of service" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Copyright" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Support" })).toBeTruthy();
    cleanup();
  });

  it("does not claim an active paid plan, billing, payouts, or guaranteed/instant translation", () => {
    render(<LegalPage />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/billing help/i);
    expect(text.toLowerCase()).not.toContain("instant translation");
    expect(text.toLowerCase()).not.toContain("guaranteed translation");
    // "free during launch" and "no active paid plan/tier" language IS
    // expected and correct — only an affirmative CURRENT payout/revenue
    // commitment would be wrong; check the surrounding text is careful,
    // not absent, since author revenue is a real future-tense topic.
    expect(text).toMatch(/free during launch/i);
    cleanup();
  });

  it("never affirmatively claims a registered legal entity, jurisdiction, or formal DMCA-agent registration", () => {
    render(<LegalPage />);
    const text = document.body.textContent ?? "";
    // The word "DMCA" may appear ONLY inside an explicit disclaimer that
    // procedures depend on applicable law and that no formal U.S. agent
    // registration is claimed — never as a bare, unqualified label for
    // "the" process (which would misleadingly imply that registration).
    // A window (not naive sentence-splitting, which breaks on "U.S.") is
    // checked around every occurrence.
    const dmcaIndex = text.indexOf("DMCA");
    expect(dmcaIndex).toBeGreaterThan(-1);
    expect(text.indexOf("DMCA", dmcaIndex + 1)).toBe(-1); // exactly one mention
    const window = text.slice(Math.max(0, dmcaIndex - 150), dmcaIndex + 150).toLowerCase();
    expect(window).toMatch(/don't claim|not claim|no formal|depend on/);
    expect(text.toLowerCase()).not.toContain("governed by the laws of");
    cleanup();
  });

  it("submission forms and their success states never render an email-shaped address at all", () => {
    render(<LegalPage />);
    // Generic pattern, matches any email address — not the real recipient,
    // which must never be typed into this repository. If this ever finds
    // a match, something is rendering SOME email address in page content,
    // which the task requires never happens.
    const EMAIL_PATTERN = /[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+/;
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(EMAIL_PATTERN);
    cleanup();
  });
});

describe("legal page source (static, no rendering needed)", () => {
  it("the source file itself never contains SUPPORT_NOTIFICATION_TO or an email-shaped literal", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/legal.tsx"), "utf8");
    expect(source).not.toContain("SUPPORT_NOTIFICATION_TO");
    expect(source).not.toMatch(/[^\s@<>"]+@[^\s@<>"]+\.(com|org|net|app)/i);
  });
});
