import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "@/lib/require-user.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

/** Author-triggered: start (or resume, idempotently) a background
 * translation job for a book+language. Never translates synchronously —
 * this only creates the job/section rows; a worker processes them later. */
export const requestTranslationJob = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ bookId: z.string(), language: z.string() }).parse(data),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { requestTranslationJob: run } = await import("@/lib/translation.server");
    return run({ bookId: data.bookId, language: data.language, requestedBy: userId });
  });

/** Author-facing "process now" — processes one small bounded batch and
 * returns; call it again (or wait for the cron worker) to make further
 * progress. Never runs a whole book in one request. */
export const processTranslationBatch = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await requireUserId(data.accessToken);
    const { processTranslationJobBatch } = await import("@/lib/translation.server");
    return processTranslationJobBatch(data.jobId, 3);
  });

export const reviewAndPublishTranslation = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { reviewAndPublishJob } = await import("@/lib/translation.server");
    return reviewAndPublishJob(data.jobId, userId);
  });

export const retryFailedTranslationSections = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { retryFailedSections } = await import("@/lib/translation.server");
    return retryFailedSections(data.jobId, userId);
  });

export const cancelTranslationJob = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { cancelTranslationJob: run } = await import("@/lib/translation.server");
    return run(data.jobId, userId);
  });

/** Public, no auth required — same trust level as a book's own
 * available_languages (already public). Used by the book-detail and reader
 * pages to show "translation in progress" instead of a flat "not
 * available" for a language that already has an active job, without ever
 * implying it's readable yet. */
export const getBookTranslationLanguageStatus = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ bookId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { getBookTranslationLanguageStatus: run } = await import("@/lib/translation.server");
    return run(data.bookId);
  });

export const getBookTranslationStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ bookId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { getBookTranslationStatus: run } = await import("@/lib/translation.server");
    return run(data.bookId, userId);
  });

export const saveTranslationGuide = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      voiceAndRegister: z.string().optional(),
      characterNotes: z.string().optional(),
      terminology: z.record(z.string(), z.string()).optional(),
      settingContext: z.string().optional(),
      targetConventions: z.string().optional(),
      toneInstructions: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { saveTranslationGuide: run } = await import("@/lib/translation.server");
    return run({
      bookId: data.bookId,
      requesterId: userId,
      guide: {
        voiceAndRegister: data.voiceAndRegister,
        characterNotes: data.characterNotes,
        terminology: data.terminology,
        settingContext: data.settingContext,
        targetConventions: data.targetConventions,
        toneInstructions: data.toneInstructions,
      },
    });
  });

export const reportTranslationIssue = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      language: z.string(),
      chunkIndex: z.number().int().min(0),
      reason: z.string().min(1),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { reportTranslationIssue: run } = await import("@/lib/translation.server");
    return run({
      bookId: data.bookId,
      language: data.language,
      chunkIndex: data.chunkIndex,
      reason: data.reason,
      reporterId: userId,
    });
  });
