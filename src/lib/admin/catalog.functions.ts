import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

// This request body travels over Netlify's synchronous Functions transport
// (AWS Lambda underneath), which has a hard, non-negotiable 6MB request
// payload limit — Netlify cannot raise it, it's an AWS Lambda constraint.
// The previous 90MB ceiling here was unreachable in production: any EPUB
// over roughly 3MB would be rejected by Netlify's edge before this
// server function (or its Zod validator) ever ran, surfacing as an opaque
// network failure instead of this file's own error messages. 3MB raw is
// the largest file whose base64 encoding plus JSON overhead reliably
// stays under that 6MB cap.
export const MAX_UPLOAD_RAW_BYTES = 3 * 1024 * 1024;
const MAX_UPLOAD_BASE64_CHARS = Math.ceil(MAX_UPLOAD_RAW_BYTES / 3) * 4;

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
    const {
      adminGetBook,
      evaluatePublishGate,
      listBookEditions,
      scanBookRightsSignals,
    } = await import("@/lib/admin/catalog.server");
    const [detail, gate, editions, rightsSignals] = await Promise.all([
      adminGetBook(data.bookId),
      evaluatePublishGate(data.bookId),
      listBookEditions(data.bookId),
      scanBookRightsSignals(data.bookId),
    ]);
    return { ...detail, gate, editions, rightsSignals };
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

export const adminAcknowledgeBookRightsSignals = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ bookId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.review");
    const { acknowledgeRightsRiskSignals } = await import("@/lib/admin/catalog.server");
    const diff = await acknowledgeRightsRiskSignals({
      bookId: data.bookId,
      reviewerId: userId,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.rights_risk_acknowledged",
      entityType: "book",
      entityId: data.bookId,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

export const adminReviewBookReaderQuality = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      target: z.enum(["structure", "cleanup"]),
      decision: z.enum(["approved", "changes_requested", "rejected"]),
      notes: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.review");
    const { reviewReaderQuality } = await import("@/lib/admin/catalog.server");
    const diff = await reviewReaderQuality({
      bookId: data.bookId,
      target: data.target,
      decision: data.decision,
      reviewerId: userId,
      notes: data.notes,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: `catalog.${data.target}_review`,
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

const ACCESS_TYPE = z.enum(["free", "paid"]);

export const adminSetBookAccessType = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ bookId: z.string(), accessType: ACCESS_TYPE }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.publish");
    const { setBookAccessType } = await import("@/lib/admin/catalog.server");
    const diff = await setBookAccessType({ bookId: data.bookId, accessType: data.accessType });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.set_access_type",
      entityType: "book",
      entityId: data.bookId,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

export const adminSetEditionAccessType = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ bookId: z.string(), language: z.string(), accessType: ACCESS_TYPE }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.publish");
    const { setEditionAccessType } = await import("@/lib/admin/catalog.server");
    const diff = await setEditionAccessType({
      bookId: data.bookId,
      language: data.language,
      accessType: data.accessType,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.set_edition_access_type",
      entityType: "book_edition",
      entityId: `${data.bookId}:${data.language}`,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

/** Bulk edit — the client shows the exact selected-items preview before
 * ever calling this; the server applies for real and reports a per-target
 * result so a partial failure (e.g. one target is an edition that was
 * never published) doesn't hide whether the rest actually succeeded. */
export const adminBulkSetAccessType = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      targets: z
        .array(z.object({ bookId: z.string(), language: z.string().nullable() }))
        .min(1)
        .max(200),
      accessType: ACCESS_TYPE,
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.publish");
    const { bulkSetAccessType } = await import("@/lib/admin/catalog.server");
    const results = await bulkSetAccessType({ targets: data.targets, accessType: data.accessType });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.bulk_set_access_type",
      entityType: "book",
      after: {
        accessType: data.accessType,
        targetCount: data.targets.length,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
    });
    return results;
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

export const adminProcessTranslationJobBatch = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "translation.jobs.manage");
    const { processTranslationJobBatch } = await import("@/lib/translation.server");
    const result = await processTranslationJobBatch(data.jobId, 3);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "translation.process_batch",
      entityType: "translation_job",
      entityId: data.jobId,
      after: result as unknown as Record<string, unknown>,
    });
    return result;
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

