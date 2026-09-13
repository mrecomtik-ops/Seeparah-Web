import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";
import { enforceRateLimit } from "@/lib/admin/rate-limit.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

export const searchAdminUsers = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      query: z.string().default(""),
      page: z.number().int().min(1).default(1),
      perPage: z.number().int().min(1).max(100).default(25),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "users.read");
    const { searchUsers } = await import("@/lib/admin/users.server");
    return searchUsers({ query: data.query, page: data.page, perPage: data.perPage });
  });

export const getAdminUserDetail = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ userId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "users.read");
    const { getUserDetail } = await import("@/lib/admin/users.server");
    return getUserDetail(data.userId);
  });

export const suspendUserAccount = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ userId: z.string(), reason: z.string().min(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId: actorId, role } = await requireAdmin(data.accessToken, "users.support_actions");
    await enforceRateLimit({
      actorId,
      action: "user.suspend",
      targetId: data.userId,
      limit: 20,
      windowMinutes: 60,
    });
    const { suspendAccount } = await import("@/lib/admin/users.server");
    await suspendAccount(data.userId);
    await recordAudit({
      actorId,
      actorRole: role,
      action: "user.suspend",
      entityType: "auth_user",
      entityId: data.userId,
      reason: data.reason,
    });
    return { ok: true as const };
  });

export const restoreUserAccount = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ userId: z.string(), reason: z.string().min(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId: actorId, role } = await requireAdmin(data.accessToken, "users.support_actions");
    await enforceRateLimit({
      actorId,
      action: "user.restore",
      targetId: data.userId,
      limit: 20,
      windowMinutes: 60,
    });
    const { restoreAccount } = await import("@/lib/admin/users.server");
    await restoreAccount(data.userId);
    await recordAudit({
      actorId,
      actorRole: role,
      action: "user.restore",
      entityType: "auth_user",
      entityId: data.userId,
      reason: data.reason,
    });
    return { ok: true as const };
  });

export const sendUserRecoveryEmail = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      userId: z.string(),
      email: z.string().email(),
      reason: z.string().min(3),
      redirectTo: z.string().url(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId: actorId, role } = await requireAdmin(data.accessToken, "users.support_actions");
    await enforceRateLimit({
      actorId,
      action: "user.recovery_email",
      targetId: data.userId,
      limit: 10,
      windowMinutes: 60,
    });
    const { getUserDetail, sendRecoveryEmail } = await import("@/lib/admin/users.server");
    const user = await getUserDetail(data.userId);
    if (!user) throw new Error("User not found");
    if (!user.hasPassword) {
      throw new Error(
        "This account signs in with Google only — there is no Seeparah password to reset",
      );
    }
    await sendRecoveryEmail(data.email, data.redirectTo);
    await recordAudit({
      actorId,
      actorRole: role,
      action: "user.recovery_email_requested",
      entityType: "auth_user",
      entityId: data.userId,
      reason: data.reason,
      after: { requested_to: data.email },
    });
    return { ok: true as const };
  });

export const resendUserVerificationEmail = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ userId: z.string(), email: z.string().email(), reason: z.string().min(3) }).parse(
      data,
    ),
  )
  .handler(async ({ data }) => {
    const { userId: actorId, role } = await requireAdmin(data.accessToken, "users.support_actions");
    await enforceRateLimit({
      actorId,
      action: "user.verification_email",
      targetId: data.userId,
      limit: 10,
      windowMinutes: 60,
    });
    const { resendVerificationEmail } = await import("@/lib/admin/users.server");
    await resendVerificationEmail(data.email);
    await recordAudit({
      actorId,
      actorRole: role,
      action: "user.verification_email_requested",
      entityType: "auth_user",
      entityId: data.userId,
      reason: data.reason,
      after: { requested_to: data.email },
    });
    return { ok: true as const };
  });

export const repairUserAuthorProfile = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ userId: z.string(), reason: z.string().min(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId: actorId, role } = await requireAdmin(data.accessToken, "users.support_actions");
    const { repairAuthorProfile } = await import("@/lib/admin/users.server");
    const result = await repairAuthorProfile(data.userId);
    await recordAudit({
      actorId,
      actorRole: role,
      action: "user.repair_author_profile",
      entityType: "auth_user",
      entityId: data.userId,
      reason: data.reason,
      after: result,
    });
    return result;
  });
