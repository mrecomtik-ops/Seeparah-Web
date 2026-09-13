import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

const ROLE = z.enum(["owner", "administrator", "editor", "support"]);

export const adminListRoles = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({}).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "roles.manage");
    const { listAdminUsers } = await import("@/lib/admin/roles.server");
    return listAdminUsers();
  });

export const adminGrantRole = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ userId: z.string(), role: ROLE, reason: z.string().min(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId: actorId, role: actorRole } = await requireAdmin(
      data.accessToken,
      "roles.manage",
    );
    const { grantRole } = await import("@/lib/admin/roles.server");
    const result = await grantRole({ userId: data.userId, role: data.role, grantedBy: actorId });
    await recordAudit({
      actorId,
      actorRole,
      action: "role.grant",
      entityType: "admin_user",
      entityId: data.userId,
      reason: data.reason,
      after: { role: data.role },
    });
    return result;
  });

export const adminRevokeRole = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ userId: z.string(), reason: z.string().min(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId: actorId, role: actorRole } = await requireAdmin(
      data.accessToken,
      "roles.manage",
    );
    const { revokeRole } = await import("@/lib/admin/roles.server");
    await revokeRole({ userId: data.userId, revokedBy: actorId });
    await recordAudit({
      actorId,
      actorRole,
      action: "role.revoke",
      entityType: "admin_user",
      entityId: data.userId,
      reason: data.reason,
    });
    return { ok: true as const };
  });
