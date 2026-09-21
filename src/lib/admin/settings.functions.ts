import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

const KEY = z.enum([
  "home_collections",
  "featured_books",
  "categories",
  "announcements",
  "support_contact",
  "maintenance_message",
  "language_availability",
  "translation_budget",
  "monetization_enabled",
  "monthly_plan_price_usd",
]);

/** Public, unauthenticated — the config contract both clients fetch. */
export const getPublicContentSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicSettings } = await import("@/lib/admin/settings.server");
  return getPublicSettings();
});

export const adminGetSetting = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ key: KEY }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "settings.manage");
    const { getSetting } = await import("@/lib/admin/settings.server");
    return getSetting(data.key);
  });

export const adminPublishSetting = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ key: KEY, value: z.unknown() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "settings.manage");
    const { publishSetting } = await import("@/lib/admin/settings.server");
    const before = await (await import("@/lib/admin/settings.server")).getSetting(data.key);
    const result = await publishSetting({ key: data.key, value: data.value, updatedBy: userId });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "settings.publish",
      entityType: "content_setting",
      entityId: data.key,
      before: before ? { version: before.version, value: before.value } : null,
      after: { version: result.version, value: data.value },
    });
    return result;
  });

export const adminRollbackSetting = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ key: KEY, toVersion: z.number().int().positive() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "settings.manage");
    const { rollbackSetting } = await import("@/lib/admin/settings.server");
    const result = await rollbackSetting({
      key: data.key,
      toVersion: data.toVersion,
      updatedBy: userId,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "settings.rollback",
      entityType: "content_setting",
      entityId: data.key,
      after: { rolledBackTo: data.toVersion, newVersion: result.version },
    });
    return result;
  });

export const adminListSettingHistory = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ key: KEY }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "settings.manage");
    const { listSettingHistory } = await import("@/lib/admin/settings.server");
    return listSettingHistory(data.key);
  });

export const adminGetSecretsStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({}).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "settings.secrets_status.read");
    const { getSecretsStatus } = await import("@/lib/admin/settings.server");
    return getSecretsStatus();
  });
