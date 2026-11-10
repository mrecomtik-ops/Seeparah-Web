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
    bookTitle: string;
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
    bookTitle: string;
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
  importer: {
    enabled: boolean;
    targetPublished: number;
    batchSize: number;
    lastBatchNumber: number;
    counts: Record<string, number>;
    lastFailures: { id: number; gutenbergId: number; lastError: string }[];
  };
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
      .select("id, book_id, language, status, updated_at, books!inner(title)")
      .eq("status", "processing")
      .lt("updated_at", stalledSince)
      .limit(50),
    db
      .from("book_translation_jobs")
      .select("id, book_id, language, failed_sections, last_error, books!inner(title)")
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

  // Gutenberg monitoring is private, serviced only after health.read
  // authentication in health.functions. Never expose private job metadata.
  const [settingsResult, ...statusResults] = await Promise.all([
    db.from("gutenberg_autopilot_settings")
      .select("enabled,target_published,batch_size,last_batch_number")
      .eq("id", 1).single(),
    ...["queued", "processing", "published", "in_review", "failed", "skipped"].map(
      (status) => db.from("gutenberg_import_jobs")
        .select("id", { count: "exact", head: true }).eq("status", status),
    ),
  ]);
  if (settingsResult.error) throw new Error("Importer settings unavailable: " + settingsResult.error.message);
  for (const result of statusResults) {
    if (result.error) throw new Error("Importer counts unavailable: " + result.error.message);
  }
  const { data: importFailures, error: importError } = await db.from("gutenberg_import_jobs")
    .select("id,gutenberg_id,last_error")
    .eq("status", "failed")
    .order("updated_at", { ascending: false }).limit(10);
  if (importError) throw new Error("Importer failures unavailable: " + importError.message);
  const counts: Record<string, number> = {};
  ["queued", "processing", "published", "in_review", "failed", "skipped"]
    .forEach((status, i) => { counts[status] = statusResults[i]?.count ?? 0; });

  const { isGeminiConfigured } = await import("@/lib/gemini.server");

  return {
    stalledJobs: (stalled ?? []).map((j) => ({
      id: j.id,
      bookId: j.book_id,
      bookTitle:
        (j.books as unknown as { title?: string } | null)?.title ?? "Unknown book",
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
      bookTitle:
        (j.books as unknown as { title?: string } | null)?.title ?? "Unknown book",
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
    importer: {
      enabled: settingsResult.data.enabled,
      targetPublished: settingsResult.data.target_published,
      batchSize: settingsResult.data.batch_size,
      lastBatchNumber: settingsResult.data.last_batch_number,
      counts,
      lastFailures: (importFailures ?? []).map((j) => ({
        id: j.id, gutenbergId: j.gutenberg_id, lastError: j.last_error ?? "Unknown failure",
      })),
    },
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

/** Safe emergency stop. There is deliberately no automatic resume action
 * while the independent-year and full-chapter gates remain unresolved. */
export async function pauseGutenbergImporter(): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db.from("gutenberg_autopilot_settings")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("id", 1).select("enabled").single();
  if (error) throw new Error(error.message);
  return data.enabled === false;
}
