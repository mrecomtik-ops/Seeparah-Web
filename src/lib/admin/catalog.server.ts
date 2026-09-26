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
  rights_risk_acknowledged_at?: string | null;
}

export function computePublishGate(
  book: PublishGateBook,
  reviewedLanguages: Set<string>,
  hasRightsRiskSignals = false,
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

  let { data: rows, error } = await db
    .from("book_chunks")
    .select("chunk_index, content")
    .eq("book_id", bookId)
    .eq("language", book.source_language)
    .eq("source_version", book.source_version ?? 1)
    .order("chunk_index", { ascending: true })
    .limit(30);
  if (error) {
    ({ data: rows, error } = await db
      .from("book_chunks")
      .select("chunk_index, content")
      .eq("book_id", bookId)
      .eq("language", book.source_language)
      .order("chunk_index", { ascending: true })
      .limit(30));
  }
  if (error || !rows) return [];

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

  const [{ data: jobs }, rightsSignals] = await Promise.all([
    db
      .from("book_translation_jobs")
      .select("language, status, human_reviewed")
      .eq("book_id", bookId)
      .eq("source_version", book.source_version)
      .eq("status", "published")
      .eq("human_reviewed", true),
    scanBookRightsSignals(bookId),
  ]);
  const reviewedLanguages = new Set((jobs ?? []).map((j) => j.language));

  return computePublishGate(book, reviewedLanguages, rightsSignals.length > 0);
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
  if (/\b(?:pending|do\s+not\s+approve|not\s+verified|awaiting\s+rights|rights\s+unknown)\b/i.test(trimmed)) {
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

export async function acknowledgeRightsRiskSignals(params: {
  bookId: string;
  reviewerId: string;
}) {
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
  provenance_type: "ai_assisted" | "human_translation" | "licensed_translation" | "public_domain_translation";
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
}) {
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("books")
    .select("content_classification, translation_generation_policy, typography_profile, authenticity_notes, categories, access_type")
    .eq("id", params.bookId)
    .single();
  if (beforeError || !before) throw new Error(beforeError?.message ?? "Book not found");

  const categories = [...(before.categories ?? [])].filter((c) => c !== "Religious");
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
    await db
      .from("book_editions")
      .update({ access_type: "free", updated_at: new Date().toISOString() })
      .eq("book_id", params.bookId);
  }

  return { before, after };
}

