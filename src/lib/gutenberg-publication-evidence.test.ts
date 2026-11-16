import { describe, expect, it } from "vitest";
import { summarizeGutenbergPublicationEvidence as audit } from "./gutenberg-publication-evidence";

describe("Source-evidence reconciliation does not bypass publication safety", () => {
  it("tracks manual documentary promotions separately from automated passes", () => {
    expect(audit(102,101,1)).toEqual({
      published:102, allGatesPassed:101, manuallyReconciled:1, missingIntegrityEvidence:0,
    });
  });
  it("still fails when another published job has no evidence", () => {
    expect(audit(103,101,1).missingIntegrityEvidence).toBe(1);
  });
  it("rejects impossible or duplicated evidence counts", () => {
    expect(() => audit(102,102,1)).toThrow(/Inconsistent/);
    expect(() => audit(3,-1,0)).toThrow(/Inconsistent/);
  });
});
