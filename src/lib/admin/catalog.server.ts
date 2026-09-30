// Server-only. Admin catalog moderation: rights review, edition-quality
// review, publish/unpublish/archive, and admin batch/CSV ingestion. This is
// the accountable review workflow the product rules require — nothing here
// publishes automatically because a file finished uploading or an AI job
// finished; every transition into 'published' is an explicit admin action,
// and the DB trigger in migration 0005 double-checks the rights + edition
// approval gate even if this code is bypassed (a missing English/Urdu
// translation is informational only and never blocks publishing — see
// computePublishGate below).
import { createHash } from "node:crypto";
import { parseManuscript } from "@/lib/manuscript";
import { parseEpub, EpubValidationError } from "@/lib/admin/epub.server";
import { isRequestableTranslationLanguage } from "@/lib/data";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface AdminBookListFilters {
  status?: string | undefined;
  query?: string | undefined;
  page: number;
  perPage: number;
}

export async function adminListBooks(filters: AdminBookListFilters) {
  const db = await admin();
  let q = db
    .from("books")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.query) q = q.or(`title.ilike.%${filters.query}%,author.ilike.%${filters.query}%`);
  const from = (filters.page - 1) * filters.perPage;
  const { data, error, count } = await q.range(from, from + filters.perPage - 1);
  if (error) throw new Error(error.message);
  return { books: data ?? [], total: count ?? 0 };
}

export async function adminGetBook(bookId: string) {
  const db = await admin();
  const { data: book, error } = await db.from("books").select("*").eq("id", bookId).single();
  if (error || !book) throw new Error("Book not found");
  const { data: jobs } = await db
    .from("book_translation_jobs")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });
  return { book, jobs: jobs ?? [] };
}

/**
 * Pure publish-gate decision, directly unit-testable. Publishing the
 * ORIGINAL-language edition requires the legal, editorial, structure and
 * cleanup checks to be complete. English/Urdu translations remain
 * informational and never block the approved original-language edition.
 *
 * This must stay aligned with the DB trigger introduced/updated by the
 * latest forward migration so direct SQL cannot bypass the same safeguards.
 */
export interface PublishGateBook {
  rights_status: string;
  edition_review_status: string;
  structure_review_status?: string | null;
  cleanup_review_status?: string | null;
  source_language: string;
  edition_title?: string | null;
  edition_year?: number | null;
  publisher?: string | null;
  isbn?: string | null;
  source_scan_id?: string | null;
  original_publication_year?: number | null;
  word_count?: number | null;
  estimated_reading_minutes?: number | null;
  rights_basis?: string | null;
  rights_evidence_url?: string | null;
  rights_risk_acknowledged_at?: string | null;
  content_classification?: string | null;
  source_url?: string | null;
  source_edition_id?: string | null;
}