export type SourcedEditionProvenance =
  | "human_translation"
  | "licensed_translation"
  | "public_domain_translation";

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
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select(
      "id,title,status,source_language,source_version,total_chunks,available_languages,content_classification,translation_generation_policy",
    )
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) throw new Error(bookError?.message ?? "Book not found");
  if (
    book.content_classification !== "religious" ||
    book.translation_generation_policy !== "source_only"
  ) {
    throw new Error(
      "Verified sourced-edition import is reserved for Religious/source-only books.",
    );
  }
  if (book.status !== "published") {
    throw new Error("Publish the verified original book before adding sourced translated editions.");
  }
  if (params.language === book.source_language) {
    throw new Error("The sourced edition language must differ from the book's original language.");
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

  const divider = /\n\s*===SEEPARAH_SECTION===\s*\n/giu;
  const sections = params.manuscriptText
    .replace(/\r\n/g, "\n")
    .split(divider)
    .map((section) => section.replace(/[ \t]+$/gm, "").trim())
    .filter(Boolean);

  if (sections.length !== book.total_chunks) {
    throw new Error(
      `This book has ${book.total_chunks} aligned reading sections. The sourced edition contains ${sections.length}. Separate the verified text into exactly ${book.total_chunks} sections using ===SEEPARAH_SECTION=== so highlights, navigation and cross-language positions stay aligned.`,
    );
  }

  const { data: existingEdition } = await db
    .from("book_editions")
    .select("language")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .maybeSingle();
  if (existingEdition) {
    throw new Error(
      `A published ${params.language} edition already exists. Edit/review that edition instead of importing a duplicate.`,
    );
  }

  const { count: existingChunks } = await db
    .from("book_chunks")
    .select("chunk_index", { count: "exact", head: true })
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("source_version", book.source_version ?? 1);
  if ((existingChunks ?? 0) > 0) {
    throw new Error(
      `${params.language} content rows already exist for the current source version. Resolve those rows before importing a sourced edition.`,
    );
  }

  const chunkRows = sections.map((content, chunkIndex) => ({
    book_id: params.bookId,
    language: params.language,
    chunk_index: chunkIndex,
    content,
    status: "published",
    source_version: book.source_version ?? 1,
    provider: "sourced",
    model: null,
    prompt_version: null,
    job_id: null,
  }));

  const { error: chunkError } = await db.from("book_chunks").insert(chunkRows);
  if (chunkError) throw new Error(chunkError.message);

  const editionRow = {
    book_id: params.bookId,
    language: params.language,
    access_type: "free",
    provenance_type: params.provenanceType,
    typography_profile: params.typographyProfile,
    authenticity_notes: params.authenticityNotes?.trim() || null,
    edition_title: params.editionTitle?.trim() || null,
    translator: params.translator?.trim() || null,
    source_url: params.sourceUrl.trim(),
    source_edition_id: params.sourceEditionId?.trim() || null,
    rights_basis: params.rightsBasis.trim(),
    rights_evidence_url: params.rightsEvidenceUrl.trim(),
  };

  const { error: editionError } = await db.from("book_editions").insert(editionRow);
  if (editionError) {
    await db
      .from("book_chunks")
      .delete()
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .eq("source_version", book.source_version ?? 1);
    throw new Error(editionError.message);
  }

  const availableLanguages = Array.from(
    new Set([...(book.available_languages ?? []), params.language]),
  );
  const { error: bookUpdateError } = await db
    .from("books")
    .update({ available_languages: availableLanguages })
    .eq("id", params.bookId);
  if (bookUpdateError) {
    await db
      .from("book_editions")
      .delete()
      .eq("book_id", params.bookId)
      .eq("language", params.language);
    await db
      .from("book_chunks")
      .delete()
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .eq("source_version", book.source_version ?? 1);
    throw new Error(bookUpdateError.message);
  }

  return {
    bookId: params.bookId,
    language: params.language,
    sectionCount: sections.length,
    provenanceType: params.provenanceType,
    accessType: "free" as const,
  };
}

// ---------------------------------------------------------------------------
// Admin upload / batch import
// ---------------------------------------------------------------------------

