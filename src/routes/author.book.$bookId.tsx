import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookCheck,
  Languages,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { LANGUAGES, GENRES } from "@/lib/data";
import { getBook, setBookStatus, editBookMetadata, type BookStatus } from "@/lib/library";
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
  const navigate = Route.useNavigate();
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
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: "",
    author: "",
    description: "",
    genre: "",
    coverUrl: "",
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  function openEdit() {
    if (!book) return;
    setEditDraft({
      title: book.title,
      author: book.author,
      description: book.description,
      genre: book.genre ?? "",
      coverUrl: book.cover_url ?? "",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!book) return;
    if (!editDraft.title.trim() || !editDraft.description.trim()) {
      toast.error("Title and description can't be empty.");
      return;
    }
    const wasPublished = !["draft", "in_review", "unpublished"].includes(book.status);
    setEditBusy(true);
    try {
      await editBookMetadata(userId, bookId, {
        title: editDraft.title.trim(),
        author: editDraft.author.trim(),
        description: editDraft.description.trim(),
        genre: editDraft.genre.trim() || null,
        coverUrl: editDraft.coverUrl.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ["book", bookId] });
      queryClient.invalidateQueries({ queryKey: ["my-books", userId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success(
        wasPublished
          ? "Saved — this book is back in review before the changes go live."
          : "Saved.",
      );
      setEditOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save changes");
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true);
    try {
      await setBookStatus(userId, bookId, "unpublished");
      queryClient.invalidateQueries({ queryKey: ["book", bookId] });
      queryClient.invalidateQueries({ queryKey: ["my-books", userId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success("Removed from the library. You can republish it anytime from here.");
      setDeleteOpen(false);
      navigate({ to: "/author" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove this book");
    } finally {
      setDeleteBusy(false);
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
            <button
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            {book.status !== "unpublished" && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-card px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
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

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">Edit book details</h2>
            {book.status !== "draft" && book.status !== "in_review" && book.status !== "unpublished" && (
              <p className="mt-1 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                This book is {STATUS_LABEL[book.status]?.toLowerCase() ?? book.status} — saving will
                send it back into review before the changes are visible to readers.
              </p>
            )}
            <div className="mt-3 space-y-2.5">
              <input
                value={editDraft.title}
                onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Title"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={editDraft.author}
                onChange={(e) => setEditDraft((d) => ({ ...d, author: e.target.value }))}
                placeholder="Author byline"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <textarea
                value={editDraft.description}
                onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Description"
                rows={4}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <select
                value={editDraft.genre}
                onChange={(e) => setEditDraft((d) => ({ ...d, genre: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">No genre</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <input
                value={editDraft.coverUrl}
                onChange={(e) => setEditDraft((d) => ({ ...d, coverUrl: e.target.value }))}
                placeholder="Cover image URL (optional)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Rights, access, and pricing fields aren't editable here — those stay admin-controlled.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditOpen(false)}
                disabled={editBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editBusy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {editBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Delete “{book.title}”?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This removes it from the library and stops readers from opening it — it will no
              longer be published. Nothing is permanently erased: your manuscript, translations,
              readers' highlights and progress, and your submission history all stay intact. You
              can republish it from here anytime.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Permanent deletion, if you ever want that, is an admin-only action — contact support.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleteBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteBusy}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {deleteBusy ? "Removing…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