// ============================================================================
// Rights & provenance editing (admin)
// ============================================================================
export const adminUpdateBookRightsProvenance = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      rightsBasis: z.string().min(1).max(4000),
      rightsEvidenceUrl: z.string().max(2000).nullable(),
      sourceUrl: z.string().max(2000).nullable(),
      attribution: z.string().max(2000).nullable(),
      translationPermission: z.boolean(),
      permittedTerritories: z.array(z.string().min(1).max(120)).max(100),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.review");
    const { updateBookRightsProvenance } = await import("@/lib/admin/catalog.server");
    const diff = await updateBookRightsProvenance({
      bookId: data.bookId,
      patch: {
        rightsBasis: data.rightsBasis,
        rightsEvidenceUrl: data.rightsEvidenceUrl,
        sourceUrl: data.sourceUrl,
        attribution: data.attribution,
        translationPermission: data.translationPermission,
        permittedTerritories: data.permittedTerritories,
      },
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.update_rights_provenance",
      entityType: "book",
      entityId: data.bookId,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

export const adminSetBookContentPolicy = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      classification: z.enum(["general", "religious"]),
      typographyProfile: z.enum([
        "standard",
        "scripture_arabic",
        "scripture_urdu",
        "scripture_hebrew",
        "scripture_indic",
        "facsimile_preserving",
      ]),
      authenticityNotes: z.string().max(5000).nullable().optional(),
      downgradeReason: z.string().max(2000).nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.publish");
    const { setBookContentPolicy } = await import("@/lib/admin/catalog.server");
    const diff = await setBookContentPolicy({
      bookId: data.bookId,
      classification: data.classification,
      typographyProfile: data.typographyProfile,
      actorRole: role,
      ...(data.authenticityNotes !== undefined
        ? { authenticityNotes: data.authenticityNotes }
        : {}),
      ...(data.downgradeReason !== undefined
        ? { downgradeReason: data.downgradeReason }
        : {}),
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.set_content_policy",
      entityType: "book",
      entityId: data.bookId,
      ...(data.downgradeReason ? { reason: data.downgradeReason } : {}),
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

export const adminImportVerifiedSourcedEdition = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      language: z.string().min(1),
      provenanceType: z.enum([
        "human_translation",
        "licensed_translation",
        "public_domain_translation",
      ]),
      typographyProfile: z.enum([
        "standard",
        "scripture_arabic",
        "scripture_urdu",
        "scripture_hebrew",
        "scripture_indic",
        "facsimile_preserving",
      ]),
      editionTitle: z.string().max(500).nullable().optional(),
      translator: z.string().max(500).nullable().optional(),
      sourceUrl: z.string().min(1).max(2000),
      sourceEditionId: z.string().max(500).nullable().optional(),
      rightsBasis: z.string().min(20).max(4000),
      rightsEvidenceUrl: z.string().min(1).max(2000),
      authenticityNotes: z.string().max(5000).nullable().optional(),
      manuscriptText: z.string().min(1),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "translation.jobs.manage");
    const { importVerifiedSourcedEdition } = await import("@/lib/admin/catalog.server");
    const result = await importVerifiedSourcedEdition({
      bookId: data.bookId,
      language: data.language,
      provenanceType: data.provenanceType,
      typographyProfile: data.typographyProfile,
      sourceUrl: data.sourceUrl,
      rightsBasis: data.rightsBasis,
      rightsEvidenceUrl: data.rightsEvidenceUrl,
      manuscriptText: data.manuscriptText,
      ...(data.editionTitle !== undefined ? { editionTitle: data.editionTitle } : {}),
      ...(data.translator !== undefined ? { translator: data.translator } : {}),
      ...(data.sourceEditionId !== undefined ? { sourceEditionId: data.sourceEditionId } : {}),
      ...(data.authenticityNotes !== undefined
        ? { authenticityNotes: data.authenticityNotes }
        : {}),
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "translation.import_verified_sourced_edition",
      entityType: "book",
      entityId: data.bookId,
      reason: "Verified sourced Religious translation imported and published free",
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  });

// ============================================================================
// Book metadata editing (admin)
// ============================================================================
export const adminUpdateBookMetadata = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      title: z.string().min(1).optional(),
      author: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      genre: z.string().nullable().optional(),
      coverUrl: z.string().nullable().optional(),
      editionTitle: z.string().max(500).nullable().optional(),
      editionYear: z.number().int().min(1).max(3000).nullable().optional(),
      publisher: z.string().max(500).nullable().optional(),
      isbn: z.string().max(100).nullable().optional(),
      sourceScanId: z.string().max(500).nullable().optional(),
      originalPublicationYear: z.number().int().min(-5000).max(3000).nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.publish");
    const { updateBookMetadata } = await import("@/lib/admin/catalog.server");
    const diff = await updateBookMetadata({
      bookId: data.bookId,
      patch: {
        title: data.title,
        author: data.author,
        description: data.description,
        genre: data.genre,
        coverUrl: data.coverUrl,
        editionTitle: data.editionTitle,
        editionYear: data.editionYear,
        publisher: data.publisher,
        isbn: data.isbn,
        sourceScanId: data.sourceScanId,
        originalPublicationYear: data.originalPublicationYear,
      },
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.update_metadata",
      entityType: "book",
      entityId: data.bookId,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

// ============================================================================
// Staged content editing (admin) — see migration 0013 and catalog.server.ts
// for the full rationale. Gated by catalog.review (the same capability
// that already owns rights/edition quality review), not catalog.publish —
// this is a content-quality action, not a catalog-lifecycle one.
// ============================================================================
export const adminGetChunkForEdit = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ bookId: z.string(), language: z.string(), chunkIndex: z.number().int().min(0) }).parse(
      data,
    ),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "catalog.review");
    const { getChunkForEdit } = await import("@/lib/admin/catalog.server");
    return getChunkForEdit({
      bookId: data.bookId,
      language: data.language,
      chunkIndex: data.chunkIndex,
    });
  });

