// Server-only. Admin health page data + a small allowlist of real recovery
// actions. No arbitrary SQL, no shell execution, no unrestricted table
// editing here — every action is a named function that does one specific,
// safe, already-idempotent thing.
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const STALLED_JOB_MINUTES = 30;

export interface HealthSnapshot {
  stalledJobs: {
    id: string;
    bookId: string;
    language: string;
    status: string;
    updatedAt: string;
  }[];
  failedJobs: {
    id: string;
    bookId: string;
    language: string;
    failedSections: number;
    lastError: string | null;
  }[];
  pendingRightsReview: number;
  pendingEditionReview: number;
  pendingTranslationRequests: number;
  openSupportTickets: number;
  unresolvedErrors: {
    id: string;
    severity: string;
    code: string;
    message: string;
    occurredAt: string;
  }[];
  geminiConfigured: boolean;
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const db = await admin();
  const stalledSince = new Date(Date.now() - STALLED_JOB_MINUTES * 60_000).toISOString();

  const [
    { data: stalled },
    { data: failed },
    { count: pendingRights },
    { count: pendingEdition },
    { count: pendingRequests },
    { count: openTickets },
    { data: errors },
  ] = await Promise.all([
    db
      .from("book_translation_jobs")
      .select("id, book_id, language, status, updated_at")
      .eq("status", "processing")
      .lt("updated_at", stalledSince)
      .limit(50),
    db
      .from("book_translation_jobs")
      .select("id, book_id, language, failed_sections, last_error")
      .eq("status", "failed")
      .limit(50),
    db
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("rights_status", "pending")
      .neq("status", "draft"),
    db
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("edition_review_status", "pending")
      .neq("status", "draft"),
    db
      .from("translation_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "requested"),
    db
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "pending"]),
    db
      .from("error_events")
      .select("id, severity, code, message, occurred_at")
      .eq("resolved", false)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);

  const { isGeminiConfigured } = await import("@/lib/gemini.server");

  return {
    stalledJobs: (stalled ?? []).map((j) => ({
      id: j.id,
      bookId: j.book_id,
      language: j.language,
      status: j.status,
      updatedAt: j.updated_at,
    })),
    failedJobs: (failed ?? []).map((j) => ({
      id: j.id,
      bookId: j.book_id,
      language: j.language,
      failedSections: j.failed_sections,
      lastError: j.last_error,
    })),
    pendingRightsReview: pendingRights ?? 0,
    pendingEditionReview: pendingEdition ?? 0,
    pendingTranslationRequests: pendingRequests ?? 0,
    openSupportTickets: openTickets ?? 0,
    unresolvedErrors: (errors ?? []).map((e) => ({
      id: e.id,
      severity: e.severity,
      code: e.code,
      message: e.message,
      occurredAt: e.occurred_at,
    })),
    geminiConfigured: isGeminiConfigured(),
  };
}

/** Allowlisted recovery action: retry a stalled/failed job's failed
 * sections. Reuses the same core retry logic an author's own retry action
 * uses — this is not a new, less-checked code path, just a different
 * authorization gate (the admin permission matrix, checked by the caller in
 * health.functions.ts before this runs). */
export async function recoverRetryJob(jobId: string) {
  const { retrySectionsCore } = await import("@/lib/translation.server");
  return retrySectionsCore(jobId);
}

/** Allowlisted recovery action: process one more bounded batch of a
 * stuck-but-not-failed job (e.g. the cron worker missed a cycle). */
export async function recoverResumeJob(jobId: string) {
  const { processTranslationJobBatch } = await import("@/lib/translation.server");
  return processTranslationJobBatch(jobId);
}

export async function markErrorResolved(errorId: string, resolvedBy: string) {
  const db = await admin();
  const { error } = await db
    .from("error_events")
    .update({ resolved: true, resolved_by: resolvedBy, resolved_at: new Date().toISOString() })
    .eq("id", errorId);
  if (error) throw new Error(error.message);
}
