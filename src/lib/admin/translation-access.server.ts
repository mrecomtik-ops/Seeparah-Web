import { REQUESTABLE_TRANSLATION_LANGUAGES } from "@/lib/data";
// Server-only. Reader-requested translation access for Seeparah's supported major languages:
// requesting is separate from production, and production is separate from
// the per-reader grant. Approving a request for an edition that's already
// reviewed and published grants access immediately with no AI call at all.
// Approving a request for a missing edition queues (or reuses) exactly one
// production job for that book+language — a second reader requesting the
// same missing edition reuses the same job, never starts a second one —
// and only that requester is granted once it's ready, never every requester
// who happened to ask, unless each is separately approved.
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const REQUESTABLE_LANGUAGES = new Set<string>(REQUESTABLE_TRANSLATION_LANGUAGES);

export async function requestTranslationAccess(params: {
  bookId: string;
  language: string;
  requesterId: string;
}) {
  if (!REQUESTABLE_LANGUAGES.has(params.language)) {
    throw new Error(`${params.language} does not require a reader access request`);
  }
  const db = await admin();
  const { data: book } = await db
    .from("books")
    .select("id, source_language, content_classification, translation_generation_policy")
    .eq("id", params.bookId)
    .single();
  if (!book) throw new Error("Book not found");
  if (book.source_language === params.language) {
    throw new Error("This is the book's original language — it's already free to read");
  }
  if (
    book.content_classification === "religious" ||
    book.translation_generation_policy === "source_only"
  ) {
    throw new Error(
      "Seeparah does not machine-translate Religious/source-only books. Verified sourced editions are added by the catalog team and remain free.",
    );
  }

  const { data: existing } = await db
    .from("translation_requests")
    .select("*")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("requester_id", params.requesterId)
    .maybeSingle();
  if (existing) return existing; // idempotent: re-requesting returns the same row, never a duplicate

  const { data: row, error } = await db
    .from("translation_requests")
    .insert({
      book_id: params.bookId,
      language: params.language,
      requester_id: params.requesterId,
      status: "requested",
    })
    .select()
    .single();
  if (error || !row) {
    // unique-constraint race
    const { data: raceWinner } = await db
      .from("translation_requests")
      .select("*")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .eq("requester_id", params.requesterId)
      .maybeSingle();
    if (raceWinner) return raceWinner;
    throw new Error(error?.message ?? "Could not submit the request");
  }
  return row;
}

