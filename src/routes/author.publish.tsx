import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpenCheck,
  Eye,
  Feather,
  FileUp,
  Loader2,
  LogIn,
  Sparkles,
} from "lucide-react";
import {
  FREE_LAUNCH_AUTHOR_TERMS,
  GENRES,
  LANGUAGES,
  SAMPLE_MANUSCRIPT_AUTHOR,
  SAMPLE_MANUSCRIPT_CHAPTERS,
  SAMPLE_MANUSCRIPT_SUMMARY,
  SAMPLE_MANUSCRIPT_TITLE,
  TRANSLATION_EXPLAINER_SHORT,
} from "@/lib/data";
import { publishBook, splitManuscript } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/author/publish")({
  head: () => ({
    meta: [
      { title: "Publish a manuscript — Seeparah" },
      {
        name: "description",
        content: "Publish your book on Seeparah: free during launch, reviewed by an administrator before it goes live.",
      },
      { property: "og:title", content: "Publish a manuscript — Seeparah" },
      {
        property: "og:description",
        content: "Publish your book, free during launch.",
      },
    ],
  }),
  component: PublishPage,
});

const ACCEPTED_UPLOAD_TYPES = ".txt,.md,text/plain";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function PublishPage() {
  const { userId, isDemo } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState<string>("English");
  const [summary, setSummary] = useState("");
  const [manuscript, setManuscript] = useState("");
  const [genre, setGenre] = useState<string>(GENRES[0]);
  const [coverUrl, setCoverUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  const chapters = manuscript.trim() ? splitManuscript(manuscript) : [];

  function loadSample() {
    setTitle(SAMPLE_MANUSCRIPT_TITLE);
    setAuthorName(SAMPLE_MANUSCRIPT_AUTHOR);
    setSummary(SAMPLE_MANUSCRIPT_SUMMARY);
    setManuscript(SAMPLE_MANUSCRIPT_CHAPTERS.join("\n\n"));
    setSourceLanguage("English");
    toast.success("Sample manuscript loaded — 10 chapters");
  }

  async function handleUpload(file: File) {
    const isTxtLike = /\.(txt|md)$/i.test(file.name) || file.type === "text/plain";
    if (!isTxtLike) {
      toast.error(
        "Only plain text (.txt) or Markdown (.md) manuscripts are supported right now. DOCX/EPUB import isn't available yet — export to .txt first.",
      );
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("That file is larger than 5MB — split it or trim it before uploading.");
      return;
    }
    const text = await file.text();
    if (!text.trim()) {
      toast.error("That file looks empty.");
      return;
    }
    setManuscript(text);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    toast.success(`Loaded ${file.name} — ${splitManuscript(text).length} section(s) detected`);
  }

  function validate(forSubmit: boolean): string | null {
    if (!title.trim() || !authorName.trim() || !manuscript.trim()) {
      return "Title, author name and manuscript are required.";
    }
    if (chapters.length === 0) {
      return "Couldn't detect any content to publish — check your manuscript text.";
    }
    if (forSubmit && !rightsConfirmed) {
      return "Confirm you hold the rights to this manuscript before submitting for review.";
    }
    if (forSubmit && isDemo) {
      return "Sign in before submitting for review — this reaches Seeparah's review queue and needs a real account. A local draft doesn't.";
    }
    return null;
  }

  async function submit(status: "draft" | "in_review") {
    const problem = validate(status === "in_review");
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(status === "draft" ? "draft" : "submit");
    try {
      const book = await publishBook(userId, {
        title: title.trim(),
        authorName: authorName.trim(),
        sourceLanguage,
        summary: summary.trim(),
        manuscript,
        isPaid: false,
        priceUsd: null,
        genre,
        coverUrl: coverUrl.trim() || null,
        status,
        rightsConfirmed,
      });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["my-books", userId] });
      if (status === "draft") {
        toast.success(
          isDemo
            ? `"${book.title}" saved on this device only — it has not reached Seeparah. Sign in to actually submit it.`
            : `"${book.title}" saved as a draft — only you can see it.`,
        );
      } else {
        toast.success(
          `"${book.title}" submitted — reference ${book.id.slice(0, 8)}. An administrator will review rights and quality; track its status in Author Studio.`,
        );
      }
      navigate({ to: "/author" });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Publishing hit a problem — your text is safe, try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";
  const labelCls = "mb-1.5 block text-sm font-semibold text-foreground";

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <p className="text-sm font-medium text-muted-foreground">Author studio</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-foreground">
          Publish your manuscript
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Save a private draft any time. Submitting for review sends your manuscript to
          Seeparah — an administrator reviews rights and edition quality and decides when
          it publishes; you can't publish it yourself. Readers never see partially-reviewed
          text: editions are prepared and reviewed ahead of time, never translated live.
        </p>

        <div className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6 card-shadow sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="pub-title">Title</label>
              <input
                id="pub-title"
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="The Lantern in the Rain"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="pub-author">Author name</label>
              <input
                id="pub-author"
                className={inputCls}
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Amina Rahman"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="pub-lang">Source language (original)</label>
              <select
                id="pub-lang"
                className={inputCls}
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="pub-genre">Category / topic</label>
              <select
                id="pub-genre"
                className={inputCls}
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
              >
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="pub-cover">Cover image URL (optional)</label>
            <input
              id="pub-cover"
              className={inputCls}
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://…"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Direct file upload isn't wired up yet — paste a link to an image you host
              elsewhere. Leave blank to use a plain title card instead.
            </p>
          </div>

          <div>
            <label className={labelCls} htmlFor="pub-summary">Summary</label>
            <textarea
              id="pub-summary"
              className={`${inputCls} min-h-20 resize-y`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Two or three sentences that make a reader fall in love…"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className={labelCls} htmlFor="pub-manuscript">Manuscript</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
                >
                  <FileUp className="h-3.5 w-3.5" /> Upload .txt / .md
                </button>
                <button
                  type="button"
                  onClick={loadSample}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Load sample book
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_UPLOAD_TYPES}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                  }}
                />
              </div>
            </div>
            <textarea
              id="pub-manuscript"
              className={`${inputCls} min-h-64 resize-y font-mono text-[13px] leading-relaxed`}
              value={manuscript}
              onChange={(e) => setManuscript(e.target.value)}
              placeholder="Paste your manuscript here. Start chapters with “Chapter 1 …” and Seeparah will paginate them for you."
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {chapters.length > 0
                  ? `${chapters.length} section${chapters.length === 1 ? "" : "s"} detected`
                  : "No content detected yet"}
              </span>
              {chapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              DOCX and EPUB import aren't supported yet — export your manuscript to plain
              text (.txt) or Markdown (.md) first. Uploaded text is never rendered as
              HTML, so it can't run scripts.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-secondary/50 p-4">
            <p className="text-sm font-semibold text-foreground">Publishing terms right now</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{FREE_LAUNCH_AUTHOR_TERMS}</p>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-4 text-sm text-foreground">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(e) => setRightsConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span>
              I confirm I hold the rights to this manuscript, and I grant Seeparah
              permission to translate and publish it under the terms above. Required to
              submit for review — not required to save a private draft.
            </span>
          </label>

          {isDemo && (
            <p className="flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs leading-relaxed text-foreground">
              <LogIn className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              You're not signed in. "Save draft" here only stores your text on this device —
              it never reaches Seeparah. To actually submit a manuscript for review, sign in
              first.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void submit("draft")}
              disabled={busy !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-4 text-base font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {busy === "draft" ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {isDemo ? "Save local draft" : "Save draft"}
            </button>
            {isDemo ? (
              <Link
                to="/auth"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                <LogIn className="h-5 w-5" /> Sign in to submit for review
              </Link>
            ) : (
              <button
                onClick={() => void submit("in_review")}
                disabled={busy !== null}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {busy === "submit" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Feather className="h-5 w-5" />
                )}
                Submit for review
              </button>
            )}
          </div>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <BookOpenCheck className="h-3.5 w-3.5" />
            {isDemo
              ? "Local drafts stay on this device only, until you sign in."
              : "Signed in — drafts and submissions are saved to your account."}
          </p>
        </div>
      </main>

      {showPreview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card p-6 card-shadow-lg sm:p-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-foreground">
                Preview — {chapters.length} section{chapters.length === 1 ? "" : "s"}
              </h2>
              <button
                onClick={() => setShowPreview(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-6">
              {chapters.slice(0, 3).map((c, i) => (
                <article key={i} className="rounded-2xl border border-border bg-background p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Page {i + 1}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap font-display text-sm leading-relaxed text-foreground">
                    {c.slice(0, 600)}
                    {c.length > 600 ? "…" : ""}
                  </p>
                </article>
              ))}
              {chapters.length > 3 && (
                <p className="text-center text-xs text-muted-foreground">
                  + {chapters.length - 3} more page{chapters.length - 3 === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
