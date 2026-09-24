import { describe, expect, it } from "vitest";
import { generateReferenceCode } from "@/lib/reference-code.server";

describe("generateReferenceCode", () => {
  it("matches the expected format with no ambiguous characters", () => {
    const code = generateReferenceCode();
    expect(code).toMatch(/^SPRH-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(code).not.toMatch(/[01OI]/);
  });

  it("generates distinct codes across many calls", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateReferenceCode()));
    expect(codes.size).toBe(500);
  });
});
