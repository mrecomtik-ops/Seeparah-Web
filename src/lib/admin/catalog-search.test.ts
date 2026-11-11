import { describe, expect, it } from "vitest";
import { sanitizeAdminCatalogSearch } from "./catalog-search";

describe("QA-032 admin search filter safety", () => {
  it("removes PostgREST separators, operators and wildcard syntax", () => {
    const safe = sanitizeAdminCatalogSearch("Dickens),status.eq.published,(id.like.%");
    expect(safe).toBe("Dickens status eq published id like");
    expect(safe).not.toMatch(/[()%_,.\\]/);
  });
  it("keeps normal bibliographic Unicode, names and sensible limits", () => {
    expect(sanitizeAdminCatalogSearch("  Jane   Austen  ")).toBe("Jane Austen");
    expect(sanitizeAdminCatalogSearch("O'Brien – García")).toBe("O'Brien García");
    expect(sanitizeAdminCatalogSearch("x".repeat(1000)).length).toBeLessThanOrEqual(120);
  });
});
