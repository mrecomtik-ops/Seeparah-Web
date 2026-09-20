import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockHeaders: Record<string, string> = {};

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({
    headers: { get: (name: string) => mockHeaders[name.toLowerCase()] ?? null },
  }),
}));

const {
  hashClientIpForSupportForms,
  isSameOriginRequest,
  isHoneypotTripped,
} = await import("@/lib/support-request-guard.server");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockHeaders = {};
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isHoneypotTripped", () => {
  it("is false for undefined or empty", () => {
    expect(isHoneypotTripped(undefined)).toBe(false);
    expect(isHoneypotTripped("")).toBe(false);
    expect(isHoneypotTripped("   ")).toBe(false);
  });

  it("is true when a bot fills the field", () => {
    expect(isHoneypotTripped("http://spam.example")).toBe(true);
  });
});

describe("isSameOriginRequest", () => {
  it("allows a request with a matching Origin/Host", () => {
    mockHeaders = { origin: "https://seeparah.com", host: "seeparah.com" };
    expect(isSameOriginRequest()).toBe(true);
  });

  it("rejects a request with a mismatched Origin", () => {
    mockHeaders = { origin: "https://evil.example", host: "seeparah.com" };
    expect(isSameOriginRequest()).toBe(false);
  });

  it("prefers x-forwarded-host when present (behind Netlify's proxy)", () => {
    mockHeaders = {
      origin: "https://worktree-new-backend-setup--seeparah.netlify.app",
      host: "internal-lb.netlify",
      "x-forwarded-host": "worktree-new-backend-setup--seeparah.netlify.app",
    };
    expect(isSameOriginRequest()).toBe(true);
  });

  it("allows a request with no Origin header at all", () => {
    mockHeaders = { host: "seeparah.com" };
    expect(isSameOriginRequest()).toBe(true);
  });
});

describe("hashClientIpForSupportForms", () => {
  it("produces a deterministic hash for the same IP and salt", () => {
    process.env["SUPPORT_RATE_LIMIT_SALT"] = "test-salt-a";
    mockHeaders = { "x-forwarded-for": "203.0.113.5" };
    const first = hashClientIpForSupportForms();
    const second = hashClientIpForSupportForms();
    expect(first).toBe(second);
    expect(first).not.toContain("203.0.113.5");
  });

  it("produces a different hash for a different salt (same IP)", () => {
    mockHeaders = { "x-forwarded-for": "203.0.113.5" };
    process.env["SUPPORT_RATE_LIMIT_SALT"] = "salt-one";
    const withSaltOne = hashClientIpForSupportForms();
    process.env["SUPPORT_RATE_LIMIT_SALT"] = "salt-two";
    const withSaltTwo = hashClientIpForSupportForms();
    expect(withSaltOne).not.toBe(withSaltTwo);
  });

  it("never returns the raw IP", () => {
    process.env["SUPPORT_RATE_LIMIT_SALT"] = "some-salt";
    mockHeaders = { "x-forwarded-for": "198.51.100.42" };
    expect(hashClientIpForSupportForms()).not.toMatch(/198\.51\.100\.42/);
  });
});