export interface AdminBookInput {
  title: string;
  author: string;
  sourceLanguage: string;
  description: string;
  genre?: string | null | undefined;
  categories?: string[] | undefined;
  translator?: string | null | undefined;
  coverUrl?: string | null | undefined;
  sourceUrl?: string | null | undefined;
  sourceEditionId?: string | null | undefined;
  rightsBasis: string;
  rightsEvidenceUrl?: string | null | undefined;
  attribution?: string | null | undefined;
  permittedTerritories?: string[] | undefined;
  translationPermission: boolean;
  importKey?: string | null | undefined;
  manuscriptText: string; // already-extracted plain text (from .txt paste or EPUB extraction)
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface AdminUploadResult {
  bookId: string;
  created: boolean;
  reason?: string;
  chapterCount: number;
  warnings: string[];
}

/**
 * Creates one admin-uploaded book as a draft awaiting review. Idempotent by
 * import_key (if provided, e.g. a CSV row id) and by content checksum
 * (protects against re-running the same batch/file twice even without an
 * explicit key) — a retry returns the existing book instead of duplicating.
 */
export async function adminCreateBook(
  input: AdminBookInput,
  uploaderId: string,
): Promise<AdminUploadResult> {
  const db = await admin();
  const checksum = checksumOf(input.manuscriptText);

  if (input.importKey) {
    const { data: existing } = await db
      .from("books")
      .select("id")
      .eq("import_key", input.importKey)
      .maybeSingle();
    if (existing)
      return {
        bookId: existing.id,
        created: false,
        reason: "import_key already used",
        chapterCount: 0,
        warnings: [],
      };
  }
  const { data: byChecksum } = await db
    .from("books")
    .select("id")
    .eq("checksum", checksum)
    .maybeSingle();
  if (byChecksum) {
    return {
      bookId: byChecksum.id,
      created: false,
      reason: "identical manuscript already imported",
      chapterCount: 0,
      warnings: [],
    };
  }

  const religious = (input.categories ?? []).includes("Religious");
  const parsed = parseManuscript(input.manuscriptText, {
    preserveLineation: religious,
  });
  const chunks = parsed.chunks;
  const warnings: string[] = [];
  const { data: book, error } = await db
    .from("books")
    .insert({
      title: input.title,
      author: input.author,
      author_id: null,
      source_language: input.sourceLanguage,
      available_languages: [input.sourceLanguage],
      total_chunks: chunks.length,
      description: input.description,
      genre: input.genre ?? "",
      categories: input.categories ?? [],
      content_classification: religious ? "religious" : "general",
      translation_generation_policy: religious ? "source_only" : "ai_allowed",
      typography_profile: religious ? "facsimile_preserving" : "standard",
      translator: input.translator ?? null,
      cover_url: input.coverUrl ?? null,
      source_url: input.sourceUrl ?? null,
      source_edition_id: input.sourceEditionId ?? null,
      rights_basis: input.rightsBasis,
      rights_evidence_url: input.rightsEvidenceUrl ?? null,
      attribution: input.attribution ?? null,
      permitted_territories: input.permittedTerritories ?? [],
      translation_permission: input.translationPermission,
      import_key: input.importKey ?? null,
      checksum,
      status: "in_review",
      rights_status: "pending",
      edition_review_status: "pending",
      access_type: "free",
    })
    .select("id")
    .single();
  if (error || !book) throw new Error(error?.message ?? "Could not create book");

  const { error: chunkError } = await db.from("book_chunks").insert(
    chunks.map((content, i) => ({
      book_id: book.id,
      language: input.sourceLanguage,
      chunk_index: i,
      content,
      status: "published",
    })),
  );
  if (chunkError)
    throw new Error(`Book created, but manuscript text failed to save: ${chunkError.message}`);

  // Reader V2 is additive. Once migration 0017 is present we persist the
  // semantic navigation overlay generated from the manuscript; before that
  // the book remains usable through the reader's legacy fallback TOC.
  if (parsed.structure.length > 0) {
    const { error: structureError } = await db.from("book_structure_nodes").insert(
      parsed.structure.map((node) => ({
        book_id: book.id,
        language: input.sourceLanguage,
        source_version: 1,
        node_key: node.nodeKey,
        parent_node_key: node.parentNodeKey,
        node_type: node.nodeType,
        title: node.title,
        ordinal: node.ordinal,
        depth: node.depth,
        start_chunk_index: node.startChunkIndex,
        end_chunk_index: node.endChunkIndex,
      })),
    );
    if (structureError) {
      warnings.push(
        structureError.code === "42P01" || /book_structure_nodes/i.test(structureError.message)
          ? "Reader V2 semantic structure was not stored because migration 0017 is not applied yet."
          : `Semantic structure needs review: ${structureError.message}`,
      );
    }
  }

  const { error: readerMetadataError } = await db
    .from("books")
    .update({
      word_count: parsed.wordCount,
      estimated_reading_minutes: parsed.estimatedReadingMinutes,
      structure_review_status: parsed.structure.length > 0 ? "pending" : "changes_requested",
      cleanup_review_status: "pending",
    })
    .eq("id", book.id);
  if (readerMetadataError) {
    if (
      readerMetadataError.code !== "42703" &&
      !/word_count|estimated_reading_minutes|structure_review_status|cleanup_review_status/i.test(
        readerMetadataError.message,
      )
    ) {
      warnings.push(`Reader quality metadata needs review: ${readerMetadataError.message}`);
    }
  }

  return { bookId: book.id, created: true, chapterCount: chunks.length, warnings };
}

export interface CsvRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
}

const REQUIRED_CSV_COLUMNS = [
  "title",
  "author",
  "source_language",
  "description",
  "rights_basis",
  "manuscript_text",
];

/** Parses a CSV manifest (header row + data rows) with per-row validation.
 * Deliberately simple (no quoted-comma support) — documented in the operator
 * guide; malformed rows are reported, not silently skipped. */