export const adminStageChunkContentEdit = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookId: z.string(),
      language: z.string(),
      chunkIndex: z.number().int().min(0),
      newContent: z.string().min(1),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.review");
    const { stageChunkContentEdit } = await import("@/lib/admin/catalog.server");
    const diff = await stageChunkContentEdit({
      bookId: data.bookId,
      language: data.language,
      chunkIndex: data.chunkIndex,
      newContent: data.newContent,
      editorId: userId,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.chunk_edit_staged",
      entityType: "book_chunk",
      entityId: `${data.bookId}:${data.language}:${data.chunkIndex}`,
      before: { content: diff.before },
      after: { pending_content: diff.after },
    });
    return { ok: true as const };
  });

export const adminPublishChunkContentEdit = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ bookId: z.string(), language: z.string(), chunkIndex: z.number().int().min(0) }).parse(
      data,
    ),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.review");
    const { publishChunkContentEdit } = await import("@/lib/admin/catalog.server");
    const diff = await publishChunkContentEdit({
      bookId: data.bookId,
      language: data.language,
      chunkIndex: data.chunkIndex,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.chunk_edit_published",
      entityType: "book_chunk",
      entityId: `${data.bookId}:${data.language}:${data.chunkIndex}`,
      before: { content: diff.before },
      after: { content: diff.after },
    });
    return { ok: true as const };
  });

