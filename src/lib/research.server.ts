// Server-only. Research-paper PDF handling (author-facing, service-role for
// reliable bytea writes — see src/lib/research.functions.ts) and the full
// admin review/publish/withdraw workflow. Mirrors src/lib/admin/catalog.server.ts's
// review/publish structure closely — same accountable-review principle,
// applied to a whole-document content type instead of a chunked one.
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const EDITABLE_STATUSES = new Set(["draft", "submitted", "changes_requested"]);

export async function uploadPaperPdf(params: {
  paperId: string;
  authorId: string;
  filename: string;
  fileBase64: string;
}): Promise<{ ok: true }> {
  const db = await admin();
  const { data: paper, error: readError } = await db
    .from("research_papers")
    .select("author_id, status")
    .eq("id", params.paperId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!paper || paper.author_id !== params.authorId) {
    throw new Error("That paper couldn't be found, or isn't yours to edit.");
  }
  if (!EDITABLE_STATUSES.has(paper.status)) {
    throw new Error("This paper is no longer editable — it's already in or past review.");
  }
  const bytes = Buffer.from(params.fileBase64, "base64");
  const { error } = await db
    .from("research_papers")
    .update({
      pdf_data: bytes,
      pdf_filename: params.filename,
      pdf_size_bytes: bytes.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.paperId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function removePaperPdf(params: {
  paperId: string;
  authorId: string;
}): Promise<{ ok: true }> {
  const db = await admin();
  const { data: paper, error: readError } = await db
    .from("research_papers")
    .select("author_id, status")
    .eq("id", params.paperId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!paper || paper.author_id !== params.authorId) {
    throw new Error("That paper couldn't be found, or isn't yours to edit.");
  }
  if (!EDITABLE_STATUSES.has(paper.status)) {
    throw new Error("This paper is no longer editable — it's already in or past review.");
  }
  // The DB's own research_papers_has_content check constraint refuses this
  // if body_text is also empty — enforced by Postgres regardless of this
  // (service-role) call bypassing RLS, so a paper can never end up with
  // neither a body nor a PDF no matter what calls this.
  const { error } = await db
    .from("research_papers")
    .update({ pdf_data: null, pdf_filename: null, pdf_size_bytes: null })
    .eq("id", params.paperId);
  if (error) throw new Error(`Couldn't remove the PDF: ${error.message}`);
  return { ok: true };
}

/** Public-facing: reads back the PDF bytes for the CURRENTLY PUBLISHED
 * version only — never a draft/pending one, checked here independently of
 * whatever the caller already believes, since this bypasses RLS via
 * service-role. Returns base64 (matching uploadPaperPdf's own encoding)
 * rather than raw bytea, so the client never has to parse Postgres's hex
 * bytea wire format itself. */
export async function downloadPublishedPaperPdf(
  paperId: string,
): Promise<{ filename: string; base64: string } | null> {
  const db = await admin();
  const { data: paper, error } = await db
    .from("research_papers")
    .select("published_version_id")
    .eq("id", paperId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!paper?.published_version_id) return null;
  const { data: version, error: versionError } = await db
    .from("research_paper_versions")
    .select("pdf_data, pdf_filename, withdrawn")
    .eq("id", paper.published_version_id)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!version || version.withdrawn || !version.pdf_data || !version.pdf_filename) return null;
  const bytes = version.pdf_data as unknown;
  const base64 = Buffer.isBuffer(bytes)
    ? bytes.toString("base64")
    : Buffer.from(String(bytes).replace(/^\\x/, ""), "hex").toString("base64");
  return { filename: version.pdf_filename, base64 };
}

/** Public-facing "report a problem with this paper" — lands in the exact
 * same support_tickets admin queue as every other report in this codebase
 * (src/lib/admin/support.server.ts's createTicket, extended with
 * relatedPaperId by migration 0015), not a separate, easy-to-forget-about
 * table. Requires sign-in, same as reportTranslationIssue for books
 * (src/lib/translation.server.ts) — a report needs to be tied to a real
 * account, not anonymous. */
export async function reportResearchPaperProblem(params: {
  paperId: string;
  paperTitle: string;
  reporterId: string;
  reason: string;
}): Promise<{ ok: true }> {
  const { createTicket } = await import("@/lib/admin/support.server");
  await createTicket({
    userId: params.reporterId,
    subject: `Problem reported: ${params.paperTitle}`,
    description: params.reason,
    category: "complaint",
    relatedPaperId: params.paperId,
  });
  return { ok: true };
}

// ============================================================================
// Admin: list / review / publish / withdraw
// ============================================================================
export interface AdminResearchPaperSummary {
  id: string;
  title: string;
  author_name: string;
  status: string;
  paper_type: string;
  language: string;
  topic: string | null;
  created_at: string;
  updated_at: string;
}

// Explicit return type annotation — without it, since research_papers isn't
// in the generated Supabase types until migration 0014 is applied, TS falls
// back to a polluted union of unrelated table row shapes that leaks into
// every caller (same class of bug found and fixed for listBookEditions in
// an earlier pass — see catalog.server.ts).
export async function adminListResearchPapers(status?: string): Promise<AdminResearchPaperSummary[]> {
  const db = await admin();
  let query = db
    .from("research_papers")
    .select(
      "id, title, author_name, status, paper_type, language, topic, created_at, updated_at",
    )
    .order("updated_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminResearchPaperSummary[];
}

export interface AdminResearchPaperDetail {
  id: string;
  author_id: string;
  author_name: string;
  coauthor_names: string[];
  affiliation: string | null;
  orcid: string | null;
  language: string;
  title: string;
  abstract: string;
  keywords: string[];
  topic: string | null;
  paper_type: string;
  body_text: string | null;
  pdf_filename: string | null;
  pdf_size_bytes: number | null;
  citation_style: string | null;
  references_text: string;
  rights_declaration: string;
  third_party_rights_note: string | null;
  funding_note: string | null;
  conflicts_of_interest: string | null;
  acknowledgments: string | null;
  ai_assistance_disclosure: string | null;
  status: string;
  rejection_reason: string | null;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function adminGetResearchPaper(paperId: string): Promise<AdminResearchPaperDetail> {
  const db = await admin();
  const { data, error } = await db
    .from("research_papers")
    .select("*")
    .eq("id", paperId)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as AdminResearchPaperDetail;
}

/** Only ever moves status among submitted -> changes_requested/approved/
 * rejected — the SAME kind of decision reviewEdition makes for books, at
 * the whole-paper granularity a paper actually has (no separate
 * rights/edition split — there's no translation pipeline here to keep
 * apart from quality review). Approval does NOT publish anything by
 * itself; publishPaperVersion below is the separate, deliberate act that
 * makes an approved paper actually readable — same two-step discipline as
 * books' approve-then-publish. */
export async function reviewResearchPaper(params: {
  paperId: string;
  decision: "changes_requested" | "approved" | "rejected";
  reviewerId: string;
  notes?: string | undefined;
}): Promise<{ before: Record<string, unknown> | null; after: Record<string, unknown> }> {
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("research_papers")
    .select("status")
    .eq("id", params.paperId)
    .single();
  if (beforeError) throw new Error(beforeError.message);
  if (before.status !== "submitted") {
    throw new Error(
      `Can only review a paper that's currently submitted (this one is ${before.status}).`,
    );
  }
  const patch: Record<string, unknown> = {
    status: params.decision,
    review_notes: params.notes ?? null,
    reviewed_by: params.reviewerId,
    reviewed_at: new Date().toISOString(),
  };
  if (params.decision === "rejected") {
    patch["rejection_reason"] = params.notes ?? "Not approved for publication";
  }
  const { error } = await db.from("research_papers").update(patch).eq("id", params.paperId);
  if (error) throw new Error(error.message);
  return { before, after: patch };
}

const VERSION_SNAPSHOT_COLUMNS =
  "author_name, coauthor_names, affiliation, orcid, language, title, abstract, keywords, topic, paper_type, body_text, pdf_data, pdf_filename, pdf_size_bytes, citation_style, references_text, funding_note, conflicts_of_interest, acknowledgments, ai_assistance_disclosure";

export async function publishPaperVersion(params: {
  paperId: string;
  publisherId: string;
}): Promise<{ versionId: string; version: number }> {
  const db = await admin();
  const { data: paper, error: paperError } = await db
    .from("research_papers")
    .select(`status, ${VERSION_SNAPSHOT_COLUMNS}`)
    .eq("id", params.paperId)
    .single();
  if (paperError) throw new Error(paperError.message);
  if (paper.status !== "approved") {
    throw new Error(
      `Can only publish a paper that's been approved (this one is ${paper.status}).`,
    );
  }

  const { data: existingVersions, error: versionsError } = await db
    .from("research_paper_versions")
    .select("version")
    .eq("paper_id", params.paperId)
    .order("version", { ascending: false })
    .limit(1);
  if (versionsError) throw new Error(versionsError.message);
  const nextVersion = (existingVersions?.[0]?.version ?? 0) + 1;

  // Insert the new snapshot first — it is NOT publicly visible yet. The
  // public-read policy requires research_papers.published_version_id to
  // point at this exact row AND research_papers.status = 'published',
  // neither of which is true until the update below actually commits. If
  // anything fails between here and there, this row stays a permanent,
  // harmless orphan (never returned to any reader) rather than a leak —
  // see migration 0014's "PUBLIC VISIBILITY DESIGN" note for the full
  // reasoning. There is no separate "supersede the old version" step
  // anymore: moving the pointer below is the only statement that matters,
  // and it simultaneously hides whatever the pointer used to reference.
  const { author_name, coauthor_names, affiliation, orcid, language, title, abstract, keywords, topic, paper_type, body_text, pdf_data, pdf_filename, pdf_size_bytes, citation_style, references_text, funding_note, conflicts_of_interest, acknowledgments, ai_assistance_disclosure } = paper;
  const { data: newVersion, error: insertError } = await db
    .from("research_paper_versions")
    .insert({
      paper_id: params.paperId,
      version: nextVersion,
      author_name,
      coauthor_names,
      affiliation,
      orcid,
      language,
      title,
      abstract,
      keywords,
      topic,
      paper_type,
      body_text,
      pdf_data,
      pdf_filename,
      pdf_size_bytes,
      citation_style,
      references_text,
      funding_note,
      conflicts_of_interest,
      acknowledgments,
      ai_assistance_disclosure,
      published_by: params.publisherId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  // The ONLY statement that makes the new version publicly visible.
  // `.eq("status", "approved")` is a compare-and-swap: if a concurrent
  // call already published this paper, this matches zero rows and the
  // explicit check below reports it, instead of silently double-
  // publishing or overwriting a race we lost.
  const { data: updated, error: updateError } = await db
    .from("research_papers")
    .update({ status: "published", published_version_id: newVersion.id })
    .eq("id", params.paperId)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updated) {
    throw new Error(
      "This paper's status changed before publishing could complete (likely a concurrent action) — the new version was saved but not made public. Reload and try again.",
    );
  }

  return { versionId: newVersion.id as string, version: nextVersion };
}

/** Covers both a routine "take this down for now" unpublish AND a formal
 * correction/withdrawal — the mechanism is identical (the live snapshot
 * stops being publicly visible; nothing is deleted; a reason is recorded),
 * the only difference is framing, which the caller expresses through
 * `reason`. The paper's full version history, including this one, stays
 * in research_paper_versions as the audit trail regardless.
 *
 * Order matters: the research_papers status update runs FIRST, because
 * it's the only statement that actually cuts off public visibility (the
 * public-read policy requires status = 'published' — see migration
 * 0014's "PUBLIC VISIBILITY DESIGN" note). If the second statement
 * (marking the version row's own withdrawn_* audit fields) fails, the
 * paper is already correctly hidden; only a historical annotation is
 * missing, not a live leak. `published_version_id` is deliberately left
 * pointing at this version afterward — it's the historical record of
 * "the last thing that was published," not a security-relevant field
 * once status is no longer 'published'. */
export async function withdrawPublishedPaper(params: {
  paperId: string;
  actorId: string;
  reason: string;
}): Promise<{ before: Record<string, unknown> | null }> {
  const db = await admin();
  const { data: before, error: beforeError } = await db
    .from("research_papers")
    .select("status, published_version_id")
    .eq("id", params.paperId)
    .single();
  if (beforeError) throw new Error(beforeError.message);
  if (!before.published_version_id || before.status !== "published") {
    throw new Error("This paper has no published version to withdraw.");
  }
  const { data: updated, error: paperError } = await db
    .from("research_papers")
    .update({ status: "unpublished" })
    .eq("id", params.paperId)
    .eq("status", "published")
    .select("id")
    .maybeSingle();
  if (paperError) throw new Error(paperError.message);
  if (!updated) {
    throw new Error(
      "This paper's status changed before withdrawal could complete (likely a concurrent action). Reload and try again.",
    );
  }
  const { error: versionError } = await db
    .from("research_paper_versions")
    .update({
      withdrawn: true,
      withdrawn_at: new Date().toISOString(),
      withdrawn_by: params.actorId,
      withdrawn_reason: params.reason,
    })
    .eq("id", before.published_version_id);
  if (versionError) throw new Error(versionError.message);
  return { before };
}
