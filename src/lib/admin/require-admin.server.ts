// Server-only. The single gate every admin server function must go through.
// Never trust a client-supplied role, userId, or "isAdmin" flag — this
// always re-derives the caller's identity from their Supabase access token
// and looks up their role from admin_users via the service-role client.
import { type AdminRole, type Capability, roleHasCapability } from "@/lib/admin/permissions";

export class AdminAuthError extends Error {
  code: "unauthorized" | "forbidden" | "mfa_required";
  constructor(code: "unauthorized" | "forbidden" | "mfa_required", message: string) {
    super(message);
    this.code = code;
  }
}

interface AdminContext {
  userId: string;
  role: AdminRole;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Verifies the access token, requires the caller to hold an active admin
 * role, requires the session to be at AAL2 (i.e. the admin has completed an
 * MFA challenge — Supabase issues aal2 only after a verified second factor),
 * and requires the role to carry `capability`. Throws AdminAuthError
 * otherwise; callers should map that to 401/403/428 in the HTTP layer.
 */
export async function requireAdmin(
  accessToken: string | null | undefined,
  capability: Capability,
): Promise<AdminContext> {
  if (!accessToken) throw new AdminAuthError("unauthorized", "Sign in required");
  const db = await admin();

  const { data, error } = await db.auth.getClaims(accessToken);
  if (error || !data?.claims?.sub) {
    throw new AdminAuthError("unauthorized", "Invalid or expired session");
  }
  const userId = data.claims.sub as string;
  const aal = (data.claims as Record<string, unknown>)["aal"];

  const { data: adminRow, error: adminError } = await db
    .from("admin_users")
    .select("role, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (adminError || !adminRow) {
    throw new AdminAuthError("forbidden", "This account does not hold an admin role");
  }
  const role = adminRow.role as AdminRole;

  if (aal !== "aal2") {
    throw new AdminAuthError(
      "mfa_required",
      "Admin actions require multi-factor authentication — complete an MFA challenge and retry",
    );
  }

  if (!roleHasCapability(role, capability)) {
    throw new AdminAuthError("forbidden", `The ${role} role does not include ${capability}`);
  }

  return { userId, role };
}

/** Non-throwing variant for read-only UI decisions (e.g. "does this admin
 * even have a role at all, to decide whether to render the /admin shell").
 * Never use this to authorize a mutation — use requireAdmin. */
export async function tryGetAdminRole(
  accessToken: string | null | undefined,
): Promise<AdminRole | null> {
  try {
    const db = await admin();
    const { data, error } = await db.auth.getClaims(accessToken ?? "");
    if (error || !data?.claims?.sub) return null;
    const { data: adminRow } = await db
      .from("admin_users")
      .select("role")
      .eq("user_id", data.claims.sub as string)
      .is("revoked_at", null)
      .maybeSingle();
    return (adminRow?.role as AdminRole | undefined) ?? null;
  } catch {
    return null;
  }
}
