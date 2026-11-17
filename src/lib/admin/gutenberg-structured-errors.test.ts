import { describe, expect, it } from "vitest";
import { gutenbergImportErrorMessage } from "./gutenberg-fast-import.server";

describe("structured Supabase import errors are actionable", () => {
  it("prints PostgREST error fields rather than [object Object]", () => {
    const message = gutenbergImportErrorMessage({message:"Query rejected",code:"23514",
      details:"Invalid review status",hint:"Check source"});
    expect(message).toContain("Query rejected");
    expect(message).toContain("23514");
    expect(message).toContain("Invalid review status");
    expect(message).not.toContain("[object Object]");
  });
  it("bounds returned text and accepts standard errors", () => {
    expect(gutenbergImportErrorMessage(new Error("Source timeout"))).toBe("Source timeout");
    expect(gutenbergImportErrorMessage({message:"A".repeat(3000)}).length).toBeLessThan(400);
  });
});
