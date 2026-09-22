// Public browse/read and author-facing submission for research papers —
// a content type deliberately distinct from books/translations (see
// migration 0014's header). Public reads go straight against
// research_paper_versions (RLS already scopes that to the current,
// non-withdrawn snapshot only — the same "RLS is the real boundary, not
// this file" discipline as listBooks/getBook in src/lib/library.ts).
// Author writes go straight against research_papers, RLS-scoped to the
// caller's own row and to a self-editable status — mirrors
// src/lib/library.ts's publishBook/setBookStatus pattern exactly.
import { supabase } from "@/integrations/supabase/client";

export const PAPER_TYPES = [
  { value: "original_research", label: "Original research" },
  { value: "literary_analysis", label: "Literary analysis" },
  { value: "review_essay", label: "Review essay" },
  { value: "textual_study", label: "Textual study" },
  { value: "other", label: "Other" },
] as const;
export type PaperType = (typeof PAPER_TYPES)[number]["value"];

export type ResearchPaperStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "published"
  | "unpublished";

export interface ResearchPaper {
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
  paper_type: PaperType;
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
  status: ResearchPaperStatus;
  rejection_reason: string | null;
  review_notes: string | null;
  published_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResearchPaperVersion {
  id: string;
  paper_id: string;
  version: number;
  author_name: string;
  coauthor_names: string[];
  affiliation: string | null;
  orcid: string | null;
  language: string;
  title: string;
  abstract: string;
  keywords: string[];
  topic: string | null;
  paper_type: PaperType;
  body_text: string | null;
  pdf_filename: string | null;
  pdf_size_bytes: number | null;
  citation_style: string | null;
  references_text: string;
  funding_note: string | null;
  conflicts_of_interest: string | null;
  acknowledgments: string | null;
  ai_assistance_disclosure: string | null;
  published_at: string;
}

const PUBLIC_VERSION_COLUMNS =
  "id, paper_id, version, author_name, coauthor_names, affiliation, orcid, language, title, abstract, keywords, topic, paper_type, body_text, pdf_filename, pdf_size_bytes, citation_style, references_text, funding_note, conflicts_of_interest, acknowledgments, ai_assistance_disclosure, published_at";

/** Same matching contract as matchesBookSearch (src/lib/library.ts) — title,
 * author, abstract, and keywords, per the product rule, no fuzzy/stemmed
 * matching, correct for any script without configuration. */
export function matchesPaperSearch(
  paper: Pick<ResearchPaperVersion, "title" | "author_name" | "abstract" | "keywords">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    paper.title.toLowerCase().includes(q) ||
    paper.author_name.toLowerCase().includes(q) ||
    paper.abstract.toLowerCase().includes(q) ||
    paper.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

// ---------------------------------------------------------------------------
// Public — published papers only (RLS: research_papers.published_version_id
// points at this exact row, checked via the SECURITY DEFINER function
// is_paper_version_published() so it works for an anonymous caller — see
// migration 0014's "PUBLIC VISIBILITY DESIGN" / "THIRD REVIEW ROUND" notes.
// Deliberately independent of research_papers.status: a revision can be
// submitted, reviewed, and approved without ever hiding the still-live
// published version below).
// ---------------------------------------------------------------------------
export async function listPublishedPapers(): Promise<ResearchPaperVersion[]> {
  const { data, error } = await supabase
    .from("research_paper_versions")
    .select(PUBLIC_VERSION_COLUMNS)
    .order("published_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as ResearchPaperVersion[]) ?? [];
}

export async function getPublishedPaper(paperId: string): Promise<ResearchPaperVersion | null> {
  const { data, error } = await supabase
    .from("research_paper_versions")
    .select(PUBLIC_VERSION_COLUMNS)
    .eq("paper_id", paperId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as ResearchPaperVersion | null) ?? null;
}

// ---------------------------------------------------------------------------
// Author-facing
// ---------------------------------------------------------------------------
export async function listMyPapers(userId: string): Promise<ResearchPaper[]> {
  const { data, error } = await supabase
    .from("research_papers")
    .select("*")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as ResearchPaper[]) ?? [];
}

export async function getMyPaper(userId: string, paperId: string): Promise<ResearchPaper | null> {
  const { data, error } = await supabase
    .from("research_papers")
    .select("*")
    .eq("id", paperId)
    .eq("author_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as ResearchPaper | null) ?? null;
}

export interface PaperDraftInput {
  authorName: string;
  coauthorNames: string[];
  affiliation: string | null;
  orcid: string | null;
  language: string;
  title: string;
  abstract: string;
  keywords: string[];
  topic: string | null;
  paperType: PaperType;
  bodyText: string | null;
  citationStyle: string | null;
  referencesText: string;
  rightsDeclaration: string;
  thirdPartyRightsNote: string | null;
  fundingNote: string | null;
  conflictsOfInterest: string | null;
  acknowledgments: string | null;
  aiAssistanceDisclosure: string | null;
}

const ORCID_PATTERN = /^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/;

export function isValidOrcid(value: string): boolean {
  return ORCID_PATTERN.test(value.trim());
}

const REVISION_EDITABLE_STATUSES: ResearchPaperStatus[] = [
  "draft",
  "submitted",
  "changes_requested",
  "published",
];

/** Whether the author can still save an edit given the paper's CURRENT
 * status. 'published' is included on purpose: since public visibility is
 * governed solely by research_papers.published_version_id (never by
 * status — see migration 0014's "THIRD REVIEW ROUND" note), an author
 * starting a revision of an already-published paper can move status back
 * to 'submitted' for re-review without that ever hiding the still-live
 * published snapshot; only a later, explicit publish of the revision (or
 * an explicit withdrawal) changes what's public. 'approved' and 'rejected'
 * are deliberately excluded — unchanged, admin-action-pending states,
 * matching the equivalent book workflow. */
export function isEditableForRevision(status: ResearchPaperStatus): boolean {
  return REVISION_EDITABLE_STATUSES.includes(status);
}

function toRow(input: PaperDraftInput) {
  return {
    author_name: input.authorName.trim(),
    coauthor_names: input.coauthorNames.map((n) => n.trim()).filter(Boolean),
    affiliation: input.affiliation?.trim() || null,
    orcid: input.orcid?.trim() || null,
    language: input.language,
    title: input.title.trim(),
    abstract: input.abstract.trim(),
    keywords: input.keywords.map((k) => k.trim()).filter(Boolean),
    topic: input.topic?.trim() || null,
    paper_type: input.paperType,
    body_text: input.bodyText?.trim() || null,
    citation_style: input.citationStyle?.trim() || null,
    references_text: input.referencesText.trim(),
    rights_declaration: input.rightsDeclaration.trim(),
    third_party_rights_note: input.thirdPartyRightsNote?.trim() || null,
    funding_note: input.fundingNote?.trim() || null,
    conflicts_of_interest: input.conflictsOfInterest?.trim() || null,
    acknowledgments: input.acknowledgments?.trim() || null,
    ai_assistance_disclosure: input.aiAssistanceDisclosure?.trim() || null,
  };
}

/** Validates the fields a draft needs before it can move to 'submitted' —
 * a draft itself may be incomplete (saved early, finished later), but
 * submission requires every field the reader-facing page and the honesty
 * rules depend on. Returns the first problem found, or null if ready. */
export function firstSubmissionProblem(input: PaperDraftInput, hasContent: boolean): string | null {
  if (!input.authorName.trim()) return "Author name is required.";
  if (!input.title.trim()) return "Title is required.";
  if (!input.abstract.trim()) return "Abstract is required.";
  if (!input.referencesText.trim()) return "References / works cited is required.";
  if (!input.rightsDeclaration.trim()) {
    return "A rights declaration is required — confirm you hold the rights to submit this paper and any third-party material it includes.";
  }
  if (!hasContent) return "Provide the paper's main text or upload a PDF.";
  if (input.orcid && !isValidOrcid(input.orcid)) {
    return "ORCID doesn't look valid — expected format 0000-0000-0000-0000.";
  }
  return null;
}

/** Creates a new draft, or saves changes to an existing one the caller
 * owns. Never sets status itself beyond what's passed — the caller decides
 * 'draft' (save and keep editing) vs 'submitted' (send for review) exactly
 * like publishBook's status:'draft'|'in_review' split for books. RLS
 * (research_papers_author_update's WITH CHECK) independently refuses this
 * to leave status anywhere but draft/submitted/changes_requested no matter
 * what is passed — this function cannot itself publish or approve
 * anything. The existing-row check below (isEditableForRevision) allows
 * this to run even when the paper is currently 'published' — starting a
 * revision — since doing so never affects what's publicly visible (see
 * migration 0014's "THIRD REVIEW ROUND" note). */
export async function saveMyPaperDraft(
  userId: string,
  input: PaperDraftInput,
  status: "draft" | "submitted",
  hasPdf: boolean,
  existingPaperId?: string,
): Promise<ResearchPaper> {
  if (status === "submitted") {
    const problem = firstSubmissionProblem(input, hasPdf || !!input.bodyText?.trim());
    if (problem) throw new Error(problem);
  }
  const row = { ...toRow(input), status };

  if (existingPaperId) {
    const { data: existing, error: fetchError } = await supabase
      .from("research_papers")
      .select("id, author_id, status")
      .eq("id", existingPaperId)
      .eq("author_id", userId)
      .maybeSingle();
    if (fetchError) throw new Error(`Couldn't load this draft: ${fetchError.message}`);
    if (!existing) throw new Error("That draft couldn't be found, or isn't yours to edit.");
    if (!isEditableForRevision(existing.status as ResearchPaperStatus)) {
      throw new Error("This paper is no longer editable — it's already in or past review.");
    }
    const { data, error } = await supabase
      .from("research_papers")
      .update(row)
      .eq("id", existingPaperId)
      .eq("author_id", userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as unknown as ResearchPaper;
  }

  const { data, error } = await supabase
    .from("research_papers")
    .insert({ ...row, author_id: userId })
    .select("*")
    .single();
  if (error) throw new Error(`Couldn't save the paper: ${error.message}`);
  return data as unknown as ResearchPaper;
}