export async function listTranslationRequests(params: {
  status?: string | undefined;
  page: number;
  perPage: number;
}) {
  const db = await admin();
  let q = db
    .from("translation_requests")
    .select("*, books!inner(title, author, source_language)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (params.status) q = q.eq("status", params.status);
  const from = (params.page - 1) * params.perPage;
  const { data, error, count } = await q.range(from, from + params.perPage - 1);
  if (error) throw new Error(error.message);
  return { requests: data ?? [], total: count ?? 0 };
}

async function findReviewedEditionJob(bookId: string, language: string) {
  const db = await admin();
  const { data: book } = await db.from("books").select("source_version").eq("id", bookId).single();
  if (!book) return null;
  const { data: job } = await db
    .from("book_translation_jobs")
    .select("*")
    .eq("book_id", bookId)
    .eq("language", language)
    .eq("source_version", book.source_version)
    .eq("status", "published")
    .eq("human_reviewed", true)
    .maybeSingle();
  return job ?? null;
}

/**
 * Approves one request. If a reviewed edition already exists, grants access
 * immediately (no AI call). If not, queues (or reuses) exactly one
 * production job and marks this request "approved_awaiting_edition" — it
 * becomes "granted" automatically only once that same job publishes (see
 * onTranslationEditionPublished below), and only for requesters who were
 * separately approved into that state, not every requester of that book.
 */
export async function approveTranslationRequest(params: {
  requestId: string;
  reviewerId: string;
  reason?: string | undefined;
}) {
  const db = await admin();
  const { data: request, error } = await db
    .from("translation_requests")
    .select("*")
    .eq("id", params.requestId)
    .single();
  if (error || !request) throw new Error("Request not found");
  if (request.status === "granted") return request;
  if (!["requested", "approved_awaiting_edition"].includes(request.status)) {
    throw new Error(`Request is not in a decidable state (status: ${request.status})`);
  }

  const { data: rightsBook, error: rightsBookError } = await db
    .from("books")
    .select("rights_status, translation_permission, content_classification, translation_generation_policy")
    .eq("id", request.book_id)
    .single();
  if (rightsBookError || !rightsBook) throw new Error("Book not found");
  if (rightsBook.rights_status !== "approved") {
    throw new Error("Approve the book's rights review before approving a translation request");
  }
  if (
    rightsBook.content_classification === "religious" ||
    rightsBook.translation_generation_policy === "source_only"
  ) {
    throw new Error(
      "Religious/source-only books cannot enter the AI translation pipeline. Add a verified sourced edition instead.",
    );
  }
  if (!rightsBook.translation_permission) {
    throw new Error("This book's rights record does not currently permit translation");
  }

  const reviewedJob = await findReviewedEditionJob(request.book_id, request.language);
  if (reviewedJob) {
    const { data: updated, error: updateError } = await db
      .from("translation_requests")
      .update({
        status: "granted",
        job_id: reviewedJob.id,
        reviewed_by: params.reviewerId,
        reviewed_at: new Date().toISOString(),
        decision_reason: params.reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.requestId)
      .select()
      .single();
    if (updateError) throw new Error(updateError.message);
    return updated;
  }

  const { ensureTranslationJob } = await import("@/lib/translation.server");
  const job = await ensureTranslationJob({
    bookId: request.book_id,
    language: request.language,
    requestedBy: params.reviewerId,
  });

  const { data: updated, error: updateError } = await db
    .from("translation_requests")
    .update({
      status: "approved_awaiting_edition",
      job_id: job.id,
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
      decision_reason: params.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.requestId)
    .select()
    .single();
  if (updateError) throw new Error(updateError.message);
  return updated;
}

export async function declineTranslationRequest(params: {
  requestId: string;
  reviewerId: string;
  reason: string;
}) {
  const db = await admin();
  const { error } = await db
    .from("translation_requests")
    .update({
      status: "declined",
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
      decision_reason: params.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.requestId);
  if (error) throw new Error(error.message);
}

export async function revokeTranslationAccess(params: {
  requestId: string;
  reviewerId: string;
  reason: string;
}) {
  const db = await admin();
  const { error } = await db
    .from("translation_requests")
    .update({
      status: "revoked",
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
      decision_reason: params.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.requestId)
    .eq("status", "granted");
  if (error) throw new Error(error.message);
}

/**
 * Called right after an admin/editor reviews-and-publishes a translation
 * edition (see catalog.functions.ts adminReviewAndPublishTranslationEdition
 * and translation.functions.ts reviewAndPublishTranslation). Flips only the
 * requests that were already separately approved into
 * "approved_awaiting_edition" for this exact job to "granted" — it never
 * grants a request that's still sitting at "requested".
 */
export async function grantAccessForPublishedJob(jobId: string): Promise<number> {
  const db = await admin();
  const { data, error } = await db
    .from("translation_requests")
    .update({ status: "granted", updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "approved_awaiting_edition")
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function bulkApproveTranslationRequests(params: {
  requestIds: string[];
  reviewerId: string;
  reason?: string | undefined;
}) {
  const results: { requestId: string; ok: boolean; error?: string }[] = [];
  for (const requestId of params.requestIds) {
    try {
      await approveTranslationRequest({
        requestId,
        reviewerId: params.reviewerId,
        reason: params.reason,
      });
      results.push({ requestId, ok: true });
    } catch (error) {
      results.push({
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
