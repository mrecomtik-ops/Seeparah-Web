import type { Book } from "@/lib/data";

/** The stage/publish/rollback workflow still lives in the guarded admin route.
 * The editor is deliberately presentational, never writes sacred source text.
 */
export function AdminBookSourceEditPanel({
  totalChunks, allLanguages, editorLanguage, onEditorLanguageChange,
  editorChunkIndex, onEditorChunkIndexChange, editorLoading, editorContent,
  editorPending, editorDraft, onEditorDraftChange, busy, onLoadChunk,
  onStageEdit, onPublishEdit, onDiscardEdit,
}: {
  totalChunks: Book["total_chunks"];
  allLanguages: string[];
  editorLanguage: string;
  onEditorLanguageChange: (value: string) => void;
  editorChunkIndex: number;
  onEditorChunkIndexChange: (value: number) => void;
  editorLoading: boolean;
  editorContent: string | null;
  editorPending: { at: string | null } | null;
  editorDraft: string;
  onEditorDraftChange: (value: string) => void;
  busy: boolean;
  onLoadChunk: () => Promise<void>;
  onStageEdit: () => Promise<void>;
  onPublishEdit: () => Promise<void>;
  onDiscardEdit: () => Promise<void>;
}) {
  return (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">
            Edit page content
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Works on any language, original or translated. An edit is staged, not published
            immediately — readers keep seeing the current text until you explicitly publish it.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Language</span>
              <select
                value={editorLanguage}
                onChange={(e) => onEditorLanguageChange(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Choose…</option>
                {allLanguages.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Page (0–{totalChunks - 1})
              </span>
              <input
                type="number"
                min={0}
                max={totalChunks - 1}
                value={editorChunkIndex}
                onChange={(e) => onEditorChunkIndexChange(Number(e.target.value))}
                className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <button
              disabled={!editorLanguage || editorLoading}
              onClick={() => void onLoadChunk()}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              {editorLoading ? "Loading…" : "Load"}
            </button>
          </div>

          {editorContent !== null && (
            <div className="mt-4">
              {editorPending && (
                <p className="mb-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold-foreground">
                  Pending edit staged
                  {editorPending.at ? ` ${new Date(editorPending.at).toLocaleString()}` : ""} — not
                  yet visible to readers.
                </p>
              )}
              <textarea
                value={editorDraft}
                onChange={(e) => onEditorDraftChange(e.target.value)}
                rows={10}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  disabled={busy || editorDraft === editorContent}
                  onClick={() => void onStageEdit()}
                  className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                >
                  Stage edit
                </button>
                {editorPending && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => void onPublishEdit()}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      Publish staged edit
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void onDiscardEdit()}
                      className="min-h-10 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
                    >
                      Discard staged edit
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

  );
}
