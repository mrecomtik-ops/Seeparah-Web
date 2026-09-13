import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";
import { enforceRateLimit } from "@/lib/admin/rate-limit.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

export const adminGetHealthSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({}).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "health.read");
    const { getHealthSnapshot } = await import("@/lib/admin/health.server");
    return getHealthSnapshot();
  });

export const adminRecoverRetryJob = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "health.recover");
    await enforceRateLimit({
      actorId: userId,
      action: "health.retry_job",
      targetId: data.jobId,
      limit: 30,
      windowMinutes: 60,
    });
    const { recoverRetryJob } = await import("@/lib/admin/health.server");
    const result = await recoverRetryJob(data.jobId);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "health.retry_job",
      entityType: "translation_job",
      entityId: data.jobId,
    });
    return result;
  });

export const adminRecoverResumeJob = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "health.recover");
    await enforceRateLimit({
      actorId: userId,
      action: "health.resume_job",
      targetId: data.jobId,
      limit: 60,
      windowMinutes: 60,
    });
    const { recoverResumeJob } = await import("@/lib/admin/health.server");
    const result = await recoverResumeJob(data.jobId);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "health.resume_job",
      entityType: "translation_job",
      entityId: data.jobId,
    });
    return result;
  });

export const adminMarkErrorResolved = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ errorId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "health.recover");
    const { markErrorResolved } = await import("@/lib/admin/health.server");
    await markErrorResolved(data.errorId, userId);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "health.resolve_error",
      entityType: "error_event",
      entityId: data.errorId,
    });
    return { ok: true as const };
  });
