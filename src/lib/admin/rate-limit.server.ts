// Server-only. Simple per-actor, per-action, sliding-window rate limit for
// sensitive admin/support actions (recovery emails, suspensions, etc.). Not
// meant for high-frequency API throttling — just "an admin can't send 500
// recovery emails in a minute," including by accident from a retry loop.
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export class RateLimitError extends Error {
  constructor(action: string, limit: number, windowMinutes: number) {
    super(`Rate limit exceeded for "${action}": max ${limit} per ${windowMinutes} minute(s)`);
  }
}

/** Throws RateLimitError if the actor has already performed `action` at
 * least `limit` times within the trailing `windowMinutes`; otherwise records
 * this attempt and returns. Call this immediately before performing the
 * action, not after. */
export async function enforceRateLimit(params: {
  actorId: string;
  action: string;
  targetId?: string | null;
  limit: number;
  windowMinutes: number;
}): Promise<void> {
  const db = await admin();
  const since = new Date(Date.now() - params.windowMinutes * 60_000).toISOString();
  const { count, error } = await db
    .from("admin_action_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", params.actorId)
    .eq("action", params.action)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= params.limit) {
    throw new RateLimitError(params.action, params.limit, params.windowMinutes);
  }
  await db.from("admin_action_events").insert({
    actor_id: params.actorId,
    action: params.action,
    target_id: params.targetId ?? null,
  });
}
