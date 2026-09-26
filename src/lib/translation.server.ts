import { isRequestableTranslationLanguage } from "@/lib/data";
// Server-only. Background translation job processing: claims a bounded
// batch of sections, calls the AI gateway with full book context, validates
// output, and never flips a chunk to "published" until the whole edition is
// complete and reviewed. Import only from *.functions.ts server handlers or
// the cron worker route — never from client-rendered route components.
import {
  MAX_SECTION_ATTEMPTS,
  PROMPT_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
  retryDelayMs,
  validateTranslationOutput,
  type TranslationGuide,
} from "@/lib/translation";
import {
  getTranslationModel,
  isGeminiConfigured,
  translateSectionWithGemini,
} from "@/lib/gemini.server";

const CONTEXT_CHARS = 600;
const PROVIDER = "gemini";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function requestTranslationJob(params: {
  bookId: string;
  language: string;
  requestedBy: string;
}) {
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select("id, author_id")
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) throw new Error("Book not found");
  if (book.author_id !== params.requestedBy) {
    throw new Error("Only the book's author can request a translation");
  }
  return ensureTranslationJob(params);
}

/**
 * Idempotent job creation shared by the author-facing action above (gated on
 * authorship) and admin code producing a reviewed edition on behalf of a
 * reader access request (gated on the admin permission matrix instead —
 * see src/lib/admin/translation-access.server.ts). Never call this directly
 * from a route/handler without an authorization check in front of it.
 */
export async function ensureTranslationJob(params: {
  bookId: string;
  language: string;
  requestedBy: string;
}) {
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select("id, source_language, total_chunks, source_version, translation_permission, rights_status")
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) throw new Error("Book not found");
  if (book.rights_status !== "approved") {
    throw new Error("Translation cannot be queued until the book's rights review is approved");
  }
  if (!book.translation_permission) {
    throw new Error("Translation is not permitted by this book's current rights record");
  }
  if (!isRequestableTranslationLanguage(params.language)) {
    throw new Error(`${params.language} is not a supported Seeparah translation language`);
  }
  if (params.language === book.source_language) {
    throw new Error("Target language matches the source language");
  }

  const { data: existing } = await db
    .from("book_translation_jobs")
    .select("*")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("source_version", book.source_version)
    .maybeSingle();
  if (existing) return existing;

  const { data: job, error: jobError } = await db
    .from("book_translation_jobs")
    .insert({
      book_id: params.bookId,
      language: params.language,
      source_version: book.source_version,
      status: "pending",
      provider: PROVIDER,
      model: getTranslationModel(),
      prompt_version: PROMPT_VERSION,
      total_sections: book.total_chunks,
      requested_by: params.requestedBy,
    })
    .select()
    .single();
  if (jobError || !job) {
    // Unique-constraint race: someone else created it between our check and insert.
    const { data: raceWinner } = await db
      .from("book_translation_jobs")
      .select("*")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .eq("source_version", book.source_version)
      .maybeSingle();
    if (raceWinner) return raceWinner;
    throw new Error(jobError?.message ?? "Could not create translation job");
  }

  const sections = Array.from({ length: book.total_chunks }, (_, i) => ({
    job_id: job.id,
    chunk_index: i,
    status: "pending" as const,
  }));
  if (sections.length > 0) {
    const { error: sectionsError } = await db
      .from("book_translation_sections")
      .upsert(sections, { onConflict: "job_id,chunk_index", ignoreDuplicates: true });
    if (sectionsError) throw new Error(sectionsError.message);
  }

  return job;
}

async function fetchGuide(bookId: string): Promise<TranslationGuide | null> {
  const db = await admin();
  const { data } = await db
    .from("book_translation_guides")
    .select("*")
    .eq("book_id", bookId)
    .maybeSingle();
  if (!data) return null;
  return {
    voiceAndRegister: data.voice_and_register,
    characterNotes: data.character_notes,
    terminology: (data.terminology as Record<string, string> | null) ?? null,
    settingContext: data.setting_context,
    targetConventions: data.target_conventions,
    toneInstructions: data.tone_instructions,
  };
}

interface ProcessResult {
  jobId: string;
  processed: number;
  done: number;
  failed: number;
  jobStatus: string;
}

/** Configurable bound on how many sections one call processes — keeps each
 * invocation short (never "translate the whole book in one request") and
 * caps worst-case spend per call. Override with TRANSLATION_BATCH_SIZE. */
