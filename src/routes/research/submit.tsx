import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Upload, X } from "lucide-react";
import { z } from "zod";
import { LANGUAGES } from "@/lib/data";
import {
  PAPER_TYPES,
  isValidOrcid,
  firstSubmissionProblem,
  saveMyPaperDraft,
  getMyPaper,
  type PaperDraftInput,
} from "@/lib/research";
import { uploadPaperPdf, removePaperPdf, MAX_PAPER_PDF_RAW_BYTES } from "@/lib/research.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

const searchSchema = z.object({ paperId: z.string().optional() });

export const Route = createFileRoute("/research/submit")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Submit a paper — Literature Research — Seeparah" }] }),
  component: SubmitPaperPage,
});

const EMPTY: PaperDraftInput = {
  authorName: "",
  coauthorNames: [],
  affiliation: null,
  orcid: null,
  language: "English",
  title: "",
  abstract: "",
  keywords: [],
  topic: null,
  paperType: "original_research",
  bodyText: null,
  citationStyle: null,
  referencesText: "",
  rightsDeclaration: "",
  thirdPartyRightsNote: null,
  fundingNote: null,
  conflictsOfInterest: null,
  acknowledgments: null,
  aiAssistanceDisclosure: null,
};

function SubmitPaperPage() {
  const { paperId } = Route.useSearch();
  const navigate = useNavigate();
  const { userId, isDemo, displayName } = useAuth();
  const [form, setForm] = useState<PaperDraftInput>({ ...EMPTY, authorName: displayName ?? "" });
  const [coauthorDraft, setCoauthorDraft] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [existingPdfName, setExistingPdfName] = useState<string | null>(null);
  const [currentPaperId, setCurrentPaperId] = useState<string | undefined>(paperId);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!paperId);

  useEffect(() => {
    if (!paperId || isDemo) return;
    getMyPaper(userId, paperId)
      .then((paper) => {
        if (!paper) {
          toast.error("Couldn't find that draft.");
          return;
        }
        setForm({
          authorName: paper.author_name,
          coauthorNames: paper.coauthor_names,
          affiliation: paper.affiliation,
          orcid: paper.orcid,
          language: paper.language,
          title: paper.title,
          abstract: paper.abstract,
          keywords: paper.keywords,
          topic: paper.topic,
          paperType: paper.paper_type,
          bodyText: paper.body_text,
          citationStyle: paper.citation_style,
          referencesText: paper.references_text,
          rightsDeclaration: paper.rights_declaration,
          thirdPartyRightsNote: paper.third_party_rights_note,
          fundingNote: paper.funding_note,
          conflictsOfInterest: paper.conflicts_of_interest,
          acknowledgments: paper.acknowledgments,
          aiAssistanceDisclosure: paper.ai_assistance_disclosure,
        });
        setExistingPdfName(paper.pdf_filename);
        setCurrentPaperId(paper.id);
      })
      .finally(() => setLoaded(true));
  }, [paperId, userId, isDemo]);

  function patch(p: Partial<PaperDraftInput>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function token(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error("Sign in to submit a paper");
    return t;
  }

  async function uploadPdfIfNeeded(id: string) {
    if (!pdfFile) return;
    if (pdfFile.size > MAX_PAPER_PDF_RAW_BYTES) {
      throw new Error(
        `That PDF is too large (${(pdfFile.size / 1024 / 1024).toFixed(1)}MB) — the limit right now is ${(MAX_PAPER_PDF_RAW_BYTES / 1024 / 1024).toFixed(0)}MB.`,
      );
    }
    const buffer = await pdfFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    await uploadPaperPdf({
      data: { accessToken: await token(), paperId: id, filename: pdfFile.name, fileBase64: base64 },
    });
  }

  async function save(status: "draft" | "submitted") {
    if (isDemo) {
      toast.error("Sign in to submit a research paper — this needs a real account.");
      return;
    }
    if (status === "submitted") {
      const problem = firstSubmissionProblem(form, !!pdfFile || !!existingPdfName || !!form.bodyText?.trim());
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    if (form.orcid && !isValidOrcid(form.orcid)) {
      toast.error("ORCID doesn't look valid — expected format 0000-0000-0000-0000.");
      return;
    }
    setBusy(true);
    try {
      const saved = await saveMyPaperDraft(
        userId,
        form,
        status,
        !!pdfFile || !!existingPdfName,
        currentPaperId,
      );
      setCurrentPaperId(saved.id);
      await uploadPdfIfNeeded(saved.id);
      setPdfFile(null);
      toast.success(status === "submitted" ? "Submitted for review" : "Draft saved");
      if (status === "submitted") {
        navigate({ to: "/research/mine" });
      } else {
        navigate({ to: "/research/submit", search: { paperId: saved.id }, replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save this paper");
    } finally {
      setBusy(false);
    }
  }

  async function clearPdf() {
    if (!currentPaperId) {
      setPdfFile(null);
      return;
    }
    setBusy(true);
    try {
      await removePaperPdf({ data: { accessToken: await token(), paperId: currentPaperId } });
      setExistingPdfName(null);
      setPdfFile(null);
      toast.success("PDF removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove the PDF");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
  const labelCls = "text-xs font-semibold text-foreground";

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <Link
          to="/research"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Literature Research
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground">
          Submit a paper
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          An editor reviews rights and readiness before publication. This is editorial review, not
          peer review, and your paper won't show a DOI, journal affiliation, or indexed status.
        </p>

        <div className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelCls}>Title *</span>
              <input className={inputCls} value={form.title} onChange={(e) => patch({ title: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>Author name *</span>
              <input
                className={inputCls}
                value={form.authorName}
                onChange={(e) => patch({ authorName: e.target.value })}
              />
            </label>
          </div>

          <div className="space-y-1">
            <span className={labelCls}>Consenting coauthors (optional)</span>
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={coauthorDraft}
                onChange={(e) => setCoauthorDraft(e.target.value)}
                placeholder="Name, then Add"
              />
              <button
                type="button"
                onClick={() => {
                  if (!coauthorDraft.trim()) return;
                  patch({ coauthorNames: [...form.coauthorNames, coauthorDraft.trim()] });
                  setCoauthorDraft("");
                }}
                className="shrink-0 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary"
              >
                Add
              </button>
            </div>
            {form.coauthorNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.coauthorNames.map((n, i) => (
                  <span
                    key={`${n}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
                  >
                    {n}
                    <button
                      type="button"
                      onClick={() => patch({ coauthorNames: form.coauthorNames.filter((_, j) => j !== i) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Only list coauthors who have actually agreed to be credited on this submission.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelCls}>Affiliation (optional)</span>
              <input
                className={inputCls}
                value={form.affiliation ?? ""}
                onChange={(e) => patch({ affiliation: e.target.value || null })}
              />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>ORCID (optional)</span>
              <input
                className={inputCls}
                value={form.orcid ?? ""}
                onChange={(e) => patch({ orcid: e.target.value || null })}
                placeholder="0000-0000-0000-0000"
              />
              {form.orcid && !isValidOrcid(form.orcid) && (
                <p className="text-[11px] text-destructive">Doesn't look like a valid ORCID.</p>
              )}
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className={labelCls}>Language *</span>
              <select
                className={inputCls}
                value={form.language}
                onChange={(e) => patch({ language: e.target.value })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelCls}>Paper type *</span>
              <select
                className={inputCls}
                value={form.paperType}
                onChange={(e) => patch({ paperType: e.target.value as PaperDraftInput["paperType"] })}
              >
                {PAPER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelCls}>Research topic (optional)</span>
              <input
                className={inputCls}
                value={form.topic ?? ""}
                onChange={(e) => patch({ topic: e.target.value || null })}
                placeholder="e.g. 19th-century poetry"
              />
            </label>
          </div>

          <label className="space-y-1 block">
            <span className={labelCls}>Abstract *</span>
            <textarea
              className={inputCls}
              rows={4}
              value={form.abstract}
              onChange={(e) => patch({ abstract: e.target.value })}
            />
          </label>

          <div className="space-y-1">
            <span className={labelCls}>Keywords</span>
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                placeholder="Keyword, then Add"
              />
              <button
                type="button"
                onClick={() => {
                  if (!keywordDraft.trim()) return;
                  patch({ keywords: [...form.keywords, keywordDraft.trim()] });
                  setKeywordDraft("");
                }}
                className="shrink-0 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary"
              >
                Add
              </button>
            </div>
            {form.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.keywords.map((k, i) => (
                  <span
                    key={`${k}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
                  >
                    {k}
                    <button
                      type="button"
                      onClick={() => patch({ keywords: form.keywords.filter((_, j) => j !== i) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-dashed border-border bg-background p-4">
            <p className={labelCls}>Main text or PDF *</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Provide either the full text below, or upload a PDF (max{" "}
              {(MAX_PAPER_PDF_RAW_BYTES / 1024 / 1024).toFixed(0)}MB) — at least one is required.
            </p>
            <textarea
              className={`${inputCls} mt-2`}
              rows={8}
              value={form.bodyText ?? ""}
              onChange={(e) => patch({ bodyText: e.target.value || null })}
              placeholder="Paste the full paper text here…"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                <Upload className="h-3.5 w-3.5" />
                {pdfFile ? pdfFile.name : existingPdfName ? "Replace PDF" : "Upload PDF"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {(existingPdfName || pdfFile) && (
                <button
                  type="button"
                  onClick={clearPdf}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove PDF
                </button>
              )}
              {existingPdfName && !pdfFile && (
                <span className="text-xs text-muted-foreground">Current: {existingPdfName}</span>
              )}
            </div>
          </div>

          <label className="space-y-1 block">
            <span className={labelCls}>Citation style (stated, not enforced)</span>
            <input
              className={inputCls}
              value={form.citationStyle ?? ""}
              onChange={(e) => patch({ citationStyle: e.target.value || null })}
              placeholder="e.g. MLA 9th edition, Chicago, APA 7"
            />
          </label>

          <label className="space-y-1 block">
            <span className={labelCls}>References / works cited *</span>
            <textarea
              className={inputCls}
              rows={5}
              value={form.referencesText}
              onChange={(e) => patch({ referencesText: e.target.value })}
              placeholder="Full bibliography / works cited list"
            />
          </label>

          <label className="space-y-1 block">
            <span className={labelCls}>Rights declaration *</span>
            <textarea
              className={inputCls}
              rows={2}
              value={form.rightsDeclaration}
              onChange={(e) => patch({ rightsDeclaration: e.target.value })}
              placeholder="I confirm I hold the rights to submit this paper, and to any third-party images, quotations, or attachments it includes."
            />
          </label>
          <label className="space-y-1 block">
            <span className={labelCls}>Third-party rights note (optional)</span>
            <textarea
              className={inputCls}
              rows={2}
              value={form.thirdPartyRightsNote ?? ""}
              onChange={(e) => patch({ thirdPartyRightsNote: e.target.value || null })}
              placeholder="Anything specific about permission for quoted or reproduced material"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelCls}>Funding (optional)</span>
              <input
                className={inputCls}
                value={form.fundingNote ?? ""}
                onChange={(e) => patch({ fundingNote: e.target.value || null })}
              />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>Conflicts of interest (optional)</span>
              <input
                className={inputCls}
                value={form.conflictsOfInterest ?? ""}
                onChange={(e) => patch({ conflictsOfInterest: e.target.value || null })}
              />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>Acknowledgments (optional)</span>
              <input
                className={inputCls}
                value={form.acknowledgments ?? ""}
                onChange={(e) => patch({ acknowledgments: e.target.value || null })}
              />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>AI assistance disclosure (optional)</span>
              <input
                className={inputCls}
                value={form.aiAssistanceDisclosure ?? ""}
                onChange={(e) => patch({ aiAssistanceDisclosure: e.target.value || null })}
                placeholder="e.g. none, or how AI tools were used"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            <button
              disabled={busy}
              onClick={() => save("draft")}
              className="rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              Save draft
            </button>
            <button
              disabled={busy}
              onClick={() => save("submitted")}
              className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
