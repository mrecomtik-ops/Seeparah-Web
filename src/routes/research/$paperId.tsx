import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Download, Flag, Loader2 } from "lucide-react";
import { getPublishedPaper, PAPER_TYPES } from "@/lib/research";
import { downloadPaperPdf, reportResearchPaperProblem } from "@/lib/research.functions";
import { RTL_LANGUAGES } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/research/$paperId")({
  head: () => ({ meta: [{ title: "Research paper — Seeparah" }] }),
  component: PaperDetailPage,
});

const PAPER_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PAPER_TYPES.map((t) => [t.value, t.label]),
);

function languageToBcp47(language: string): string {
  const map: Record<string, string> = {
    English: "en",
    Urdu: "ur",
    Hindi: "hi",
    Arabic: "ar",
    Pashto: "ps",
    French: "fr",
    German: "de",
    Russian: "ru",
    Chinese: "zh",
    Spanish: "es",
  };
  return map[language] ?? "en";
}

function PaperDetailPage() {
  const { paperId } = Route.useParams();
  const [downloading, setDownloading] = useState(false);
  const paperQuery = useQuery({
    queryKey: ["research-paper", paperId],
    queryFn: () => getPublishedPaper(paperId),
  });
  const paper = paperQuery.data;

  async function handleDownload() {
    setDownloading(true);
    try {
      const result = await downloadPaperPdf({ data: { paperId } });
      if (!result) {
        toast.error("This paper doesn't have a PDF available.");
        return;
      }
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't download the PDF");
    } finally {
      setDownloading(false);
    }
  }

  async function handleReportProblem() {
    if (!paper) return;
    const reason = window.prompt(
      `What's wrong with "${paper.title}"? A quick note helps us follow up.`,
    );
    if (!reason || !reason.trim()) return;
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        toast.error("Sign in to report a problem — it needs to be tied to your account.");
        return;
      }
      await reportResearchPaperProblem({
        data: { paperId: paper.paper_id, paperTitle: paper.title, reason: reason.trim(), accessToken },
      });
      toast.success("Thanks — reported to the editorial team.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send the report");
    }
  }

  if (paperQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <BookOpen className="h-10 w-10 text-muted-foreground/50" />
        <p className="font-display text-2xl font-semibold text-foreground">
          We couldn't find that paper
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may still be in review, or has been withdrawn.
        </p>
        <Link to="/research" className="text-sm font-semibold text-primary hover:underline">
          Back to Literature Research
        </Link>
      </div>
    );
  }

  const rtl = RTL_LANGUAGES.has(paper.language);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <Link
          to="/research"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Literature Research
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
            {PAPER_TYPE_LABEL[paper.paper_type] ?? paper.paper_type}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
            {paper.language}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
            Version {paper.version}
          </span>
        </div>

        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground">
          {paper.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {paper.author_name}
          {paper.coauthor_names.length > 0 ? ` · with ${paper.coauthor_names.join(", ")}` : ""}
          {paper.affiliation ? ` · ${paper.affiliation}` : ""}
        </p>
        {paper.orcid && (
          <p className="mt-0.5 text-xs text-muted-foreground">ORCID: {paper.orcid}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Published {new Date(paper.published_at).toLocaleDateString()}
        </p>

        <p className="mt-4 rounded-xl bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-secondary-foreground">
          This paper was reviewed by a Seeparah editor for rights and readiness before
          publication. <strong>Editorial approval is not peer review</strong> — this page does not
          claim a journal affiliation, DOI, or indexed status.
        </p>

        <section className="mt-6">
          <h2 className="font-display text-lg font-semibold text-foreground">Abstract</h2>
          <p className="mt-2 leading-relaxed text-foreground">{paper.abstract}</p>
        </section>

        {paper.keywords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {paper.keywords.map((k) => (
              <span
                key={k}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
              >
                {k}
              </span>
            ))}
          </div>
        )}

        {paper.pdf_filename && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:-translate-y-0.5 transition-transform disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {downloading ? "Preparing…" : "Download PDF"}
          </button>
        )}

        {paper.body_text && (
          <article
            dir={rtl ? "rtl" : "ltr"}
            lang={languageToBcp47(paper.language)}
            className="mt-6 whitespace-pre-wrap rounded-2xl border border-border bg-card p-6 leading-relaxed text-card-foreground card-shadow sm:p-8"
          >
            {paper.body_text}
          </article>
        )}

        <section className="mt-6">
          <h2 className="font-display text-lg font-semibold text-foreground">
            References / works cited
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {paper.references_text}
          </p>
        </section>

        {(paper.funding_note || paper.conflicts_of_interest || paper.acknowledgments || paper.ai_assistance_disclosure) && (
          <section className="mt-6 space-y-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            {paper.funding_note && (
              <p>
                <strong className="text-foreground">Funding:</strong> {paper.funding_note}
              </p>
            )}
            {paper.conflicts_of_interest && (
              <p>
                <strong className="text-foreground">Conflicts of interest:</strong>{" "}
                {paper.conflicts_of_interest}
              </p>
            )}
            {paper.acknowledgments && (
              <p>
                <strong className="text-foreground">Acknowledgments:</strong>{" "}
                {paper.acknowledgments}
              </p>
            )}
            {paper.ai_assistance_disclosure && (
              <p>
                <strong className="text-foreground">AI assistance:</strong>{" "}
                {paper.ai_assistance_disclosure}
              </p>
            )}
          </section>
        )}

        <div className="mt-8 flex justify-center border-t border-border pt-4">
          <button
            onClick={handleReportProblem}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Flag className="h-3.5 w-3.5" /> Report a problem with this paper
          </button>
        </div>
      </main>
    </div>
  );
}
