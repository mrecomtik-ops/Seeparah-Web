import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { LANGUAGES } from "@/lib/data";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import {
  adminUploadPlainTextBook,
  adminUploadEpubBook,
  adminParseCsvManifest,
  adminRunBatchImport,
  MAX_UPLOAD_RAW_BYTES,
} from "@/lib/admin/catalog.functions";

export const Route = createFileRoute("/admin/books/new")({
  component: AdminUploadBook,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function AdminUploadBook() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"single" | "batch">("single");

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("English");
  const [description, setDescription] = useState("");
  const [rightsBasis, setRightsBasis] = useState("");
  const [rightsEvidenceUrl, setRightsEvidenceUrl] = useState("");
  const [attribution, setAttribution] = useState("");
  const [translationPermission, setTranslationPermission] = useState(false);
  const [manuscriptText, setManuscriptText] = useState("");
  const [epubFile, setEpubFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<{ rowNumber: number; errors: string[] }[] | null>(
    null,
  );
  const [importResults, setImportResults] = useState<
    { rowNumber: number; ok: boolean; error?: string; created?: boolean }[] | null
  >(null);

  async function handleSingleSubmit() {
    if (!title.trim() || !author.trim() || !description.trim() || !rightsBasis.trim()) {
      toast.error("Title, author, description, and rights basis are required");
      return;
    }
    if (!manuscriptText.trim() && !epubFile) {
      toast.error("Paste manuscript text or choose an EPUB file");
      return;
    }
    if (epubFile && epubFile.size > MAX_UPLOAD_RAW_BYTES) {
      toast.error(
        `That EPUB is ${(epubFile.size / (1024 * 1024)).toFixed(1)}MB — the upload transport caps at ${Math.floor(MAX_UPLOAD_RAW_BYTES / (1024 * 1024))}MB per file (a Netlify Functions platform limit, not this app's own choice).`,
      );
      return;
    }
    setBusy(true);
    try {
      const accessToken = await getAccessToken();
      const shared = {
        accessToken,
        title: title.trim(),
        author: author.trim(),
        sourceLanguage,
        description: description.trim(),
        rightsBasis: rightsBasis.trim(),
        rightsEvidenceUrl: rightsEvidenceUrl.trim() || undefined,
        attribution: attribution.trim() || undefined,
        translationPermission,
      };
      const result = epubFile
        ? await adminUploadEpubBook({
            data: { ...shared, fileBase64: await fileToBase64(epubFile) },
          })
        : await adminUploadPlainTextBook({
            data: { ...shared, manuscriptText: manuscriptText.trim() },
          });
      if (!result.created) {
        toast.info(
          `Not created — ${result.reason ?? "already imported"}. Opening the existing book.`,
        );
      } else {
        toast.success(
          `Created as draft with ${result.chapterCount} chapter(s)` +
            (result.warnings.length
              ? ` — ${result.warnings.length} warning(s): ${result.warnings.join("; ")}`
              : ""),
        );
      }
      navigate({ to: "/admin/books/$bookId", params: { bookId: result.bookId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDryRun() {
    if (!csvText.trim()) return;
    setBusy(true);
    try {
      const { rows } = await adminParseCsvManifest({
        data: { accessToken: await getAccessToken(), csvText },
      });
      setCsvPreview(rows.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })));
      setImportResults(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't parse the CSV");
    } finally {
      setBusy(false);
    }
  }

  async function handleRunImport() {
    if (!csvText.trim()) return;
    setBusy(true);
    try {
      const results = await adminRunBatchImport({
        data: { accessToken: await getAccessToken(), csvText, dryRun: false },
      });
      setImportResults(results);
      const created = results.filter((r) => r.ok && r.created).length;
      const failed = results.filter((r) => !r.ok).length;
      toast.success(`Import finished: ${created} created, ${failed} failed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-foreground">Upload a book</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Creates a draft awaiting review — nothing here publishes automatically. UTF-8 text and EPUB
        are supported; PDF isn't yet (no verified extraction pipeline).
      </p>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setMode("single")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === "single" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          Single book
        </button>
        <button
          onClick={() => setMode("batch")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === "batch" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          CSV batch import
        </button>
      </div>

      {mode === "single" ? (
        <div className="mt-5 space-y-3">
          <input
            className={inputCls}
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <select
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
          <textarea
            className={inputCls}
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <input
            className={inputCls}
            placeholder="Rights basis (e.g. public domain, author-granted, licensed)"
            value={rightsBasis}
            onChange={(e) => setRightsBasis(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Rights evidence URL (optional)"
            value={rightsEvidenceUrl}
            onChange={(e) => setRightsEvidenceUrl(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Attribution (optional)"
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={translationPermission}
              onChange={(e) => setTranslationPermission(e.target.checked)}
            />
            Translation permission confirmed
          </label>

          <div className="rounded-xl border border-dashed border-border p-4">
            <p className="text-xs font-semibold text-foreground">Manuscript</p>
            <textarea
              className={`${inputCls} mt-2`}
              placeholder="Paste UTF-8 manuscript text…"
              value={manuscriptText}
              onChange={(e) => {
                setManuscriptText(e.target.value);
                if (e.target.value) setEpubFile(null);
              }}
              rows={5}
            />
            <p className="my-2 text-center text-xs text-muted-foreground">or</p>
            <input
              type="file"
              accept=".epub"
              onChange={(e) => {
                setEpubFile(e.target.files?.[0] ?? null);
                if (e.target.files?.[0]) setManuscriptText("");
              }}
            />
          </div>

          <button
            onClick={handleSingleSubmit}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create draft
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Columns (comma-separated, no quoted commas): title, author, source_language,
            description, rights_basis, manuscript_text, rights_evidence_url, attribution,
            translation_permission (true/false), genre, categories (pipe-separated), translator,
            cover_url, source_url, source_edition_id, permitted_territories (pipe-separated),
            import_key.
          </p>
          <textarea
            className={`${inputCls} font-mono text-xs`}
            placeholder="Paste CSV…"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={8}
          />
          <div className="flex gap-2">
            <button
              onClick={handleDryRun}
              disabled={busy}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
            >
              Dry run (validate only)
            </button>
            <button
              onClick={handleRunImport}
              disabled={busy || !csvPreview}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Run import
            </button>
          </div>

          {csvPreview && (
            <div className="rounded-xl border border-border bg-card p-3 text-xs">
              <p className="font-semibold text-foreground">Dry run: {csvPreview.length} row(s)</p>
              {csvPreview.filter((r) => r.errors.length > 0).length === 0 ? (
                <p className="mt-1 text-emerald-600">All rows valid.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-destructive">
                  {csvPreview
                    .filter((r) => r.errors.length > 0)
                    .map((r) => (
                      <li key={r.rowNumber}>
                        Row {r.rowNumber}: {r.errors.join("; ")}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {importResults && (
            <div className="rounded-xl border border-border bg-card p-3 text-xs">
              <p className="font-semibold text-foreground">Import results</p>
              <ul className="mt-1 space-y-1">
                {importResults.map((r) => (
                  <li key={r.rowNumber} className={r.ok ? "text-emerald-600" : "text-destructive"}>
                    Row {r.rowNumber}:{" "}
                    {r.ok ? (r.created ? "created" : "skipped (already imported)") : r.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
