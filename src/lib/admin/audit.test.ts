import { describe, expect, it } from "vitest";
import { redact } from "@/lib/admin/audit.server";

describe("redact", () => {
  it("returns null for null/undefined input", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeNull();
  });

  it("redacts fields that look like secrets, regardless of nesting depth", () => {
    const result = redact({
      email: "reader@example.com",
      api_key: "sk-should-never-appear",
      accessToken: "should-not-appear-either",
      password: "hunter2",
    }) as Record<string, unknown>;
    expect(result["email"]).toBe("reader@example.com");
    expect(result["api_key"]).toBe("[redacted]");
    expect(result["accessToken"]).toBe("[redacted]");
    expect(result["password"]).toBe("[redacted]");
  });

  it("truncates long text fields instead of storing full manuscript bodies", () => {
    const longText = "a".repeat(2000);
    const result = redact({ description: longText }) as Record<string, unknown>;
    const value = result["description"] as string;
    expect(value.length).toBeLessThan(longText.length);
    expect(value).toContain("truncated");
  });

  it("drops values that are not JSON-safe (e.g. undefined) rather than throwing", () => {
    const result = redact({ ok: true, ignored: undefined }) as Record<string, unknown>;
    expect(result["ok"]).toBe(true);
    expect("ignored" in result).toBe(false);
  });
});
