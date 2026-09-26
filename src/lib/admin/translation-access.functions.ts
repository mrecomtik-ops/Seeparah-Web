import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "@/lib/require-user.server";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

/** Reader-facing: request access to any supported missing-language edition. Any signed-in
 * reader can call this for themselves — it only ever records "I'd like
 * access", never grants anything by itself. */
export const requestBookTranslationAccess = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ bookId: z.string(), language: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { requestTranslationAccess } = await import("@/lib/admin/translation-access.server");
    return requestTranslationAccess({
      bookId: data.bookId,
      language: data.language,
      requesterId: userId,
    });
  });

export const listMyTranslationRequests = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({}).parse(data))
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("translation_requests")
      .select("*, books!inner(title, author, cover_url)")
      .eq("requester_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      // The translation-request pipeline (migration 0001) isn't applied in
      // every environment yet. Treat "table doesn't exist" as "no requests"
      // so the reader page still renders instead of blanking out.
      const missingTable =
        error.code === "PGRST205" ||
        error.code === "42P01" ||
        /translation_requests/.test(error.message ?? "");
      if (missingTable) return [];
      throw new Error(error.message);
    }
    return rows ?? [];
  });

export const adminListTranslationRequests = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      status: z.string().optional(),
      page: z.number().int().min(1).default(1),
      perPage: z.number().int().min(1).max(100).default(25),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "translation.requests.decide");
    const { listTranslationRequests } = await import("@/lib/admin/translation-access.server");
    return listTranslationRequests({ status: data.status, page: data.page, perPage: data.perPage });
  });

export const adminApproveTranslationRequest = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ requestId: z.string(), reason: z.string().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "translation.requests.decide");
    const { approveTranslationRequest } = await import("@/lib/admin/translation-access.server");
    const result = await approveTranslationRequest({
      requestId: data.requestId,
      reviewerId: userId,
      reason: data.reason,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "translation_request.approve",
      entityType: "translation_request",
      entityId: data.requestId,
      reason: data.reason,
      after: { status: result.status },
    });
    return result;
  });

export const adminDeclineTranslationRequest = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ requestId: z.string(), reason: z.string().min(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "translation.requests.decide");
    const { declineTranslationRequest } = await import("@/lib/admin/translation-access.server");
    await declineTranslationRequest({
      requestId: data.requestId,
      reviewerId: userId,
      reason: data.reason,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "translation_request.decline",
      entityType: "translation_request",
      entityId: data.requestId,
      reason: data.reason,
    });
    return { ok: true as const };
  });

export const adminRevokeTranslationAccess = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ requestId: z.string(), reason: z.string().min(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "translation.requests.decide");
    const { revokeTranslationAccess } = await import("@/lib/admin/translation-access.server");
    await revokeTranslationAccess({
      requestId: data.requestId,
      reviewerId: userId,
      reason: data.reason,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "translation_request.revoke",
      entityType: "translation_request",
      entityId: data.requestId,
      reason: data.reason,
    });
    return { ok: true as const };
  });

export const adminBulkApproveTranslationRequests = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ requestIds: z.array(z.string()).min(1), reason: z.string().optional() }).parse(
      data,
    ),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "translation.requests.decide");
    const { bulkApproveTranslationRequests } =
      await import("@/lib/admin/translation-access.server");
    const results = await bulkApproveTranslationRequests({
      requestIds: data.requestIds,
      reviewerId: userId,
      reason: data.reason,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "translation_request.bulk_approve",
      entityType: "translation_request",
      reason: data.reason,
      after: { count: data.requestIds.length, succeeded: results.filter((r) => r.ok).length },
    });
    return results;
  });