export function defaultBatchSize(): number {
  const raw = Number(process.env["TRANSLATION_BATCH_SIZE"]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3;
}

/**
 * Processes at most `limit` pending/retry-ready sections of one job, then
 * returns. Intended to be called repeatedly (by a cron-triggered worker
 * route, or an author-facing "process now" action) rather than run to
 * completion in a single request — a full book is never translated inside
 * one request handler.
 *
 * Residual retry-cost risk (documented, not eliminated): a section is
 * marked 'processing' before the Gemini call and 'done' after it succeeds.
 * If the process crashes or times out in between — after Gemini has
 * already generated and billed a response, but before we record it — the
 * next attempt calls Gemini again for that same section. This cannot
 * duplicate stored data (the upsert key is book_id+language+chunk_index+
 * source_version, so a retry overwrites rather than duplicates), but it can
 * cost an extra Gemini call. MAX_SECTION_ATTEMPTS bounds how many times
 * this can happen per section.
 */
export async function processTranslationJobBatchForAuthor(
  jobId: string,
  requesterId: string,
  limit = defaultBatchSize(),
): Promise<ProcessResult> {
  const db = await admin();
  const { data: job } = await db
    .from("book_translation_jobs")
    .select("id, books!inner(author_id)")
    .eq("id", jobId)
    .single();
  if (!job) throw new Error("Translation job not found");
  const authorId = (job as unknown as { books: { author_id: string | null } }).books.author_id;
  if (authorId !== requesterId) {
    throw new Error("Only the book's author can manually process this translation job");
  }
  return processTranslationJobBatch(jobId, limit);
}

export async function processTranslationJobBatch(
  jobId: string,
  limit = defaultBatchSize(),
): Promise<ProcessResult> {
  const db = await admin();
  const { data: job, error: jobError } = await db
    .from("book_translation_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error("Translation job not found");
  if (!["pending", "processing", "failed"].includes(job.status)) {
    return { jobId, processed: 0, done: 0, failed: 0, jobStatus: job.status };
  }
  if (!isGeminiConfigured()) {
    // Configuration problem, not a translation problem — leave sections
    // untouched (don't burn a retry attempt) and report it plainly rather
    // than failing sections or pretending nothing is wrong.
    throw new Error(
      "Gemini is not configured (GEMINI_API_KEY missing) — no sections were attempted",
    );
  }

  const { data: book } = await db
    .from("books")
    .select("id, title, source_language, total_chunks, translation_permission, rights_status")
    .eq("id", job.book_id)
    .single();
  if (!book) throw new Error("Book not found for job");
  if (book.rights_status !== "approved") {
    throw new Error("Translation processing is blocked because the book's rights review is not approved");
  }
  if (!book.translation_permission) {
    throw new Error("Translation processing is blocked because the current rights record does not permit translation");
  }

  if (job.status === "pending") {
    await db.from("book_translation_jobs").update({ status: "processing" }).eq("id", jobId);
  }

  const nowIso = new Date().toISOString();
  const { data: claimable } = await db
    .from("book_translation_sections")
    .select("*")
    .eq("job_id", jobId)
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_SECTION_ATTEMPTS)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("chunk_index", { ascending: true })
    .limit(limit);

  const sections = claimable ?? [];
  const guide = await fetchGuide(job.book_id);
  let doneCount = 0;
  let failedCount = 0;
  let batchPromptTokens = 0;
  let batchOutputTokens = 0;

  for (const section of sections) {
    await db
      .from("book_translation_sections")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", section.id);

    try {
      const { data: sourceChunk } = await db
        .from("book_chunks")
        .select("content")
        .eq("book_id", job.book_id)
        .eq("language", book.source_language)
        .eq("chunk_index", section.chunk_index)
        .eq("source_version", job.source_version)
        .maybeSingle();
      if (!sourceChunk) throw new Error("Source section not found");

      const [{ data: prevChunk }, { data: nextChunk }] = await Promise.all([
        db
          .from("book_chunks")
          .select("content")
          .eq("book_id", job.book_id)
          .eq("language", book.source_language)
          .eq("chunk_index", section.chunk_index - 1)
          .eq("source_version", job.source_version)
          .maybeSingle(),
        db
          .from("book_chunks")
          .select("content")
          .eq("book_id", job.book_id)
          .eq("language", book.source_language)
          .eq("chunk_index", section.chunk_index + 1)
          .eq("source_version", job.source_version)
          .maybeSingle(),
      ]);

      const system = buildSystemPrompt({
        bookTitle: book.title,
        sourceLanguage: book.source_language,
        targetLanguage: job.language,
        guide,
      });
      const user = buildUserPrompt({
        previousContext: prevChunk?.content?.slice(-CONTEXT_CHARS) ?? null,
        sectionText: sourceChunk.content,
        nextContext: nextChunk?.content?.slice(0, CONTEXT_CHARS) ?? null,
      });

      const result = await translateSectionWithGemini({
        sectionId: String(section.chunk_index),
        systemInstruction: system,
        userPrompt: user,
      });
      const validation = validateTranslationOutput({
        targetLanguage: job.language,
        sourceLanguage: book.source_language,
        sourceText: sourceChunk.content,
        translatedText: result.translatedText,
      });

      if (!validation.ok) {
        throw new Error(`Validation failed: ${validation.issues.join(", ")}`);
      }

      await db.from("book_chunks").upsert(
        {
          book_id: job.book_id,
          language: job.language,
          chunk_index: section.chunk_index,
          source_version: job.source_version,
          content: result.translatedText,
          status: "processing", // not visible to readers until the edition is reviewed & published
          job_id: jobId,
          provider: PROVIDER,
          model: result.model,
          prompt_version: job.prompt_version,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "book_id,language,chunk_index,source_version" },
      );

      await db
        .from("book_translation_sections")
        .update({
          status: "done",
          prompt_tokens: result.promptTokens,
          output_tokens: result.outputTokens,
          updated_at: new Date().toISOString(),
        })
        .eq("id", section.id);
      doneCount += 1;
      batchPromptTokens += result.promptTokens ?? 0;
      batchOutputTokens += result.outputTokens ?? 0;
    } catch (error) {
      const attempts = section.attempts + 1;
      const permanentlyFailed = attempts >= MAX_SECTION_ATTEMPTS;
      await db
        .from("book_translation_sections")
        .update({
          status: "failed",
          attempts,
          last_error: error instanceof Error ? error.message : String(error),
          next_attempt_at: permanentlyFailed
            ? null
            : new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", section.id);
      failedCount += 1;
    }
  }

  const { data: allSections } = await db
    .from("book_translation_sections")
    .select("status, attempts")
    .eq("job_id", jobId);
  const rows = allSections ?? [];
  const completed = rows.filter((r) => r.status === "done").length;
  const permanentlyFailed = rows.filter(
    (r) => r.status === "failed" && r.attempts >= MAX_SECTION_ATTEMPTS,
  ).length;
  const stillPending = rows.length - completed - permanentlyFailed;

  let nextJobStatus = job.status === "pending" ? "processing" : job.status;
  if (completed === rows.length && rows.length > 0) {
    nextJobStatus = "awaiting_review";
  } else if (stillPending === 0 && permanentlyFailed > 0) {
    nextJobStatus = "failed";
  } else {
    nextJobStatus = "processing";
  }

  await db
    .from("book_translation_jobs")
    .update({
      completed_sections: completed,
      failed_sections: permanentlyFailed,
      status: nextJobStatus,
      total_prompt_tokens: job.total_prompt_tokens + batchPromptTokens,
      total_output_tokens: job.total_output_tokens + batchOutputTokens,
      last_error:
        permanentlyFailed > 0
          ? `${permanentlyFailed} section(s) failed after ${MAX_SECTION_ATTEMPTS} attempts`
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return {
    jobId,
    processed: sections.length,
    done: doneCount,
    failed: failedCount,
    jobStatus: nextJobStatus,
  };
}

/** Scans across all books for jobs with work to do and processes a small
 * batch of each. This is what the cron worker route calls. */
export async function processDueJobs(maxJobs = 5, sectionsPerJob = 3) {
  const db = await admin();
  const nowIso = new Date().toISOString();
  const { data: jobs } = await db
    .from("book_translation_jobs")
    .select("id")
    .in("status", ["pending", "processing", "failed"])
    .lte("next_attempt_at", nowIso)
    .limit(maxJobs);

  // Jobs with next_attempt_at null are also due; the filter above only
  // matches jobs where a retry time has actually passed, so fetch those too.
  const { data: neverAttempted } = await db
    .from("book_translation_jobs")
    .select("id")
    .in("status", ["pending", "processing", "failed"])
    .is("next_attempt_at", null)
    .limit(maxJobs);

  const ids = [...new Set([...(jobs ?? []), ...(neverAttempted ?? [])].map((j) => j.id))].slice(
    0,
    maxJobs,
  );

  const results = [];
  for (const id of ids) {
    results.push(await processTranslationJobBatch(id, sectionsPerJob));
  }
  return results;
}

/**
 * Cancels a job that hasn't been published yet. Unpublished sections stay
 * on disk (status stays 'processing', never 'published') — canceling never
 * touches a currently-published edition, only stops further work and marks
 * the job so the worker/author UI won't keep retrying it.
 */
export async function cancelTranslationJob(jobId: string, requesterId: string) {
  const db = await admin();
  const { data: job } = await db
    .from("book_translation_jobs")
    .select("*, books!inner(author_id)")
    .eq("id", jobId)
    .single();
  if (!job) throw new Error("Translation job not found");
  const authorId = (job as unknown as { books: { author_id: string | null } }).books.author_id;
  if (authorId !== requesterId) throw new Error("Only the book's author can cancel this job");
  if (job.status === "published")
    throw new Error("A published edition can't be canceled — unpublish the book instead");

  const { error } = await db
    .from("book_translation_jobs")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function reviewAndPublishJob(jobId: string, reviewerId: string) {
  const db = await admin();
  const { data: job, error: jobError } = await db
    .from("book_translation_jobs")
    .select("*, books!inner(author_id)")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error("Translation job not found");
  const authorId = (job as unknown as { books: { author_id: string | null } }).books.author_id;
  if (authorId !== reviewerId) throw new Error("Only the book's author can review this edition");
  return publishReviewedEdition(jobId, reviewerId);
}

/**
 * Core "mark this translation edition published" logic, shared by the
 * author-facing review action above (which gates on authorship) and the
 * admin/editor review action in src/lib/admin/translation-access.server.ts
 * (which gates on the admin permission matrix instead). Never call this
 * without an authorization check in front of it.
 */
export async function publishReviewedEdition(jobId: string, reviewerId: string) {
  const db = await admin();
  const { data: job, error: jobError } = await db
    .from("book_translation_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error("Translation job not found");
  if (job.status !== "awaiting_review") {
    throw new Error(`Job is not awaiting review (status: ${job.status})`);
  }

  const { data: rightsBook, error: rightsBookError } = await db
    .from("books")
    .select("rights_status, translation_permission")
    .eq("id", job.book_id)
    .single();
  if (rightsBookError || !rightsBook) throw new Error("Book not found for translation review");
  if (rightsBook.rights_status !== "approved") {
    throw new Error("Translation cannot be published until the book's rights review is approved");
  }
  if (!rightsBook.translation_permission) {
    throw new Error("Translation cannot be published because the current rights record does not permit translation");
  }

  const { error: publishError } = await db
    .from("book_chunks")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "processing");
  if (publishError) throw new Error(publishError.message);

  const { error: jobUpdateError } = await db
    .from("book_translation_jobs")
    .update({
      status: "published",
      human_reviewed: true,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (jobUpdateError) throw new Error(jobUpdateError.message);

  const { data: book } = await db
    .from("books")
    .select("available_languages")
    .eq("id", job.book_id)
    .single();
  if (book && !book.available_languages.includes(job.language)) {
    await db
      .from("books")
      .update({ available_languages: [...book.available_languages, job.language] })
      .eq("id", job.book_id);
  }

  // A book_editions row's mere existence means "this edition has been
  // published at least once" — see migration 0011's book_chunk_readable().
  // Insert-only (never touches an existing row's access_type): the FIRST
  // time an edition is published it must default to 'free' ("new
  // translations default to Free"); a later re-publish of a revised
  // edition (same book+language, new source_version) must never silently
  // reset an admin's earlier Free/Premium choice back to the default.
  const { error: editionError } = await db
    .from("book_editions")
    .insert({ book_id: job.book_id, language: job.language })
    .select()
    .maybeSingle();
  // A unique-violation here just means the row already existed (a
  // re-publish) — expected, not an error to surface.
  if (editionError && editionError.code !== "23505") {
    console.error(`[translation] failed to record book_editions row for job ${jobId}`);
  }

  // Flip any reader translation_requests that were separately approved
  // "awaiting this exact edition" to granted. This is purely informational
  // now (see resolveReaderAccess in reader.server.ts) — it no longer gates
  // read access, since a published edition is free-for-eligible-readers
  // regardless of any one reader's own request status; it still lets a
  // requester's own "my requests" view show their request as fulfilled.
  // Never grants a request that was only ever "requested" — see
  // grantAccessForPublishedJob's own doc.
  const { grantAccessForPublishedJob } = await import("@/lib/admin/translation-access.server");
  await grantAccessForPublishedJob(jobId);

  return { ok: true };
}

export async function retryFailedSections(jobId: string, requesterId: string) {
  const db = await admin();
  const { data: job } = await db
    .from("book_translation_jobs")
    .select("*, books!inner(author_id)")
    .eq("id", jobId)
    .single();
  if (!job) throw new Error("Translation job not found");
  const authorId = (job as unknown as { books: { author_id: string | null } }).books.author_id;
  if (authorId !== requesterId) throw new Error("Only the book's author can retry this job");
  return retrySectionsCore(jobId);
}

/** Core retry logic shared by the author-facing action above and the
 * admin/health "retry stalled job" recovery action, which authorizes via
 * the admin permission matrix instead of authorship. */
export async function retrySectionsCore(jobId: string) {
  const db = await admin();
  await db
    .from("book_translation_sections")
    .update({ status: "pending", next_attempt_at: null, updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "failed")
    .lt("attempts", MAX_SECTION_ATTEMPTS);

  await db
    .from("book_translation_jobs")
    .update({ status: "processing", last_error: null, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  return { ok: true };
}

export async function reportTranslationIssue(params: {
  bookId: string;
  language: string;
  chunkIndex: number;
  reason: string;
  reporterId: string;
}) {
  const db = await admin();
  const { error } = await db.from("translation_reports").insert({
    book_id: params.bookId,
    language: params.language,
    chunk_index: params.chunkIndex,
    reason: params.reason,
    reporter_id: params.reporterId,
  });
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function saveTranslationGuide(params: {
  bookId: string;
  requesterId: string;
  guide: TranslationGuide;
}) {
  const db = await admin();
  const { data: book } = await db
    .from("books")
    .select("author_id")
    .eq("id", params.bookId)
    .single();
  if (!book || book.author_id !== params.requesterId) {
    throw new Error("Only the book's author can edit its translation guide");
  }
  const { error } = await db.from("book_translation_guides").upsert({
    book_id: params.bookId,
    voice_and_register: params.guide.voiceAndRegister ?? null,
    character_notes: params.guide.characterNotes ?? null,
    terminology: params.guide.terminology ?? {},
    setting_context: params.guide.settingContext ?? null,
    target_conventions: params.guide.targetConventions ?? null,
    tone_instructions: params.guide.toneInstructions ?? null,
    updated_at: new Date().toISOString(),
    updated_by: params.requesterId,
  });
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

// Public, reader-facing: which languages currently have an in-progress
// translation job for this book, so the UI can distinguish "already being
// worked on" from "not yet requested" — never implying either is readable
// (only a published book_editions row means that). Deliberately returns
// only {language, inProgress}, nothing else from the job row (no ids,
// timestamps, attempts, errors) — this is meant to be safe to call with no
// auth, unlike getBookTranslationStatus below which is author-only.
export async function getBookTranslationLanguageStatus(bookId: string) {
  const db = await admin();
  const { data: jobs, error } = await db
    .from("book_translation_jobs")
    .select("language, status")
    .eq("book_id", bookId);
  if (error) throw new Error(error.message);
  const inProgressStatuses = new Set(["pending", "processing", "awaiting_review"]);
  return (jobs ?? [])
    .filter((j) => inProgressStatuses.has(j.status))
    .map((j) => ({ language: j.language as string }));
}

export async function getBookTranslationStatus(bookId: string, requesterId: string) {
  const db = await admin();
  const { data: book } = await db.from("books").select("author_id").eq("id", bookId).single();
  if (!book || book.author_id !== requesterId) {
    throw new Error("Only the book's author can view translation status");
  }
  const { data: jobs } = await db
    .from("book_translation_jobs")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });
  return jobs ?? [];
}
