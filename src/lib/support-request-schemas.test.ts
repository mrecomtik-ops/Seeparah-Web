import { describe, expect, it } from "vitest";
import { SUPPORT_REQUEST_SCHEMA, COPYRIGHT_REQUEST_SCHEMA } from "@/lib/support-request-schemas";

const VALID_SUPPORT_REQUEST = {
  requestType: "general_support" as const,
  fullName: "Jamie Reader",
  replyEmail: "jamie@example.com",
  subject: "Can't open my saved book",
  message: "The book won't open on my phone.",
  confirmedAccurate: true as const,
};

const VALID_COPYRIGHT_NOTICE = {
  submissionType: "infringement" as const,
  claimantName: "Jamie Rightsholder",
  replyEmail: "jamie@example.com",
  workDescription: "My novel, 'Example Title'",
  contentUrl: "https://seeparah.com/read/some-book-id",
  ownershipExplanation: "I am the original author and sole rights holder.",
  detailedRequest: "Please remove this unauthorized copy.",
  goodFaithStatement: true as const,
  accuracyDeclaration: true as const,
  signature: "Jamie Rightsholder",
};

describe("SUPPORT_REQUEST_SCHEMA", () => {
  it("accepts a valid submission", () => {
    const result = SUPPORT_REQUEST_SCHEMA.safeParse(VALID_SUPPORT_REQUEST);
    expect(result.success).toBe(true);
  });

  it("normalizes the reply email (trim + lowercase)", () => {
    const result = SUPPORT_REQUEST_SCHEMA.parse({
      ...VALID_SUPPORT_REQUEST,
      replyEmail: "  Jamie@Example.COM  ",
    });
    expect(result.replyEmail).toBe("jamie@example.com");
  });

  it("rejects an unknown request type", () => {
    const result = SUPPORT_REQUEST_SCHEMA.safeParse({
      ...VALID_SUPPORT_REQUEST,
      requestType: "not_a_real_type",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing/invalid reply email", () => {
    expect(
      SUPPORT_REQUEST_SCHEMA.safeParse({ ...VALID_SUPPORT_REQUEST, replyEmail: "not-an-email" })
        .success,
    ).toBe(false);
  });

  it("rejects a subject under 3 characters", () => {
    expect(
      SUPPORT_REQUEST_SCHEMA.safeParse({ ...VALID_SUPPORT_REQUEST, subject: "ab" }).success,
    ).toBe(false);
  });

  it("rejects an empty message", () => {
    expect(
      SUPPORT_REQUEST_SCHEMA.safeParse({ ...VALID_SUPPORT_REQUEST, message: "" }).success,
    ).toBe(false);
  });

  it("rejects when the accuracy confirmation is not exactly true", () => {
    expect(
      SUPPORT_REQUEST_SCHEMA.safeParse({ ...VALID_SUPPORT_REQUEST, confirmedAccurate: false })
        .success,
    ).toBe(false);
  });

  it("rejects a pageUrl that isn't http(s)", () => {
    expect(
      SUPPORT_REQUEST_SCHEMA.safeParse({
        ...VALID_SUPPORT_REQUEST,
        pageUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("accepts a well-formed pageUrl and accepts omitting it", () => {
    expect(
      SUPPORT_REQUEST_SCHEMA.safeParse({
        ...VALID_SUPPORT_REQUEST,
        pageUrl: "https://seeparah.com/library",
      }).success,
    ).toBe(true);
    expect(SUPPORT_REQUEST_SCHEMA.safeParse(VALID_SUPPORT_REQUEST).success).toBe(true);
  });

  it("accepts an empty honeypot and a filled one alike at the schema level (rejection happens in the handler, not validation, so a bot gets no diagnostic error)", () => {
    expect(SUPPORT_REQUEST_SCHEMA.safeParse({ ...VALID_SUPPORT_REQUEST, honeypot: "" }).success).toBe(
      true,
    );
    expect(
      SUPPORT_REQUEST_SCHEMA.safeParse({ ...VALID_SUPPORT_REQUEST, honeypot: "bot-filled-this" })
        .success,
    ).toBe(true);
  });
});

describe("COPYRIGHT_REQUEST_SCHEMA", () => {
  it("accepts a valid infringement notice, preserving all structured fields", () => {
    const result = COPYRIGHT_REQUEST_SCHEMA.parse(VALID_COPYRIGHT_NOTICE);
    expect(result).toMatchObject({
      submissionType: "infringement",
      claimantName: "Jamie Rightsholder",
      workDescription: VALID_COPYRIGHT_NOTICE.workDescription,
      contentUrl: VALID_COPYRIGHT_NOTICE.contentUrl,
      ownershipExplanation: VALID_COPYRIGHT_NOTICE.ownershipExplanation,
      detailedRequest: VALID_COPYRIGHT_NOTICE.detailedRequest,
      goodFaithStatement: true,
      accuracyDeclaration: true,
      signature: "Jamie Rightsholder",
    });
  });

  it("accepts a valid counter-notice with the same required structured fields", () => {
    const result = COPYRIGHT_REQUEST_SCHEMA.safeParse({
      ...VALID_COPYRIGHT_NOTICE,
      submissionType: "counter_notice",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.submissionType).toBe("counter_notice");
  });

  it("rejects an unknown submission type", () => {
    expect(
      COPYRIGHT_REQUEST_SCHEMA.safeParse({ ...VALID_COPYRIGHT_NOTICE, submissionType: "other" })
        .success,
    ).toBe(false);
  });

  it("rejects when good-faith statement is not exactly true", () => {
    expect(
      COPYRIGHT_REQUEST_SCHEMA.safeParse({
        ...VALID_COPYRIGHT_NOTICE,
        goodFaithStatement: false,
      }).success,
    ).toBe(false);
  });

  it("rejects when accuracy declaration is not exactly true", () => {
    expect(
      COPYRIGHT_REQUEST_SCHEMA.safeParse({
        ...VALID_COPYRIGHT_NOTICE,
        accuracyDeclaration: false,
      }).success,
    ).toBe(false);
  });

  it("rejects a missing electronic signature", () => {
    expect(
      COPYRIGHT_REQUEST_SCHEMA.safeParse({ ...VALID_COPYRIGHT_NOTICE, signature: "" }).success,
    ).toBe(false);
  });

  it("rejects a missing content URL", () => {
    expect(
      COPYRIGHT_REQUEST_SCHEMA.safeParse({ ...VALID_COPYRIGHT_NOTICE, contentUrl: "" }).success,
    ).toBe(false);
  });

  it("allows organization to be omitted", () => {
    const { organization: _organization, ...withoutOrg } = VALID_COPYRIGHT_NOTICE as Record<
      string,
      unknown
    >;
    expect(COPYRIGHT_REQUEST_SCHEMA.safeParse(withoutOrg).success).toBe(true);
  });
});