export function parseCsvManifest(csvText: string): { rows: CsvRow[]; columns: string[] } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0];
  if (!header) return { rows: [], columns: [] };
  const columns = header.split(",").map((c) => c.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const cells = line.split(",");
    const data: Record<string, string> = {};
    columns.forEach((col, idx) => {
      data[col] = (cells[idx] ?? "").trim();
    });
    const errors: string[] = [];
    for (const required of REQUIRED_CSV_COLUMNS) {
      if (!data[required]) errors.push(`Missing required column "${required}"`);
    }
    const permissionCell = data["translation_permission"];
    if (permissionCell && !["true", "false", ""].includes(permissionCell.toLowerCase())) {
      errors.push('translation_permission must be "true" or "false"');
    }
    rows.push({ rowNumber: i + 1, data, errors });
  }
  return { rows, columns };
}

export interface BatchImportRowResult {
  rowNumber: number;
  ok: boolean;
  bookId?: string;
  created?: boolean;
  error?: string;
}

export async function adminBatchImport(params: {
  rows: CsvRow[];
  uploaderId: string;
  dryRun: boolean;
}): Promise<BatchImportRowResult[]> {
  const results: BatchImportRowResult[] = [];
  for (const row of params.rows) {
    if (row.errors.length > 0) {
      results.push({ rowNumber: row.rowNumber, ok: false, error: row.errors.join("; ") });
      continue;
    }
    if (params.dryRun) {
      results.push({ rowNumber: row.rowNumber, ok: true });
      continue;
    }
    try {
      const d = row.data;
      const manuscriptText = d["manuscript_text"] ?? "";
      const categoriesCell = d["categories"];
      const territoriesCell = d["permitted_territories"];
      const result = await adminCreateBook(
        {
          title: d["title"] ?? "",
          author: d["author"] ?? "",
          sourceLanguage: d["source_language"] ?? "",
          description: d["description"] ?? "",
          genre: d["genre"] || null,
          categories: categoriesCell ? categoriesCell.split("|").map((s) => s.trim()) : [],
          translator: d["translator"] || null,
          coverUrl: d["cover_url"] || null,
          sourceUrl: d["source_url"] || null,
          sourceEditionId: d["source_edition_id"] || null,
          rightsBasis: d["rights_basis"] ?? "",
          rightsEvidenceUrl: d["rights_evidence_url"] || null,
          attribution: d["attribution"] || null,
          permittedTerritories: territoriesCell
            ? territoriesCell.split("|").map((s) => s.trim())
            : [],
          translationPermission: d["translation_permission"]?.toLowerCase() === "true",
          importKey:
            d["import_key"] || `csv:${row.rowNumber}:${checksumOf(manuscriptText).slice(0, 16)}`,
          manuscriptText,
        },
        params.uploaderId,
      );
      results.push({
        rowNumber: row.rowNumber,
        ok: true,
        bookId: result.bookId,
        created: result.created,
      });
    } catch (error) {
      results.push({
        rowNumber: row.rowNumber,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export async function extractEpubToManuscriptText(
  fileBytes: Uint8Array,
): Promise<{ text: string; warnings: string[] }> {
  try {
    const parsed = await parseEpub(fileBytes);
    const text = parsed.chapters
      .map((c) => (c.title ? `${c.title}\n\n${c.text}` : c.text))
      .filter(Boolean)
      .join("\n\n");
    return { text, warnings: parsed.warnings };
  } catch (error) {
    if (error instanceof EpubValidationError) throw error;
    throw new Error(error instanceof Error ? error.message : "Could not read this EPUB file");
  }
}

// ============================================================================
// Rights & provenance editing (admin)
//
// Rights evidence is deliberately editable separately from ordinary metadata.
// Any substantive change invalidates a previous rights approval unless the
// book was never reviewed ("pending"). Published books must be unpublished
// before their legal/provenance record can be changed, so we never leave a
// publicly visible book carrying newly-unverified rights data.
// ============================================================================
export interface BookRightsProvenancePatch {
  rightsBasis: string;
  rightsEvidenceUrl: string | null;
  sourceUrl: string | null;
  attribution: string | null;
  translationPermission: boolean;
  permittedTerritories: string[];
}

export async function updateBookRightsProvenance(params: {
  bookId: string;
  patch: BookRightsProvenancePatch;
}): Promise<{ before: Record<string, unknown> | null; after: Record<string, unknown> }> {
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("books")
    .select(
      "status, rights_status, rights_basis, rights_evidence_url, source_url, attribution, translation_permission, permitted_territories",
    )
    .eq("id", params.bookId)
    .single();
  if (beforeError) throw new Error(beforeError.message);
  if (!before) throw new Error("Book not found");
  if (before.status === "published") {
    throw new Error(
      "Unpublish this book before editing rights & provenance. Rights changes must be re-reviewed before the book can go public again.",
    );
  }

  const nextRightsStatus = before.rights_status === "pending" ? "pending" : "unverified";
  const payload = {
    rights_basis: params.patch.rightsBasis.trim(),
    rights_evidence_url: params.patch.rightsEvidenceUrl,
    source_url: params.patch.sourceUrl,
    attribution: params.patch.attribution,
    translation_permission: params.patch.translationPermission,
    permitted_territories: params.patch.permittedTerritories,
    rights_status: nextRightsStatus,
    rights_risk_acknowledged_at: null,
    rights_risk_acknowledged_by: null,
  };

  const { error } = await db.from("books").update(payload).eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { before, after: payload };
}

// ============================================================================
// Book metadata editing (admin) — title/author/description/genre/cover only.
// Never touches status, access_type, subscription_price_usd, or any rights/
// review column — those all go through the dedicated review/access
// functions above, each with their own gate. An admin editing metadata
// keeps the book at whatever status it's already at (unlike an author's
// self-edit, which must force a published book back into review — see
// editBookMetadata in src/lib/library.ts): the admin IS the reviewer, so
// their own edit doesn't need to re-request their own approval.
// ============================================================================
export interface BookMetadataPatch {
  title?: string | undefined;
  author?: string | undefined;
  description?: string | undefined;
  genre?: string | null | undefined;
  coverUrl?: string | null | undefined;
  editionTitle?: string | null | undefined;
  editionYear?: number | null | undefined;
  publisher?: string | null | undefined;
  isbn?: string | null | undefined;
  sourceScanId?: string | null | undefined;
  originalPublicationYear?: number | null | undefined;
}

export async function updateBookMetadata(params: {
  bookId: string;
  patch: BookMetadataPatch;
}): Promise<{ before: Record<string, unknown> | null; after: Record<string, unknown> }> {
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("books")
    .select("*")
    .eq("id", params.bookId)
    .single();
  if (beforeError) throw new Error(beforeError.message);
  const payload: {
    title?: string;
    author?: string;
    description?: string;
    genre?: string | null;
    cover_url?: string | null;
    edition_title?: string | null;
    edition_year?: number | null;
    publisher?: string | null;
    isbn?: string | null;
    source_scan_id?: string | null;
    original_publication_year?: number | null;
  } = {
    ...(params.patch.title !== undefined ? { title: params.patch.title } : {}),
    ...(params.patch.author !== undefined ? { author: params.patch.author } : {}),
    ...(params.patch.description !== undefined ? { description: params.patch.description } : {}),
    ...(params.patch.genre !== undefined ? { genre: params.patch.genre } : {}),
    ...(params.patch.coverUrl !== undefined ? { cover_url: params.patch.coverUrl } : {}),
    ...(params.patch.editionTitle !== undefined ? { edition_title: params.patch.editionTitle } : {}),
    ...(params.patch.editionYear !== undefined ? { edition_year: params.patch.editionYear } : {}),
    ...(params.patch.publisher !== undefined ? { publisher: params.patch.publisher } : {}),
    ...(params.patch.isbn !== undefined ? { isbn: params.patch.isbn } : {}),
    ...(params.patch.sourceScanId !== undefined ? { source_scan_id: params.patch.sourceScanId } : {}),
    ...(params.patch.originalPublicationYear !== undefined
      ? { original_publication_year: params.patch.originalPublicationYear }
      : {}),
  };
  if (Object.keys(payload).length === 0) {
    throw new Error("No metadata fields were provided to update.");
  }
  const { error } = await db.from("books").update(payload).eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { before, after: payload };
}

// ============================================================================
// Staged content editing (admin) — see migration 0013's header for the full
// rationale. An edit never touches `content` directly; it lands in
// `pending_content` until a separate publish action promotes it. Works for
// any language, original or translated, since it's just editing an
// existing (book_id, language, chunk_index) row's text — language/edition
// association can never drift because no new row is ever created.
// ============================================================================
export interface ChunkForEdit {
  content: string;
  pending_content: string | null;
  pending_content_by: string | null;
  pending_content_at: string | null;
}

export async function getChunkForEdit(params: {
  bookId: string;
  language: string;
  chunkIndex: number;
}): Promise<ChunkForEdit | null> {
  const db = await admin();
  const { data, error } = await db
    .from("book_chunks")
    .select("content, pending_content, pending_content_by, pending_content_at")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ChunkForEdit | null) ?? null;
}

export async function stageChunkContentEdit(params: {
  bookId: string;
  language: string;
  chunkIndex: number;
  newContent: string;
  editorId: string;
}): Promise<{ before: string; after: string }> {
  if (!params.newContent.trim()) {
    throw new Error("Edited content cannot be empty.");
  }
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("book_chunks")
    .select("content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex)
    .maybeSingle();
  if (beforeError) throw new Error(beforeError.message);
  if (!before) throw new Error("That page doesn't exist for this book and language.");
  const { error } = await db
    .from("book_chunks")
    .update({
      pending_content: params.newContent,
      pending_content_by: params.editorId,
      pending_content_at: new Date().toISOString(),
    })
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex);
  if (error) throw new Error(error.message);
  return { before: before.content, after: params.newContent };
}

export async function publishChunkContentEdit(params: {
  bookId: string;
  language: string;
  chunkIndex: number;
}): Promise<{ before: string; after: string }> {
  const db = await admin();
  const { data: row, error: rowError } = await db
    .from("book_chunks")
    .select("content, pending_content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row || !row.pending_content) {
    throw new Error("There is no pending edit to publish for this page.");
  }
  const { error } = await db
    .from("book_chunks")
    .update({
      content: row.pending_content,
      pending_content: null,
      pending_content_by: null,
      pending_content_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex);
  if (error) throw new Error(error.message);
  return { before: row.content, after: row.pending_content };
}

export async function discardChunkContentEdit(params: {
  bookId: string;
  language: string;
  chunkIndex: number;
}): Promise<{ discarded: string | null }> {
  const db = await admin();
  const { data: row } = await db
    .from("book_chunks")
    .select("pending_content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex)
    .maybeSingle();
  const { error } = await db
    .from("book_chunks")
    .update({ pending_content: null, pending_content_by: null, pending_content_at: null })
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex);
  if (error) throw new Error(error.message);
  return { discarded: row?.pending_content ?? null };
}

// ============================================================================
// Deletion — reversible by default (setBookLifecycleStatus's 'archived',
// above), permanent as a separate, explicit, owner/administrator-only
// action gated by catalog.delete_permanent (see catalog.functions.ts).
// ============================================================================
export interface BookDeletionImpact {
  bookId: string;
  title: string;
  status: string;
  chunkCount: number;
  editionCount: number;
  translationJobCount: number;
  progressCount: number;
  highlightCount: number;
  shelfCount: number;
  subscriptionCount: number;
  translationRequestCount: number;
  translationReportCount: number;
  relatedSupportTicketCount: number;
}

type DeletionImpactTable =
  | "book_chunks"
  | "book_editions"
  | "book_translation_jobs"
  | "reading_progress"
  | "book_highlights"
  | "book_shelves"
  | "user_subscriptions"
  | "translation_requests"
  | "translation_reports"
  | "support_tickets";

async function countWhere(
  db: Awaited<ReturnType<typeof admin>>,
  table: DeletionImpactTable,
  column: string,
  bookId: string,
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, bookId);
  if (error) throw new Error(`Couldn't count ${table}: ${error.message}`);
  return count ?? 0;
}

export async function getBookDeletionImpact(bookId: string): Promise<BookDeletionImpact> {
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select("title, status")
    .eq("id", bookId)
    .single();
  if (bookError || !book) throw new Error("Book not found.");

  const [
    chunkCount,
    editionCount,
    translationJobCount,
    progressCount,
    highlightCount,
    shelfCount,
    subscriptionCount,
    translationRequestCount,
    translationReportCount,
    relatedSupportTicketCount,
  ] = await Promise.all([
    countWhere(db, "book_chunks", "book_id", bookId),
    countWhere(db, "book_editions", "book_id", bookId),
    countWhere(db, "book_translation_jobs", "book_id", bookId),
    countWhere(db, "reading_progress", "book_id", bookId),
    countWhere(db, "book_highlights", "book_id", bookId),
    countWhere(db, "book_shelves", "book_id", bookId),
    countWhere(db, "user_subscriptions", "book_id", bookId),
    countWhere(db, "translation_requests", "book_id", bookId),
    countWhere(db, "translation_reports", "book_id", bookId),
    countWhere(db, "support_tickets", "related_book_id", bookId),
  ]);

  return {
    bookId,
    title: book.title,
    status: book.status,
    chunkCount,
    editionCount,
    translationJobCount,
    progressCount,
    highlightCount,
    shelfCount,
    subscriptionCount,
    translationRequestCount,
    translationReportCount,
    relatedSupportTicketCount,
  };
}

export async function deleteBookPermanently(params: {
  bookId: string;
}): Promise<{ impact: BookDeletionImpact }> {
  const impact = await getBookDeletionImpact(params.bookId);
  if (impact.status !== "archived" && impact.status !== "unpublished") {
    throw new Error(
      "Permanent deletion requires the book to already be archived or unpublished — take it down first (reversible), then delete it permanently as a separate step.",
    );
  }
  const db = await admin();
  // support_tickets.related_book_id has no ON DELETE cascade, by design —
  // a support ticket is a moderation/audit record and must survive the
  // book it references being deleted, never disappearing along with it.
  // Detach the reference explicitly so the DELETE below doesn't fail
  // against this one non-cascading FK; every other related table (chunks,
  // editions, jobs, progress, highlights, shelves, subscriptions,
  // requests, reports) cascades automatically.
  if (impact.relatedSupportTicketCount > 0) {
    const { error: detachError } = await db
      .from("support_tickets")
      .update({ related_book_id: null })
      .eq("related_book_id", params.bookId);
    if (detachError) {
      throw new Error(`Couldn't detach related support tickets: ${detachError.message}`);
    }
  }
  const { error } = await db.from("books").delete().eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { impact };
}

// ============================================================================
// Book categories — admin-managed assignment against the controlled
// vocabulary published at content_settings["categories"] (already a legal
// settings key, already public/versioned/audited — reused as-is, not
// duplicated). A book may belong to more than one category
// (books.categories text[], migration 0005) — never a new book record.
// ============================================================================
async function getMasterCategories(): Promise<string[]> {
  const { getSetting } = await import("@/lib/admin/settings.server");
  const row = await getSetting("categories");
  const value = row?.value;
  return Array.isArray(value) ? (value.filter((v) => typeof v === "string") as string[]) : [];
}

function validateCategoriesAgainstMasterList(categories: string[], master: string[]): void {
  const invalid = categories.filter((c) => !master.includes(c));
  if (invalid.length > 0) {
    throw new Error(
      `Not in the category list: ${invalid.join(", ")}. Add ${invalid.length === 1 ? "it" : "them"} to the master list in Admin Settings first, or pick an existing category.`,
    );
  }
}

export async function setBookCategories(params: {
  bookId: string;
  categories: string[];
}): Promise<{ before: string[]; after: string[] }> {
  const master = await getMasterCategories();
  const deduped = [...new Set(params.categories.map((c) => c.trim()).filter(Boolean))];
  validateCategoriesAgainstMasterList(deduped, master);
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("books")
    .select("categories")
    .eq("id", params.bookId)
    .single();
  if (beforeError) throw new Error(beforeError.message);
  const { error } = await db.from("books").update({ categories: deduped }).eq("id", params.bookId);
  if (error) throw new Error(error.message);
  return { before: (before?.categories as string[] | null) ?? [], after: deduped };
}

export interface BulkCategoryResult {
  bookId: string;
  ok: boolean;
  error?: string;
}

/** Adds OR removes a single category across many books at once — safe to
 * do in bulk because each book's own array is patched independently (no
 * shared state, no risk of one book's failure corrupting another's), the
 * same resilience pattern as bulkSetAccessType. */
export async function bulkPatchBookCategory(params: {
  bookIds: string[];
  category: string;
  action: "add" | "remove";
}): Promise<BulkCategoryResult[]> {
  if (params.action === "remove" && params.category === "Religious") {
    throw new Error(
      'The protected "Religious" category cannot be removed in bulk. Change a Religious book classification only through the owner-only content-policy workflow.',
    );
  }
  const master = await getMasterCategories();
  if (params.action === "add") {
    validateCategoriesAgainstMasterList([params.category], master);
  }
  const db = await admin();
  const results: BulkCategoryResult[] = [];
  for (const bookId of params.bookIds) {
    try {
      const { data: row, error: readError } = await db
        .from("books")
        .select("categories")
        .eq("id", bookId)
        .single();
      if (readError) throw new Error(readError.message);
      const current = (row?.categories as string[] | null) ?? [];
      const next =
        params.action === "add"
          ? current.includes(params.category)
            ? current
            : [...current, params.category]
          : current.filter((c) => c !== params.category);
      const { error: writeError } = await db
        .from("books")
        .update({ categories: next })
        .eq("id", bookId);
      if (writeError) throw new Error(writeError.message);
      results.push({ bookId, ok: true });
    } catch (error) {
      results.push({ bookId, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

export async function suggestCategory(params: {
  contentType: "book" | "research_paper";
  contentId: string;
  suggestedBy: string;
  category: string;
}): Promise<{ id: string }> {
  if (!params.category.trim()) throw new Error("Enter a category to suggest.");
  const db = await admin();
  // Ownership is re-verified here even though RLS also enforces it on the
  // client-facing insert path — this function is called from a server
  // function that (like every other admin-adjacent one in this codebase)
  // uses the service-role client, which bypasses RLS entirely, so this
  // check IS the enforcement for this specific call path, not a redundant
  // extra.
  const table = params.contentType === "book" ? "books" : "research_papers";
  const { data: owned, error: ownError } = await db
    .from(table)
    .select("author_id")
    .eq("id", params.contentId)
    .maybeSingle();
  if (ownError) throw new Error(ownError.message);
  if (!owned || owned.author_id !== params.suggestedBy) {
    throw new Error("You can only suggest a category for your own submission.");
  }
  const { data, error } = await db
    .from("category_suggestions")
    .insert({
      content_type: params.contentType,
      content_id: params.contentId,
      suggested_by: params.suggestedBy,
      suggested_category: params.category.trim(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export interface CategorySuggestionRow {
  id: string;
  content_type: "book" | "research_paper";
  content_id: string;
  suggested_category: string;
  suggested_by: string;
  status: "pending" | "approved" | "declined";
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

// Explicit return type — without it, since category_suggestions isn't in
// the generated Supabase types until migration 0014 is applied, TS falls
// back to a polluted union of unrelated table row shapes (content_settings,
// admin_action_events, ...) that leaks into every caller, same class of bug
// as listBookEditions had in an earlier pass.
export async function listCategorySuggestions(status?: string): Promise<CategorySuggestionRow[]> {
  const db = await admin();
  let query = db
    .from("category_suggestions")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CategorySuggestionRow[];
}

/** Deciding a suggestion NEVER itself changes books.categories or the
 * master list — "approved" only means "an admin agrees this is a
 * reasonable category," recorded for reference. Actually adding it to a
 * book (setBookCategories) or to the master vocabulary (a separate
 * content_settings["categories"] publish) is always a distinct, later,
 * deliberate admin action — this is what keeps "an author must not
 * publish a new public category or bypass review" true regardless of how
 * this decision comes out. */
export async function decideCategorySuggestion(params: {
  suggestionId: string;
  decision: "approved" | "declined";
  decidedBy: string;
  note?: string | undefined;
}): Promise<{ before: Record<string, unknown> | null }> {
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("category_suggestions")
    .select("*")
    .eq("id", params.suggestionId)
    .single();
  if (beforeError) throw new Error(beforeError.message);
  const { error } = await db
    .from("category_suggestions")
    .update({
      status: params.decision,
      decided_by: params.decidedBy,
      decided_at: new Date().toISOString(),
      decision_note: params.note ?? null,
    })
    .eq("id", params.suggestionId);
  if (error) throw new Error(error.message);
  return { before };
}
