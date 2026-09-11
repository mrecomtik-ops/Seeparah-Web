import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpenCheck,
  Crown,
  Feather,
  FileUp,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  LANGUAGES,
  SAMPLE_MANUSCRIPT_AUTHOR,
  SAMPLE_MANUSCRIPT_CHAPTERS,
  SAMPLE_MANUSCRIPT_SUMMARY,
  SAMPLE_MANUSCRIPT_TITLE,
} from "@/lib/data";
import { publishBook } from "@/lib/library";
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
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState("4.99");
  const [busy, setBusy] = useState(false);

  function loadSample() {
    setTitle(SAMPLE_MANUSCRIPT_TITLE);
    setAuthorName(SAMPLE_MANUSCRIPT_AUTHOR);
    setSummary(SAMPLE_MANUSCRIPT_SUMMARY);
    setManuscript(SAMPLE_MANUSCRIPT_CHAPTERS.join("\n\n"));
    setSourceLanguage("English");
    toast.success("Sample manuscript loaded — 10 chapters");
  }

  async function handleUpload(file: File) {
    const text = await file.text();
    setManuscript(text);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    toast.success(`Loaded ${file.name}`);
  }

  async function submit() {
    if (!title.trim() || !authorName.trim() || !manuscript.trim()) {
      toast.error("Title, author name and manuscript are required.");
      return;
    }
    setBusy(true);
    try {
      const book = await publishBook(userId, {
        title: title.trim(),
        authorName: authorName.trim(),
        sourceLanguage,
        summary: summary.trim(),
        manuscript,
        isPaid,
        priceUsd: isPaid ? Number.parseFloat(price) || 4.99 : null,
      });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["my-books", userId] });
      toast.success(
        `“${book.title}” is live with ${book.total_chunks} pages${
          isDemo ? " (saved on this device in demo mode)" : ""
        }!`,
      );
      navigate({
        to: "/read/$bookId",
        params: { bookId: book.id },
        search: { lang: book.source_language },
      });
    } catch (error) {
      console.error(error);
      toast.error("Publishing hit a problem — your text is safe, try again.");
    } finally {
      setBusy(false);
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
          Your book appears in the library immediately, split into gentle
          page-sized chunks. Readers translate it page by page — never a
          full-book download.
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

          <div>
            <label className={labelCls} htmlFor="pub-lang">Source language</label>
            <select
              id="pub-lang"
              className={inputCls}
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
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
                  <FileUp className="h-3.5 w-3.5" /> Upload .txt
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
                  accept=".txt,.md,text/plain"
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
          </div>

          <div className="rounded-xl border border-border bg-secondary/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-gold" />
                <p className="text-sm font-semibold text-foreground">
                  Premium book
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPaid}
                onClick={() => setIsPaid(!isPaid)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  isPaid ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-card transition-all ${
                    isPaid ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Free books are open to everyone. Premium books give readers the
              first page free, then a monthly subscription — 70% goes to you,
              30% keeps Seeparah running.
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

          <button
            onClick={submit}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Feather className="h-5 w-5" />
            )}
            {busy ? "Publishing…" : "Publish to the library"}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <BookOpenCheck className="h-3.5 w-3.5" />
            Works in demo mode too — your book is saved on this device if
            you're not signed in.
          </p>
        </div>
      </main>
    </div>
  );
}
