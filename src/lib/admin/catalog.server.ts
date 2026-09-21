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
import { splitManuscript } from "@/lib/manuscript";
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
 * ORIGINAL-language edition only ever requires rights + editorial approval
 * — a missing English/Urdu translation is informational ("pending"), never
 * blocking, per product rules: readers can always reach the original once
 * it's approved, and standard-language translations catch up asynchronously.
 * This mirrors (and must stay in sync with) the DB trigger
 * `check_book_publish_gate` in migration 0005, which is the unbypassable
 * backstop against a direct SQL/REST update skipping this function.
 */
export function computePublishGate(
  book: { rights_status: string; edition_review_status: string; source_language: string },
  reviewedLanguages: Set<string>,
): { canPublish: boolean; reasons: string[]; pendingTranslations: string[] } {
  const reasons: string[] = [];
  if (book.rights_status !== "approved") reasons.push("Rights review is not yet approved");
  if (book.edition_review_status !== "approved") {
    reasons.push("Edition quality review is not yet approved");
  }

  const STANDARD_TRANSLATION_TARGETS = ["English", "Urdu"];
  const pendingTranslations = STANDARD_TRANSLATION_TARGETS.filter(
    (lang) => lang !== book.source_language && !reviewedLanguages.has(lang),
  );

  return { canPublish: reasons.length === 0, reasons, pendingTranslations };
}

/** Mirrors the DB trigger's gate so the admin UI can show a specific,
 * actionable reason before the update is even attempted. */
export async function evaluatePublishGate(
  bookId: string,
): Promise<{ canPublish: boolean; reasons: string[]; pendingTranslations: string[] }> {
  const db = await admin();
  const { data: book, error } = await db.from("books").select("*").eq("id", bookId).single();
  if (error || !book) throw new Error("Book not found");

  const { data: jobs } = await db
    .from("book_translation_jobs")
    .select("language, status, human_reviewed")
    .eq("book_id", bookId)
    .eq("source_version", book.source_version)
    .eq("status", "published")
    .eq("human_reviewed", true);
  const reviewedLanguages = new Set((jobs ?? []).map((j) => j.language));

  return computePublishGate(book, reviewedLanguages);
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
    .select("rights_status, edition_review_status, status")
    .eq("id", params.bookId)
    .single();
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

  const chunks = splitManuscript(input.manuscriptText);
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

  return { bookId: book.id, created: true, chapterCount: chunks.length, warnings: [] };
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
