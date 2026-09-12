import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpenCheck,
  Crown,
  Eye,
  Feather,
  FileUp,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  GENRES,
  LANGUAGES,
  SAMPLE_MANUSCRIPT_AUTHOR,
  SAMPLE_MANUSCRIPT_CHAPTERS,
  SAMPLE_MANUSCRIPT_SUMMARY,
  SAMPLE_MANUSCRIPT_TITLE,
} from "@/lib/data";
import { publishBook, splitManuscript } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/author/publish")({
  head: () => ({
    meta: [
      { title: "Publish a manuscript — Seeparah" },
      {
        name: "description",
        content:
          "Publish your book on Seeparah: free or premium, translated page by page into ten languages.",
      },
      { property: "og:title", content: "Publish a manuscript — Seeparah" },
      {
        property: "og:description",
        content: "Publish your book, free or premium, in ten languages.",
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
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState("4.99");
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
        isPaid,
        priceUsd: isPaid ? Number.parseFloat(price) || 4.99 : null,
        genre,
        coverUrl: coverUrl.trim() || null,
        status,
        rightsConfirmed,
      });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["my-books", userId] });
      if (status === "draft") {
        toast.success(`"${book.title}" saved as a draft — only you can see it.`);
      } else {
        toast.success(
          `"${book.title}" submitted for review${isDemo ? " (saved on this device in demo mode)" : ""}. You can publish it from Author Studio once you're ready.`,
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
          Save a private draft any time, or submit for review when it's ready. Nothing
          reaches the public library until you publish it — readers translate nothing
          on the fly; approved editions are prepared and reviewed ahead of time.
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-gold" />
                <p className="text-sm font-semibold text-foreground">Premium book</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPaid}
                onClick={() => setIsPaid(!isPaid)}
                className={`relative h-6 w-11 rounded-full transition-colors ${isPaid ? "bg-primary" : "bg-muted"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-card transition-all ${isPaid ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Free books are open to everyone. Premium books give readers the first page
              free, then a monthly subscription for this book — 70% goes to you, 30%
              keeps Seeparah running.
            </p>
            {isPaid && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  className="w-28 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  aria-label="Price per month in US dollars"
                />
                <span className="text-sm text-muted-foreground">per month</span>
              </div>
            )}
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

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void submit("draft")}
              disabled={busy !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-4 text-base font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {busy === "draft" ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Save draft
            </button>
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
          </div>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <BookOpenCheck className="h-3.5 w-3.5" />
            Works in demo mode too — your book is saved on this device if you're not
            signed in.
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
