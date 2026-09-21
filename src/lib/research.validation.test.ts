import { describe, expect, it } from "vitest";
import { firstSubmissionProblem, isValidOrcid, type PaperDraftInput } from "@/lib/research";

const VALID: PaperDraftInput = {
  authorName: "A. Student",
  coauthorNames: [],
  affiliation: null,
  orcid: null,
  language: "English",
  title: "A Study of Something",
  abstract: "An abstract.",
  keywords: [],
  topic: null,
  paperType: "literary_analysis",
  bodyText: "Full text here",
  citationStyle: null,
  referencesText: "Works cited",
  rightsDeclaration: "I hold the rights to submit this.",
  thirdPartyRightsNote: null,
  fundingNote: null,
  conflictsOfInterest: null,
  acknowledgments: null,
  aiAssistanceDisclosure: null,
};

describe("isValidOrcid", () => {
  it("accepts a well-formed ORCID", () => {
    expect(isValidOrcid("0000-0002-1825-0097")).toBe(true);
  });
  it("accepts the X check-digit form", () => {
    expect(isValidOrcid("0000-0002-1825-009X")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isValidOrcid("not-an-orcid")).toBe(false);
    expect(isValidOrcid("0000-0002-1825")).toBe(false);
  });
});

describe("firstSubmissionProblem — gates what 'submitted' requires, distinct from a valid draft", () => {
  it("passes a fully-filled-out paper with body text", () => {
    expect(firstSubmissionProblem(VALID, true)).toBeNull();
  });

  it("requires author name", () => {
    expect(firstSubmissionProblem({ ...VALID, authorName: "" }, true)).toMatch(/author name/i);
  });

  it("requires a title", () => {
    expect(firstSubmissionProblem({ ...VALID, title: "" }, true)).toMatch(/title/i);
  });

  it("requires an abstract", () => {
    expect(firstSubmissionProblem({ ...VALID, abstract: "" }, true)).toMatch(/abstract/i);
  });

  it("requires references / works cited", () => {
    expect(firstSubmissionProblem({ ...VALID, referencesText: "" }, true)).toMatch(/references/i);
  });

  it("requires a rights declaration — never assumed or defaulted", () => {
    expect(firstSubmissionProblem({ ...VALID, rightsDeclaration: "" }, true)).toMatch(
      /rights declaration/i,
    );
  });

  it("requires either body text or a PDF — a draft with neither cannot be submitted", () => {
    expect(firstSubmissionProblem({ ...VALID, bodyText: null }, false)).toMatch(/main text or/i);
    // hasContent=true (e.g. a PDF was uploaded) makes the same empty bodyText fine.
    expect(firstSubmissionProblem({ ...VALID, bodyText: null }, true)).toBeNull();
  });

  it("rejects a malformed ORCID even though the field is optional", () => {
    expect(firstSubmissionProblem({ ...VALID, orcid: "garbage" }, true)).toMatch(/orcid/i);
  });

  it("never rejects a missing (optional) ORCID", () => {
    expect(firstSubmissionProblem({ ...VALID, orcid: null }, true)).toBeNull();
  });
});
