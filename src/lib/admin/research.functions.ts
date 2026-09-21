import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

export const adminListResearchPapers = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ status: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "research.read_unpublished");
    const { adminListResearchPapers: run } = await import("@/lib/research.server");
    return run(data.status);
  });

export const adminGetResearchPaper = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ paperId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "research.read_unpublished");
    const { adminGetResearchPaper: run } = await import("@/lib/research.server");
    return run(data.paperId);
  });

export const adminReviewResearchPaper = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      paperId: z.string(),
      decision: z.enum(["changes_requested", "approved", "rejected"]),
      notes: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "research.review");
    const { reviewResearchPaper } = await import("@/lib/research.server");
    const diff = await reviewResearchPaper({
      paperId: data.paperId,
      decision: data.decision,
      reviewerId: userId,
      notes: data.notes,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "research.review",
      entityType: "research_paper",
      entityId: data.paperId,
      reason: data.notes,
      before: diff.before,
      after: diff.after,
    });
    return { ok: true as const };
  });

export const adminPublishResearchPaper = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ paperId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "research.publish");
    const { publishPaperVersion } = await import("@/lib/research.server");
    const result = await publishPaperVersion({ paperId: data.paperId, publisherId: userId });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "research.publish",
      entityType: "research_paper",
      entityId: data.paperId,
      after: { versionId: result.versionId, version: result.version },
    });
    return { ok: true as const };
  });

export const adminWithdrawResearchPaper = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ paperId: z.string(), reason: z.string().min(3) }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "research.publish");
    const { withdrawPublishedPaper } = await import("@/lib/research.server");
    const diff = await withdrawPublishedPaper({
      paperId: data.paperId,
      actorId: userId,
      reason: data.reason,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "research.withdraw",
      entityType: "research_paper",
      entityId: data.paperId,
      reason: data.reason,
      before: diff.before,
      after: { status: "unpublished" },
    });
    return { ok: true as const };
  });