export function computePublishGate(
  book: PublishGateBook,
  reviewedLanguages: Set<string>,
  hasRightsRiskSignals = false,
  hasCanonicalReferenceStructure = true,
): { canPublish: boolean; reasons: string[]; pendingTranslations: string[] } {
  const reasons: string[] = [];
  if (book.rights_status !== "approved") reasons.push("Rights review is not yet approved");
  if (book.edition_review_status !== "approved") {
    reasons.push("Edition quality review is not yet approved");
  }
  if (book.structure_review_status !== "approved") {
    reasons.push("Book structure review is not yet approved");
  }
  if (book.cleanup_review_status !== "approved") {
    reasons.push("Text cleanup review is not yet approved");
  }
  if (isPlaceholderRightsText(book.rights_basis)) {
    reasons.push("Rights basis is unresolved or looks like placeholder/review text");
  }
  if (!isPlausibleEvidenceUrl(book.rights_evidence_url)) {
    reasons.push("Rights evidence URL is missing or invalid");
  }

  const missingEditionMetadata: string[] = [];
  if (!book.edition_title?.trim()) missingEditionMetadata.push("edition title");
  if (!book.edition_year) missingEditionMetadata.push("edition year");
  if (!book.publisher?.trim()) missingEditionMetadata.push("publisher");
  if (!book.isbn?.trim() && !book.source_scan_id?.trim()) {
    missingEditionMetadata.push("ISBN or source edition ID");
  }
  if (book.original_publication_year == null) {
    missingEditionMetadata.push("original publication year");
  }
  if (!book.word_count || book.word_count <= 0) missingEditionMetadata.push("word count");
  if (!book.estimated_reading_minutes || book.estimated_reading_minutes <= 0) {
    missingEditionMetadata.push("estimated reading time");
  }
  if (missingEditionMetadata.length > 0) {
    reasons.push(`Exact-edition metadata is incomplete: ${missingEditionMetadata.join(", ")}`);
  }

  if (book.content_classification === "religious") {
    if (!isPlausibleEvidenceUrl(book.source_url)) {
      reasons.push("Religious source URL is missing or invalid");
    }
    if (!book.source_edition_id?.trim() && !book.source_scan_id?.trim()) {
      reasons.push("Religious source edition identifier is missing");
    }
    if (!hasCanonicalReferenceStructure) {
      reasons.push("Religious canonical reference structure has not been imported");
    }
  }

  if (hasRightsRiskSignals && !book.rights_risk_acknowledged_at) {
    reasons.push("Rights-risk clues in the manuscript have not been reviewed and acknowledged");
  }

  const STANDARD_TRANSLATION_TARGETS = ["English", "Urdu"];
  const pendingTranslations = STANDARD_TRANSLATION_TARGETS.filter(
    (lang) => lang !== book.source_language && !reviewedLanguages.has(lang),
  );

  return { canPublish: reasons.length === 0, reasons, pendingTranslations };
}

export interface RightsRiskSignal {
  chunkIndex: number;
  label: string;
  snippet: string;
}

/**
 * Conservative text scan for edition-level rights clues. This is a review
 * aid, never a legal conclusion: it only surfaces phrases an admin should
 * compare against the exact edition evidence before approving rights.
 */
export async function scanBookRightsSignals(bookId: string): Promise<RightsRiskSignal[]> {
  const db = await admin();
  const { data: book } = await db
    .from("books")
    .select("source_language, source_version")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) return [];

  const { data: rows, error } = await db
    .from("book_chunks")
    .select("chunk_index, content")
    .eq("book_id", bookId)
    .eq("language", book.source_language)
    .eq("source_version", book.source_version ?? 1)
    .order("chunk_index", { ascending: true })
    .limit(30);
  if (error) {
    throw new Error(`Unable to scan rights-risk signals: ${error.message}`);
  }
  if (!rows) return [];

  const patterns: Array<{ label: string; regex: RegExp }> = [
    { label: "Copyright notice", regex: /(?:copyright|©|\(c\))/i },
    { label: "Rights reservation", regex: /all rights reserved/i },
    { label: "Revised edition", regex: /revised edition/i },
    { label: "Renewal notice", regex: /copyright.{0,80}renew|renewed.{0,80}copyright/i },
    { label: "Edition notice", regex: /(?:first|second|third|new|revised) edition/i },
  ];

  const signals: RightsRiskSignal[] = [];
  for (const row of rows) {
    const text = String(row.content ?? "");
    for (const pattern of patterns) {
      const match = pattern.regex.exec(text);
      if (!match) continue;
      const start = Math.max(0, match.index - 80);
      const end = Math.min(text.length, match.index + match[0].length + 140);
      signals.push({
        chunkIndex: Number(row.chunk_index),
        label: pattern.label,
        snippet: text.slice(start, end).replace(/\s+/g, " ").trim(),
      });
      if (signals.length >= 8) return signals;
    }
  }
  return signals;
}

/** Mirrors the DB trigger's gate so the admin UI can show a specific,
 * actionable reason before the update is even attempted. */