export const adminDiscardChunkContentEdit = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ bookId: z.string(), language: z.string(), chunkIndex: z.number().int().min(0) }).parse(
      data,
    ),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.review");
    const { discardChunkContentEdit } = await import("@/lib/admin/catalog.server");
    const diff = await discardChunkContentEdit({
      bookId: data.bookId,
      language: data.language,
      chunkIndex: data.chunkIndex,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.chunk_edit_discarded",
      entityType: "book_chunk",
      entityId: `${data.bookId}:${data.language}:${data.chunkIndex}`,
      before: { pending_content: diff.discarded },
      after: { pending_content: null },
    });
    return { ok: true as const };
  });

// ============================================================================
// Deletion — reversible (reuses adminSetBookLifecycle above, status:
// 'archived') vs. permanent (this section), gated separately by
// catalog.delete_permanent (owner/administrator only, never editor).
// ============================================================================
export const adminGetBookDeletionImpact = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ bookId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "catalog.delete_permanent");
    const { getBookDeletionImpact } = await import("@/lib/admin/catalog.server");
    return getBookDeletionImpact(data.bookId);
  });

export const adminDeleteBookPermanently = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ bookId: z.string(), confirmTitle: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.delete_permanent");
    const { getBookDeletionImpact, deleteBookPermanently } = await import(
      "@/lib/admin/catalog.server"
    );
    // Defense in depth beyond the confirm dialog itself — the exact title
    // must be re-typed and re-checked server-side, not just shown/compared
    // client-side, so a scripted/automated call can't skip the deliberate-
    // typing safety gate the UI enforces.
    const impact = await getBookDeletionImpact(data.bookId);
    if (data.confirmTitle.trim() !== impact.title) {
      throw new Error("Typed title doesn't match this book's actual title — deletion refused.");
    }
    const result = await deleteBookPermanently({ bookId: data.bookId });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.delete_permanent",
      entityType: "book",
      entityId: data.bookId,
      before: result.impact as unknown as Record<string, unknown>,
      after: null,
    });
    return { ok: true as const };
  });

// ============================================================================
// Book categories (admin) — assignment against the master list published at
// content_settings["categories"]; individual and bulk.
// ============================================================================
export const adminSetBookCategories = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ bookId: z.string(), categories: z.array(z.string()) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.categories.manage");
    const { setBookCategories } = await import("@/lib/admin/catalog.server");
    const diff = await setBookCategories({ bookId: data.bookId, categories: data.categories });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.set_categories",
      entityType: "book",
      entityId: data.bookId,
      before: { categories: diff.before },
      after: { categories: diff.after },
    });
    return { ok: true as const };
  });

export const adminBulkPatchBookCategory = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      bookIds: z.array(z.string()).min(1),
      category: z.string().min(1),
      action: z.enum(["add", "remove"]),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.categories.manage");
    const { bulkPatchBookCategory } = await import("@/lib/admin/catalog.server");
    const results = await bulkPatchBookCategory({
      bookIds: data.bookIds,
      category: data.category,
      action: data.action,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: `catalog.bulk_${data.action}_category`,
      entityType: "book",
      after: {
        category: data.category,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
    });
    return results;
  });

export const adminListCategorySuggestions = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ status: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "catalog.categories.manage");
    const { listCategorySuggestions } = await import("@/lib/admin/catalog.server");
    return listCategorySuggestions(data.status);
  });

export const adminDecideCategorySuggestion = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      suggestionId: z.string(),
      decision: z.enum(["approved", "declined"]),
      note: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.categories.manage");
    const { decideCategorySuggestion } = await import("@/lib/admin/catalog.server");
    const diff = await decideCategorySuggestion({
      suggestionId: data.suggestionId,
      decision: data.decision,
      decidedBy: userId,
      note: data.note,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.decide_category_suggestion",
      entityType: "category_suggestion",
      entityId: data.suggestionId,
      before: diff.before,
      after: { status: data.decision, note: data.note ?? null },
    });
    return { ok: true as const };
  });
