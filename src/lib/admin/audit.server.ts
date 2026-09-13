// Server-only. Every privileged mutation made through the admin surface
// should call recordAudit right after it succeeds (or, for a rejected
// action, right after the rejection) so the audit_log table stays a
// complete record of who did what, to which entity, when, and why.
import type { AdminRole } from "@/lib/admin/permissions";
import type { Json } from "@/integrations/supabase/types";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const SECRET_KEY_PATTERN = /(key|token|secret|password|credential)/i;

/** Strips anything that looks like a secret/credential field and truncates
 * long text fields (manuscript bodies, etc.) so audit rows stay small and
 * never carry sensitive material. Never a substitute for not putting
 * secrets in `before`/`after` in the first place. The JSON round-trip at
 * the end guarantees the result is actually jsonb-safe (drops undefined/
 * function/symbol values rather than letting them reach the insert). */
export function redact(value: Record<string, unknown> | null | undefined): Json | null {
  if (!value) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}… [truncated, ${v.length} chars]`;
      continue;
    }
    out[k] = v;
  }
  return JSON.parse(JSON.stringify(out)) as Json;
}

export interface AuditEntry {
  actorId: string;
  actorRole: AdminRole;
  action: string;
  entityType: string;
  entityId?: string | null | undefined;
  reason?: string | null | undefined;
  before?: Record<string, unknown> | null | undefined;
  after?: Record<string, unknown> | null | undefined;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  const db = await admin();
  const { error } = await db.from("audit_log").insert({
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    reason: entry.reason ?? null,
    before: redact(entry.before),
    after: redact(entry.after),
  });
  // Audit-write failure must never silently vanish, but it also must never
  // block the mutation it's describing (the mutation already happened) —
  // log loudly so it surfaces in the health/error pipeline instead.
  if (error) {
    console.error(
      `[audit] failed to record ${entry.action} on ${entry.entityType}:${entry.entityId ?? ""}`,
      error,
    );
  }
}