export async function evaluatePublishGate(
  bookId: string,
): Promise<{ canPublish: boolean; reasons: string[]; pendingTranslations: string[] }> {
  const db = await admin();
  const { data: book, error } = await db.from("books").select("*").eq("id", bookId).single();
  if (error || !book) throw new Error("Book not found");

  const [{ data: jobs }, rightsSignals, { data: structureRows, error: structureError }] =
    await Promise.all([
      db
        .from("book_translation_jobs")
        .select("language, status, human_reviewed")
        .eq("book_id", bookId)
        .eq("source_version", book.source_version)
        .eq("status", "published")
        .eq("human_reviewed", true),
      scanBookRightsSignals(bookId),
      db
        .from("book_structure_nodes")
        .select("metadata")
        .eq("book_id", bookId)
        .eq("language", book.source_language)
        .eq("source_version", book.source_version),
    ]);
  if (structureError) throw new Error(structureError.message);
  const reviewedLanguages = new Set((jobs ?? []).map((j) => j.language));
  const hasCanonicalReferenceStructure = (structureRows ?? []).some((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    return (
      typeof metadata?.["canonical_ref"] === "string" && metadata["canonical_ref"].trim().length > 0
    );
  });

  return computePublishGate(
    book,
    reviewedLanguages,
    rightsSignals.length > 0,
    hasCanonicalReferenceStructure,
  );
}

const PLACEHOLDER_RIGHTS_TEXT = new Set([
  "n/a",
  "na",
  "none",
  "tbd",
  "todo",
  "test",
  "testing",
  "xx",
  "xxx",
  "asdf",
  "placeholder",
  "unknown",
]);

/** True when `value` cannot possibly be a real rights statement — too
 * short, an all-repeated-character string ("hh", "xxxx"), or a known
 * placeholder token. This is a floor, not a substitute for a human
 * actually reading the evidence: it exists so a single stray character (or
 * two, as happened with this exact book) can never alone satisfy rights
 * review, which was previously enforced by nothing beyond
 * `z.string().min(1)` at submission time and zero content check at
 * approval time. */
