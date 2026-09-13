import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

export const adminListAuditLog = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      page: z.number().int().min(1).default(1),
      perPage: z.number().int().min(1).max(100).default(50),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "audit.read");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    const from = (data.page - 1) * data.perPage;
    const { data: rows, error, count } = await q.range(from, from + data.perPage - 1);
    if (error) throw new Error(error.message);
    return { entries: rows ?? [], total: count ?? 0 };
  });
