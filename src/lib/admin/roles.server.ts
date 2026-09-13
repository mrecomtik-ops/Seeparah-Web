// Server-only. Owner-only role management. There is no self-service path
// here at all — every grant/revoke requires an existing owner to be signed
// in with MFA and call these through the audited server function. The DB
// trigger in migration 0004 (prevent_last_owner_removal) is the hard
// backstop; the checks below give a clearer error before that point.
import type { AdminRole } from "@/lib/admin/permissions";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function listAdminUsers() {
  const db = await admin();
  const { data, error } = await db
    .from("admin_users")
    .select("*")
    .is("revoked_at", null)
    .order("granted_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function grantRole(params: { userId: string; role: AdminRole; grantedBy: string }) {
  const db = await admin();
  const { data: userCheck, error: userCheckError } = await db.auth.admin.getUserById(params.userId);
  if (userCheckError || !userCheck.user) throw new Error("No account exists with that user id");

  const { data, error } = await db
    .from("admin_users")
    .upsert(
      {
        user_id: params.userId,
        role: params.role,
        granted_by: params.grantedBy,
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revoked_by: null,
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function revokeRole(params: { userId: string; revokedBy: string }) {
  const db = await admin();
  const { data: current } = await db
    .from("admin_users")
    .select("role")
    .eq("user_id", params.userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!current) throw new Error("This account does not currently hold an admin role");
  if (current.role === "owner") {
    const { count } = await db
      .from("admin_users")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "owner")
      .is("revoked_at", null);
    if ((count ?? 0) <= 1) {
      throw new Error("Cannot revoke the last active owner");
    }
  }
  const { error } = await db
    .from("admin_users")
    .update({ revoked_at: new Date().toISOString(), revoked_by: params.revokedBy })
    .eq("user_id", params.userId);
  if (error) throw new Error(error.message);
}