export function isPlaceholderRightsText(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (trimmed.length < 20) return true;
  if (/^(.)\1*$/.test(trimmed)) return true;
  if (PLACEHOLDER_RIGHTS_TEXT.has(trimmed.toLowerCase())) return true;
  if (/lorem ipsum/i.test(trimmed)) return true;
  if (
    /\b(?:pending|do\s+not\s+approve|not\s+verified|awaiting\s+rights|rights\s+unknown)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

function isPlausibleEvidenceUrl(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function reviewRights(params: {
  bookId: string;
  decision: "approved" | "rejected";
  reviewerId: string;
  notes?: string | undefined;
}) {
  const db = await admin();
  const { data: before } = await db
    .from("books")
    .select(
      "rights_status, edition_review_status, status, rights_basis, rights_evidence_url, rights_risk_acknowledged_at",
    )
    .eq("id", params.bookId)
    .single();
  if (params.decision === "approved") {
    if (isPlaceholderRightsText(before?.rights_basis)) {
      throw new Error(
        "Rights basis reads like a placeholder, not a real rights statement — enter what actually establishes permission (public-domain status of THIS edition, or a license/permission reference) before approving.",
      );
    }
    if (!isPlausibleEvidenceUrl(before?.rights_evidence_url)) {
      throw new Error(
        "Rights evidence URL is missing or not a real link — approval requires a link to the actual documentation, not just a basis statement.",
      );
    }
    const rightsSignals = await scanBookRightsSignals(params.bookId);
    if (rightsSignals.length > 0 && !before?.rights_risk_acknowledged_at) {
      throw new Error(
        "This manuscript contains copyright/revision/rights clues. Review the highlighted clues and acknowledge that review before approving rights.",
      );
    }
  }
  const bothApproved =
    params.decision === "approved" && before?.edition_review_status === "approved";
  const statusPatch =
    params.decision === "rejected"
      ? { status: "rejected", rejection_reason: params.notes ?? "Rights not approved" }
      : bothApproved && isReviewableStatus(before?.status)
        ? { status: "approved" }
        : {};
  const { error } = await db
    .from("books")
    .update({
      rights_status: params.decision,
      review_notes: params.notes ?? null,
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
      ...statusPatch,
    })
    .eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { before, after: { rights_status: params.decision, ...statusPatch } };
}

export async function acknowledgeRightsRiskSignals(params: { bookId: string; reviewerId: string }) {
  const signals = await scanBookRightsSignals(params.bookId);
  if (signals.length === 0) {
    throw new Error("No rights-risk clues were detected for this manuscript.");
  }
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("books")
    .select("rights_risk_acknowledged_at, rights_risk_acknowledged_by")
    .eq("id", params.bookId)
    .single();
  if (beforeError) throw new Error(beforeError.message);

  const after = {
    rights_risk_acknowledged_at: new Date().toISOString(),
    rights_risk_acknowledged_by: params.reviewerId,
  };
  const { error } = await db.from("books").update(after).eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { before, after };
}

export async function reviewReaderQuality(params: {
  bookId: string;
  target: "structure" | "cleanup";
  decision: "approved" | "changes_requested" | "rejected";
  reviewerId: string;
  notes?: string | undefined;
}) {
  const db = await admin();
  const column =
    params.target === "structure" ? "structure_review_status" : "cleanup_review_status";
  const { data: before, error: beforeError } = await db
    .from("books")
    .select("status, structure_review_status, cleanup_review_status")
    .eq("id", params.bookId)
    .single();
  if (beforeError || !before) throw new Error(beforeError?.message ?? "Book not found");

  const nextStatus = params.decision;
  const common = {
    review_notes: params.notes ?? null,
    reviewed_by: params.reviewerId,
    reviewed_at: new Date().toISOString(),
    ...(params.decision !== "approved" && before.status === "approved"
      ? { status: "changes_requested" }
      : {}),
  };
  const patch =
    params.target === "structure"
      ? { structure_review_status: nextStatus, ...common }
      : { cleanup_review_status: nextStatus, ...common };

  const { error } = await db.from("books").update(patch).eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { before, after: patch };
}

/** Only move `status` to 'approved' automatically from a state that's still
 * mid-review — never overwrite a book that's already published, unpublished,
 * or archived just because someone re-runs a review action on it. */
function isReviewableStatus(status: string | undefined): boolean {
  return status === "in_review" || status === "approved" || status === "changes_requested";
}

export interface BulkBookReviewResult {
  bookId: string;
  title: string;
  ok: boolean;
  approvedSteps: Array<"rights" | "edition" | "structure" | "cleanup">;
  blockers: string[];
}

export async function bulkApproveBookReviews(params: {
  bookIds: string[];
  reviewerId: string;
  notes?: string | undefined;
}): Promise<BulkBookReviewResult[]> {
  const db = await admin();
  const results: BulkBookReviewResult[] = [];

  for (const bookId of [...new Set(params.bookIds)]) {
    const approvedSteps: BulkBookReviewResult["approvedSteps"] = [];
    const blockers: string[] = [];
    try {
      const { data: book, error } = await db
        .from("books")
        .select(
          "title,status,rights_status,edition_review_status,structure_review_status,cleanup_review_status",
        )
        .eq("id", bookId)
        .single();
      if (error || !book) throw new Error(error?.message ?? "Book not found");

      if (!["in_review", "changes_requested", "approved"].includes(book.status)) {
        results.push({
          bookId,
          title: book.title,
          ok: false,
          approvedSteps,
          blockers: [`Book is ${book.status.replaceAll("_", " ")} and is not in the review queue.`],
        });
        continue;
      }

      if (book.structure_review_status !== "approved") {
        await reviewReaderQuality({
          bookId,
          target: "structure",
          decision: "approved",
          reviewerId: params.reviewerId,
          notes: params.notes,
        });
        approvedSteps.push("structure");
      }

      if (book.cleanup_review_status !== "approved") {
        await reviewReaderQuality({
          bookId,
          target: "cleanup",
          decision: "approved",
          reviewerId: params.reviewerId,
          notes: params.notes,
        });
        approvedSteps.push("cleanup");
      }

      if (book.edition_review_status !== "approved") {
        await reviewEdition({
          bookId,
          decision: "approved",
          reviewerId: params.reviewerId,
          notes: params.notes,
        });
        approvedSteps.push("edition");
      }

      if (book.rights_status !== "approved") {
        try {
          await reviewRights({
            bookId,
            decision: "approved",
            reviewerId: params.reviewerId,
            notes: params.notes,
          });
          approvedSteps.push("rights");
        } catch (rightsError) {
          blockers.push(
            rightsError instanceof Error
              ? rightsError.message
              : "Rights review still needs individual attention.",
          );
        }
      }

      const { data: final, error: finalError } = await db
        .from("books")
        .select("rights_status,edition_review_status,structure_review_status,cleanup_review_status")
        .eq("id", bookId)
        .single();
      if (finalError || !final)
        throw new Error(finalError?.message ?? "Could not verify review state");

      const incomplete: string[] = [];
      if (final.rights_status !== "approved") incomplete.push("rights");
      if (final.edition_review_status !== "approved") incomplete.push("edition");
      if (final.structure_review_status !== "approved") incomplete.push("structure");
      if (final.cleanup_review_status !== "approved") incomplete.push("text cleanup");
      if (incomplete.length) {
        blockers.push(`Still pending: ${incomplete.join(", ")}.`);
      }

      results.push({
        bookId,
        title: book.title,
        ok: blockers.length === 0,
        approvedSteps,
        blockers: [...new Set(blockers)],
      });
    } catch (error) {
      results.push({
        bookId,
        title: "Unknown book",
        ok: false,
        approvedSteps,
        blockers: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  return results;
}

export async function reviewEdition(params: {
  bookId: string;
  decision: "approved" | "changes_requested" | "rejected";
  reviewerId: string;
  notes?: string | undefined;
}) {
  const db = await admin();
  const { data: before } = await db
    .from("books")
    .select("rights_status, edition_review_status, status")
    .eq("id", params.bookId)
    .single();
  const bothApproved = params.decision === "approved" && before?.rights_status === "approved";
  const statusPatch =
    params.decision === "changes_requested"
      ? { status: "changes_requested" }
      : params.decision === "rejected"
        ? { status: "rejected", rejection_reason: params.notes ?? "Edition not approved" }
        : bothApproved && isReviewableStatus(before?.status)
          ? { status: "approved" }
          : {};
  const { error } = await db
    .from("books")
    .update({
      edition_review_status: params.decision,
      review_notes: params.notes ?? null,
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
      ...statusPatch,
    })
    .eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { before, after: { edition_review_status: params.decision, ...statusPatch } };
}

export async function publishBook(bookId: string, reviewerId: string) {
  const gate = await evaluatePublishGate(bookId);
  if (!gate.canPublish) {
    throw new Error(`Cannot publish: ${gate.reasons.join("; ")}`);
  }
  const db = await admin();
  const { data: before } = await db.from("books").select("status").eq("id", bookId).single();
  const { error } = await db
    .from("books")
    .update({ status: "published", reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", bookId);
  if (error) throw new Error(error.message);
  return { before, after: { status: "published" } };
}

export async function setBookLifecycleStatus(params: {
  bookId: string;
  status: "unpublished" | "archived";
  reviewerId: string;
}) {
  const db = await admin();
  const { data: before } = await db.from("books").select("status").eq("id", params.bookId).single();
  const { error } = await db
    .from("books")
    .update({ status: params.status })
    .eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { before, after: { status: params.status } };
}

// ---------------------------------------------------------------------------
// Edition-level (Free/Premium) access control
// ---------------------------------------------------------------------------
// books.access_type/subscription_price_usd are admin-only writes — the
// authenticated-role column grant that would have let an author set these
// directly was revoked in migration 0011 after an audit found it still
// present. This is now the ONLY path that can change either, and it's
// gated by requireAdmin() in catalog.functions.ts, same as every other
// admin mutation.

export type EditionAccessType = "free" | "paid";

/** The original-language edition's access (books.access_type). */
export async function setBookAccessType(params: {
  bookId: string;
  accessType: EditionAccessType;
}): Promise<{ before: Record<string, unknown> | null; after: Record<string, unknown> }> {
  if (params.accessType !== "free") {
    throw new Error("Original-language editions are always free on Seeparah.");
  }
  const db = await admin();
  const { data: before } = await db
    .from("books")
    .select("access_type")
    .eq("id", params.bookId)
    .single();
  const { error } = await db
    .from("books")
    .update({ access_type: params.accessType })
    .eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { before, after: { access_type: params.accessType } };
}

/** A translated edition's access — only for an edition that has actually
 * been published at least once (a book_editions row exists; see migration
 * 0011's own comment on what a row's existence means). Refuses rather than
 * silently creating a row for an edition that was never produced — there's
 * nothing meaningful to set Free/Premium on yet. */
export async function setEditionAccessType(params: {
  bookId: string;
  language: string;
  accessType: EditionAccessType;
}): Promise<{ before: Record<string, unknown> | null; after: Record<string, unknown> }> {
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("book_editions")
    .select("access_type")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .maybeSingle();
  if (beforeError) throw new Error(beforeError.message);
  if (!before) {
    throw new Error(
      `No published ${params.language} edition exists yet for this book — nothing to set.`,
    );
  }
  const { data: parentBook } = await db
    .from("books")
    .select("content_classification")
    .eq("id", params.bookId)
    .single();
  if (parentBook?.content_classification === "religious" && params.accessType === "paid") {
    throw new Error("Religious books and every verified translated edition are always free.");
  }
  const { error } = await db
    .from("book_editions")
    .update({ access_type: params.accessType, updated_at: new Date().toISOString() })
    .eq("book_id", params.bookId)
    .eq("language", params.language);
  if (error) throw new Error(error.message);
  return { before, after: { access_type: params.accessType } };
}

export interface AccessTarget {
  bookId: string;
  /** null = the original edition (books.access_type); a language string =
   * that translated edition (book_editions.access_type). */
  language: string | null;
}

export interface BulkAccessResult {
  target: AccessTarget;
  ok: boolean;
  error?: string;
}

/** Applies one access_type to many targets in one call — the server side
 * of the admin bulk-edit action. The actual "preview before applying" the
 * product rules require is a client-side confirmation step (the admin
 * reviews the exact list before this is ever called); this function does
 * the real writes, one row at a time so a single bad target (e.g. an
 * edition that was never published) doesn't abort the rest of the batch —
 * each result is reported individually. */
export async function bulkSetAccessType(params: {
  targets: AccessTarget[];
  accessType: EditionAccessType;
}): Promise<BulkAccessResult[]> {
  const results: BulkAccessResult[] = [];
  for (const target of params.targets) {
    try {
      if (target.language === null) {
        await setBookAccessType({ bookId: target.bookId, accessType: params.accessType });
      } else {
        await setEditionAccessType({
          bookId: target.bookId,
          language: target.language,
          accessType: params.accessType,
        });
      }
      results.push({ target, ok: true });
    } catch (error) {
      results.push({
        target,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

/** Every translated edition that's actually been published for a book, for
 * the admin book-detail page's per-edition editor. */
export interface BookEditionRow {
  book_id: string;
  language: string;
  access_type: EditionAccessType;
  provenance_type:
    "ai_assisted" | "human_translation" | "licensed_translation" | "public_domain_translation";
  typography_profile: string;
  authenticity_notes: string | null;
  edition_title: string | null;
  translator: string | null;
  source_url: string | null;
  source_edition_id: string | null;
  rights_basis: string | null;
  rights_evidence_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function listBookEditions(bookId: string): Promise<BookEditionRow[]> {
  const db = await admin();
  const { data, error } = await db
    .from("book_editions")
    .select("*")
    .eq("book_id", bookId)
    .order("language");
  if (error) throw new Error(error.message);
  // access_type is `text` with a CHECK constraint at the DB layer, not a
  // Postgres enum, so generated types widen it to `string` — narrowed here
  // since the constraint guarantees only 'free' | 'paid' ever lands in it.
  return (data ?? []) as BookEditionRow[];
}

export type BookTypographyProfile =
  | "standard"
  | "scripture_arabic"
  | "scripture_urdu"
  | "scripture_hebrew"
  | "scripture_indic"
  | "facsimile_preserving";

export async function setBookContentPolicy(params: {
  bookId: string;
  classification: "general" | "religious";
  typographyProfile: BookTypographyProfile;
  authenticityNotes?: string | null;
  actorRole: string;
  downgradeReason?: string | null;
}) {
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("books")
    .select(
      "status, content_classification, translation_generation_policy, typography_profile, authenticity_notes, categories, access_type",
    )
    .eq("id", params.bookId)
    .single();
  if (beforeError || !before) throw new Error(beforeError?.message ?? "Book not found");

  const isReligiousDowngrade =
    before.content_classification === "religious" && params.classification === "general";
  const isReligiousUpgrade =
    before.content_classification !== "religious" && params.classification === "religious";

  if (isReligiousUpgrade) {
    const [
      { count: aiEditionCount, error: aiEditionError },
      { count: activeJobCount, error: activeJobError },
    ] = await Promise.all([
      db
        .from("book_editions")
        .select("language", { count: "exact", head: true })
        .eq("book_id", params.bookId)
        .eq("provenance_type", "ai_assisted"),
      db
        .from("book_translation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("book_id", params.bookId)
        .in("status", ["pending", "processing", "awaiting_review", "published"]),
    ]);
    if (aiEditionError) throw new Error(aiEditionError.message);
    if (activeJobError) throw new Error(activeJobError.message);
    if ((aiEditionCount ?? 0) > 0 || (activeJobCount ?? 0) > 0) {
      throw new Error(
        "Resolve existing AI-assisted translated editions and active/published AI translation jobs before classifying this book as Religious.",
      );
    }
  }

  if (isReligiousDowngrade) {
    if (params.actorRole !== "owner") {
      throw new Error("Only the owner can change a Religious book back to General.");
    }
    if (before.status === "published") {
      throw new Error(
        "Unpublish the Religious book before changing it to General. This prevents a policy change from immediately enabling normal translation behavior on a live title.",
      );
    }
    const reason = params.downgradeReason?.trim() ?? "";
    if (reason.length < 20) {
      throw new Error(
        "Changing a Religious book to General requires a substantive reason of at least 20 characters.",
      );
    }
    const { error } = await db.rpc("owner_downgrade_religious_book", {
      p_book_id: params.bookId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);

    const { error: metadataError } = await db
      .from("books")
      .update({
        typography_profile: params.typographyProfile,
        authenticity_notes: params.authenticityNotes?.trim() || null,
      })
      .eq("id", params.bookId);
    if (metadataError) throw new Error(metadataError.message);

    return {
      before,
      after: {
        content_classification: "general",
        translation_generation_policy: "ai_allowed",
        typography_profile: params.typographyProfile,
        authenticity_notes: params.authenticityNotes?.trim() || null,
        categories: (before.categories ?? []).filter((category) => category !== "Religious"),
        access_type: "free",
      },
    };
  }

  const categories = [...(before.categories ?? [])].filter((category) => category !== "Religious");
  if (params.classification === "religious") categories.push("Religious");

  const after = {
    content_classification: params.classification,
    translation_generation_policy:
      params.classification === "religious" ? "source_only" : "ai_allowed",
    typography_profile: params.typographyProfile,
    authenticity_notes: params.authenticityNotes?.trim() || null,
    categories,
    access_type: "free" as const,
  };

  const { error } = await db.from("books").update(after).eq("id", params.bookId);
  if (error) throw new Error(error.message);

  if (params.classification === "religious") {
    const { error: editionPolicyError } = await db
      .from("book_editions")
      .update({ access_type: "free", updated_at: new Date().toISOString() })
      .eq("book_id", params.bookId);
    if (editionPolicyError) throw new Error(editionPolicyError.message);
  }

  return { before, after };
}

export type SourcedEditionProvenance =
  "human_translation" | "licensed_translation" | "public_domain_translation";

export async function importVerifiedSourcedEdition(params: {
  bookId: string;
  language: string;
  provenanceType: SourcedEditionProvenance;
  typographyProfile: BookTypographyProfile;
  editionTitle?: string | null;
  translator?: string | null;
  sourceUrl: string;
  sourceEditionId?: string | null;
  rightsBasis: string;
  rightsEvidenceUrl: string;
  authenticityNotes?: string | null;
  manuscriptText: string;
}) {
  if (!isRequestableTranslationLanguage(params.language)) {
    throw new Error(`${params.language} is not a supported Seeparah language`);
  }
  if (!params.rightsBasis.trim() || params.rightsBasis.trim().length < 20) {
    throw new Error("Enter a substantive rights basis for this exact sourced edition.");
  }
  if (!isPlausibleEvidenceUrl(params.rightsEvidenceUrl)) {
    throw new Error("A valid rights evidence URL is required for this exact sourced edition.");
  }
  if (!isPlausibleEvidenceUrl(params.sourceUrl)) {
    throw new Error("A valid source URL is required for the sourced translated edition.");
  }

  const sections = params.manuscriptText
    .replace(/\r\n/g, "\n")
    .split(/\n\s*===SEEPARAH_SECTION===\s*\n/giu)
    .map((section) => section.replace(/[ \t]+$/gm, "").trim())
    .filter(Boolean);

  const db = await admin();
  const { data: sectionCount, error } = await db.rpc("import_verified_sourced_edition", {
    p_book_id: params.bookId,
    p_language: params.language,
    p_provenance_type: params.provenanceType,
    p_typography_profile: params.typographyProfile,
    p_edition_title: params.editionTitle?.trim() || null,
    p_translator: params.translator?.trim() || null,
    p_source_url: params.sourceUrl.trim(),
    p_source_edition_id: params.sourceEditionId?.trim() || null,
    p_rights_basis: params.rightsBasis.trim(),
    p_rights_evidence_url: params.rightsEvidenceUrl.trim(),
    p_authenticity_notes: params.authenticityNotes?.trim() || null,
    p_sections: sections,
  });
  if (error) throw new Error(error.message);

  return {
    bookId: params.bookId,
    language: params.language,
    sectionCount: sectionCount ?? sections.length,
    provenanceType: params.provenanceType,
    accessType: "free" as const,
  };
}

export interface SacredReferenceManifestNode {
  nodeKey: string;
  parentNodeKey?: string | null;
  nodeType:
    | "front_matter"
    | "part"
    | "book"
    | "volume"
    | "chapter"
    | "story"
    | "section"
    | "act"
    | "scene"
    | "poem"
    | "canto"
    | "stanza"
    | "paragraph"
    | "footnote"
    | "endnote"
    | "back_matter";
  title?: string | null;
  ordinal: number;
  depth: number;
  startChunkIndex: number;
  endChunkIndex: number;
  canonicalRef: string;
  referenceLabel: string;
  referenceKind: string;
  referencePath?: Array<{ kind: string; label: string; value: string }>;
}

const SACRED_REFERENCE_NODE_TYPES = new Set<SacredReferenceManifestNode["nodeType"]>([
  "front_matter",
  "part",
  "book",
  "volume",
  "chapter",
  "story",
  "section",