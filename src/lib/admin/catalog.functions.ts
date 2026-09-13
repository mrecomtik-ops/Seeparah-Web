import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

const MAX_UPLOAD_BASE64_CHARS = 90 * 1024 * 1024; // ~65MB decoded, generous ceiling for a single-book EPUB

export const adminListCatalog = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      status: z.string().optional(),
      query: z.string().optional(),
      page: z.number().int().min(1).default(1),
      perPage: z.number().int().min(1).max(100).default(25),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "catalog.read_unpublished");
    const { adminListBooks } = await import("@/lib/admin/catalog.server");
    return adminListBooks({
      status: data.status,
      query: data.query,
      page: data.page,
      perPage: data.perPage,
    });
  });

export const adminGetCatalogBook = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ bookId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "catalog.read_unpublished");
    const { adminGetBook, evaluatePublishGate } = await import("@/lib/admin/catalog.server");
    const [detail, gate] = await Promise.all([
      adminGetBook(data.bookId),
      evaluatePublishGate(data.bookId),
    ]);
    return { ...detail, gate };
  });

export const adminReviewBookRights = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.review");
    const { reviewRights } = await import("@/lib/admin/catalog.server");
    const diff = await reviewRights({
      bookId: data.bookId,
      decision: data.decision,
      reviewerId: userId,
      notes: data.notes,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.rights_review",
      entityType: "book",
      entityId: data.bookId,
      reason: data.notes,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

export const adminReviewBookEdition = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      decision: z.enum(["approved", "changes_requested", "rejected"]),
      notes: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.review");
    const { reviewEdition } = await import("@/lib/admin/catalog.server");
    const diff = await reviewEdition({
      bookId: data.bookId,
      decision: data.decision,
      reviewerId: userId,
      notes: data.notes,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.edition_review",
      entityType: "book",
      entityId: data.bookId,
      reason: data.notes,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

export const adminPublishCatalogBook = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ bookId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.publish");
    const { publishBook } = await import("@/lib/admin/catalog.server");
    const diff = await publishBook(data.bookId, userId);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.publish",
      entityType: "book",
      entityId: data.bookId,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

export const adminSetBookLifecycle = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      status: z.enum(["unpublished", "archived"]),
      reason: z.string().min(3),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.publish");
    const { setBookLifecycleStatus } = await import("@/lib/admin/catalog.server");
    const diff = await setBookLifecycleStatus({
      bookId: data.bookId,
      status: data.status,
      reviewerId: userId,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: `catalog.${data.status}`,
      entityType: "book",
      entityId: data.bookId,
      reason: data.reason,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

const rightsInputShape = {
  title: z.string().min(1),
  author: z.string().min(1),
  sourceLanguage: z.string().min(1),
  description: z.string().min(1),
  genre: z.string().optional(),
  categories: z.array(z.string()).optional(),
  translator: z.string().optional(),
  coverUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceEditionId: z.string().optional(),
  rightsBasis: z.string().min(1),
  rightsEvidenceUrl: z.string().optional(),
  attribution: z.string().optional(),
  permittedTerritories: z.array(z.string()).optional(),
  translationPermission: z.boolean(),
  importKey: z.string().optional(),
};

export const adminUploadPlainTextBook = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ ...rightsInputShape, manuscriptText: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.upload");
    const { adminCreateBook } = await import("@/lib/admin/catalog.server");
    const { accessToken: _t, manuscriptText, ...rest } = data;
    void _t;
    const result = await adminCreateBook({ ...rest, manuscriptText }, userId);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.upload",
      entityType: "book",
      entityId: result.bookId,
      after: { created: result.created, chapterCount: result.chapterCount, reason: result.reason },
    });
    return result;
  });

export const adminUploadEpubBook = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      ...rightsInputShape,
      fileBase64: z.string().min(1).max(MAX_UPLOAD_BASE64_CHARS),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.upload");
    const { extractEpubToManuscriptText, adminCreateBook } =
      await import("@/lib/admin/catalog.server");
    const bytes = Buffer.from(data.fileBase64, "base64");
    const { text, warnings } = await extractEpubToManuscriptText(new Uint8Array(bytes));
    const { accessToken: _t, fileBase64: _f, ...rest } = data;
    void _t;
    void _f;
    const result = await adminCreateBook({ ...rest, manuscriptText: text }, userId);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.upload_epub",
      entityType: "book",
      entityId: result.bookId,
      after: { created: result.created, chapterCount: result.chapterCount, warnings },
    });
    return { ...result, warnings };
  });

export const adminParseCsvManifest = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ csvText: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "catalog.upload");
    const { parseCsvManifest } = await import("@/lib/admin/catalog.server");
    return parseCsvManifest(data.csvText);
  });

export const adminRunBatchImport = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      csvText: z.string().min(1),
      dryRun: z.boolean(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.upload");
    const { parseCsvManifest, adminBatchImport } = await import("@/lib/admin/catalog.server");
    const { rows } = parseCsvManifest(data.csvText);
    const results = await adminBatchImport({ rows, uploaderId: userId, dryRun: data.dryRun });
    if (!data.dryRun) {
      await recordAudit({
        actorId: userId,
        actorRole: role,
        action: "catalog.batch_import",
        entityType: "batch_import",
        after: {
          rowCount: rows.length,
          created: results.filter((r) => r.ok && r.created).length,
          failed: results.filter((r) => !r.ok).length,
        },
      });
    }
    return results;
  });

export const adminReviewAndPublishTranslationEdition = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "translation.jobs.manage");
    const { publishReviewedEdition } = await import("@/lib/translation.server");
    const result = await publishReviewedEdition(data.jobId, userId);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "translation.review_and_publish",
      entityType: "translation_job",
      entityId: data.jobId,
    });
    return result;
  });

/**
 * Admin/editor-triggered: start (or resume, idempotently) production of a
 * book+language edition. This is the only way to queue a standard
 * English/Urdu translation for an admin-uploaded book, since those have no
 * author account to use the author-facing request action (see
 * requestTranslationJob in translation.functions.ts, which is gated on
 * authorship and therefore unreachable for author_id = null books). Never
 * calls Gemini itself — only creates job/section rows for the worker.
 */
export const adminQueueTranslationJob = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ bookId: z.string(), language: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "translation.jobs.manage");
    const { ensureTranslationJob } = await import("@/lib/translation.server");
    const job = await ensureTranslationJob({
      bookId: data.bookId,
      language: data.language,
      requestedBy: userId,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "translation.queue_job",
      entityType: "translation_job",
      entityId: job.id,
      after: { bookId: data.bookId, language: data.language },
    });
    return job;
  });
