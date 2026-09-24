// Plain Zod schemas for the public support/copyright forms — kept separate
// from src/lib/admin/support.functions.ts's createServerFn wrappers so they
// can be unit-tested directly (a createServerFn handler isn't callable
// outside the TanStack Start server runtime the way a plain schema is).
import { z } from "zod";

export const GENERAL_REQUEST_TYPE = z.enum([
  "general_support",
  "account",
  "reading_progress",
  "manuscript_publication",
  "translation_request",
  "complaint",
  "safety_abuse",
  "privacy_request",
  "accessibility",
  "other",
]);

export const NORMALIZED_EMAIL = z.string().trim().toLowerCase().email().max(254);

export const OPTIONAL_URL = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .refine((v) => !v || /^https?:\/\//i.test(v), {
    message: "URL must start with http:// or https://",
  });

export const COPYRIGHT_SUBMISSION_TYPE = z.enum(["infringement", "counter_notice"]);

export const SUPPORT_REQUEST_SCHEMA = z.object({
  requestType: GENERAL_REQUEST_TYPE,
  fullName: z.string().trim().min(1).max(200),
  replyEmail: NORMALIZED_EMAIL,
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(1).max(5000),
  pageUrl: OPTIONAL_URL,
  confirmedAccurate: z.literal(true),
  honeypot: z.string().optional(),
  accessToken: z.string().optional(),
});

export const COPYRIGHT_REQUEST_SCHEMA = z.object({
  submissionType: COPYRIGHT_SUBMISSION_TYPE,
  claimantName: z.string().trim().min(1).max(200),
  organization: z.string().trim().max(200).optional(),
  replyEmail: NORMALIZED_EMAIL,
  workDescription: z.string().trim().min(1).max(2000),
  contentUrl: z.string().trim().min(1).max(2000),
  ownershipExplanation: z.string().trim().min(1).max(3000),
  detailedRequest: z.string().trim().min(1).max(5000),
  goodFaithStatement: z.literal(true),
  accuracyDeclaration: z.literal(true),
  signature: z.string().trim().min(1).max(200),
  honeypot: z.string().optional(),
  accessToken: z.string().optional(),
});
