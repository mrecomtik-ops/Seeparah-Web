import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookCheck,
  Languages,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { LANGUAGES } from "@/lib/data";
import { getBook, setBookStatus, type BookStatus } from "@/lib/library";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import {
  cancelTranslationJob,
  getBookTranslationStatus,
  processTranslationBatch,
  requestTranslationJob,
  reviewAndPublishTranslation,
  retryFailedTranslationSections,
  saveTranslationGuide,
} from "@/lib/translation.functions";

export const Route = createFileRoute("/author/book/$bookId")({
  head: () => ({ meta: [{ title: "Manage book — Seeparah" }] }),
  component: ManageBookPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft (private)",
  in_review: "Submitted — awaiting admin review",
  changes_requested: "Changes requested by admin",
  approved: "Approved — awaiting publish",
  published: "Published",
  rejected: "Rejected",
  unpublished: "Unpublished",
  archived: "Archived",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  processing: "Translating…",
  failed: "Failed — needs attention",
  awaiting_review: "Awaiting your review",
  published: "Published",
  canceled: "Canceled",
};

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error("Sign in to manage translations");
  return t;
}

function ManageBookPage() {
  const { bookId } = Route.useParams();
  const { userId, isDemo } = useAuth();
  const queryClient = useQueryClient();
  const [guideOpen, setGuideOpen] = useState(false);
  const [busyLang, setBusyLang] = useState<string | null>(null);
  const [guide, setGuide] = useState({
    voiceAndRegister: "",
    characterNotes: "",
    settingContext: "",
    targetConventions: "",
    toneInstructions: "",
  });

  const bookQuery = useQuery({ queryKey: ["book", bookId], queryFn: () => getBook(bookId) });
  const jobsQuery = useQuery({
    queryKey: ["translation-jobs", bookId],
    queryFn: async () => getBookTranslationStatus({ data: { bookId, accessToken: await token() } }),
    enabled: !isDemo,
  });

  const book = bookQuery.data;
  const jobs = jobsQuery.data ?? [];
  const jobByLanguage = new Map(jobs.map((j) => [j.language, j]));

  async function changeStatus(status: BookStatus) {
    try {
      await setBookStatus(userId, bookId, status);
      queryClient.invalidateQueries({ queryKey: ["book", bookId] });
      queryClient.invalidateQueries({ queryKey: ["my-books", userId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success(`Status set to ${STATUS_LABEL[status] ?? status}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update status");
    }
  }

  async function startTranslation(language: string) {
    if (isDemo) {
      toast.error("Background translation jobs need a real account — sign in to use this.");
      return;
    }
    setBusyLang(language);
    try {
      const accessToken = await token();
      await requestTranslationJob({ data: { bookId, language, accessToken } });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs", bookId] });
      toast.success(`Translation into ${language} queued`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start translation");
    } finally {
      setBusyLang(null);
    }
  }

  async function processNext(jobId: string, language: string) {
    setBusyLang(language);
    try {
      const accessToken = await token();
      const result = await processTranslationBatch({ data: { jobId, accessToken } });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs", bookId] });
      toast.success(
        `Processed ${result.processed} section(s) — ${result.done} done, ${result.failed} failed`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't process the batch");
    } finally {
      setBusyLang(null);
    }
  }

  async function retry(jobId: string, language: string) {
    setBusyLang(language);
    try {
      const accessToken = await token();
      await retryFailedTranslationSections({ data: { jobId, accessToken } });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs", bookId] });
      toast.success("Failed sections queued for retry");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't retry");
    } finally {
      setBusyLang(null);
    }
  }

  async function cancel(jobId: string, language: string) {
    if (
      !window.confirm(
        `Cancel the ${language} translation job? Sections already translated are kept but won't be published.`,
      )
    )
      return;
    setBusyLang(language);
    try {
      const accessToken = await token();
      await cancelTranslationJob({ data: { jobId, accessToken } });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs", bookId] });
      toast.success(`${language} translation job canceled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't cancel this job");
    } finally {
      setBusyLang(null);
    }
  }

  async function reviewAndPublish(jobId: string, language: string) {
    setBusyLang(language);
    try {
      const accessToken = await token();
      await reviewAndPublishTranslation({ data: { jobId, accessToken } });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs", bookId] });
      queryClient.invalidateQueries({ queryKey: ["book", bookId] });
      toast.success(`${language} edition published — you reviewed and approved it.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't publish this edition");
    } finally {
      setBusyLang(null);
    }
  }

  async function handleSaveGuide() {
    try {
      const accessToken = await token();
      await saveTranslationGuide({
        data: {
          bookId,
          accessToken,
          voiceAndRegister: guide.voiceAndRegister || undefined,
          characterNotes: guide.characterNotes || undefined,
          settingContext: guide.settingContext || undefined,
          targetConventions: guide.targetConventions || undefined,
          toneInstructions: guide.toneInstructions || undefined,
        },
      });
      toast.success("Translation guide saved");
      setGuideOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the guide");
    }
  }

  if (bookQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!book) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="font-display text-2xl font-semibold text-foreground">
          We couldn't find that book
        </p>
        <Link to="/author" className="text-sm font-semibold text-primary hover:underline">
          Back to Author Studio
        </Link>
      </div>
    );
  }
  if (book.author_id !== userId && !(isDemo && book.author_id === null)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="font-display text-2xl font-semibold text-foreground">
          You can only manage your own books
        </p>
        <Link to="/author" className="text-sm font-semibold text-primary hover:underline">
          Back to Author Studio
        </Link>
      </div>
    );
  }

  const targetLanguages = LANGUAGES.filter((l) => l !== book.source_language);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <Link
          to="/author"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Author Studio
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">{book.title}</h1>
            <p className="text-sm text-muted-foreground">
              {STATUS_LABEL[book.status] ?? book.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {book.status === "published" && (
              <button
                onClick={() => changeStatus("unpublished")}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                Unpublish
              </button>
            )}
            {(book.status === "unpublished" ||
              book.status === "changes_requested" ||
              book.status === "rejected") && (
              <button
                onClick={() => changeStatus("in_review")}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {book.status === "unpublished" ? "Request republish" : "Resubmit for review"}
              </button>
            )}
            {book.status === "draft" && (
              <button
                onClick={() => changeStatus("in_review")}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Submit for review
              </button>
            )}
          </div>
        </div>
        {(book.status === "in_review" || book.status === "approved") && (
          <p className="mt-2 rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground flex items-center gap-1.5">
            <BookCheck className="h-3.5 w-3.5" /> An admin reviews rights and edition quality before
            this goes live — publishing is no longer a self-review action.
          </p>
        )}
        {book.status === "changes_requested" && book.review_notes && (
          <p className="mt-2 rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
            Admin feedback: {book.review_notes}
          </p>
        )}
        {book.status === "rejected" && book.rejection_reason && (
          <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Rejected: {book.rejection_reason}
          </p>
        )}

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
              <Languages className="h-4.5 w-4.5 text-primary" /> Translations
            </h2>
            <button
              onClick={() => setGuideOpen((v) => !v)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {guideOpen ? "Hide" : "Edit"} translation guide
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Original language: {book.source_language}. Translation happens in the background —
            readers never trigger it, and an edition only appears once it's fully translated and
            you've reviewed it.
          </p>

          {guideOpen && (
            <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4">
              <textarea
                placeholder="Narrative voice and register…"
                value={guide.voiceAndRegister}
                onChange={(e) => setGuide((g) => ({ ...g, voiceAndRegister: e.target.value }))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <textarea
                placeholder="Characters and relationships…"
                value={guide.characterNotes}
                onChange={(e) => setGuide((g) => ({ ...g, characterNotes: e.target.value }))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <textarea
                placeholder="Setting and cultural context…"
                value={guide.settingContext}
                onChange={(e) => setGuide((g) => ({ ...g, settingContext: e.target.value }))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <textarea
                placeholder="Target language/script conventions…"
                value={guide.targetConventions}
                onChange={(e) => setGuide((g) => ({ ...g, targetConventions: e.target.value }))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <textarea
                placeholder="Tone: humor, sarcasm, ambiguity to preserve…"
                value={guide.toneInstructions}
                onChange={(e) => setGuide((g) => ({ ...g, toneInstructions: e.target.value }))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleSaveGuide}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Save guide
              </button>
            </div>
          )}

          {isDemo ? (
            <p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
              Sign in to queue background translations — demo mode has no backend to run the worker
              against.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {targetLanguages.map((language) => {
                const job = jobByLanguage.get(language);
                const busy = busyLang === language;
                return (
                  <li
                    key={language}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{language}</p>
                      {job ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {JOB_STATUS_LABEL[job.status] ?? job.status} · {job.completed_sections}/
                            {job.total_sections} sections
                            {job.failed_sections > 0 ? ` · ${job.failed_sections} failed` : ""}
                            {job.human_reviewed ? " · human reviewed" : ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground/80">
                            {job.provider} · {job.model}
                            {job.total_prompt_tokens + job.total_output_tokens > 0
                              ? ` · ${(job.total_prompt_tokens + job.total_output_tokens).toLocaleString()} tokens used`
                              : ""}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not started</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!job && (
                        <button
                          disabled={busy}
                          onClick={() => startTranslation(language)}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          Start translation
                        </button>
                      )}
                      {job && ["pending", "processing", "failed"].includes(job.status) && (
                        <button
                          disabled={busy}
                          onClick={() => processNext(job.id, language)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                        >
                          <RefreshCw className="h-3 w-3" /> Process next batch
                        </button>
                      )}
                      {job && job.status === "failed" && (
                        <button
                          disabled={busy}
                          onClick={() => retry(job.id, language)}
                          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                        >
                          Retry failed sections
                        </button>
                      )}
                      {job &&
                        ["pending", "processing", "failed", "awaiting_review"].includes(
                          job.status,
                        ) && (
                          <button
                            disabled={busy}
                            onClick={() => cancel(job.id, language)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary disabled:opacity-60"
                          >
                            <XCircle className="h-3 w-3" /> Cancel
                          </button>
                        )}
                      {job && job.status === "awaiting_review" && (
                        <button
                          disabled={busy}
                          onClick={() => reviewAndPublish(job.id, language)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          <ShieldCheck className="h-3 w-3" /> Review & publish
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-[11px] text-muted-foreground">
            "Process next batch" runs a few pages at a time — for a full book without watching the
            page, an operator needs to schedule this on a timer (see the launch report for the exact
            setup this requires).
          </p>
        </section>
      </main>
    </div>
  );
}
