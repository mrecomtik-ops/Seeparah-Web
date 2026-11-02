import { Loader2 } from "lucide-react";
import { AdminReadablePreview } from "@/components/admin/AdminBookPresentation";

/** Read-only manuscript preview; never stages or publishes source changes. */
export function AdminBookReviewPreview({
  title, sourceLanguage, totalChunks, previewChunkIndex,
  previewContent, previewLoading, onClose, onLoadChunk,
}: {
  title: string;
  sourceLanguage: string;
  totalChunks: number;
  previewChunkIndex: number;
  previewContent: string;
  previewLoading: boolean;
  onClose: () => void;
  onLoadChunk: (index: number) => Promise<void>;
}) {
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card card-shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Admin review preview · {sourceLanguage}
                </p>
                <h2 className="truncate font-display text-xl font-semibold text-foreground">
                  {title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Page {previewChunkIndex + 1} of {totalChunks}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onClose()}
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary"
              >
                Close preview
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-background px-5 py-6 sm:px-10">
              {previewLoading ? (
                <div className="flex min-h-64 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <article className="mx-auto max-w-3xl rounded-xl border border-border bg-card px-6 py-8 font-serif text-[18px] leading-[1.75] text-foreground sm:px-10">
                  <AdminReadablePreview content={previewContent} />
                </article>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <button
                type="button"
                disabled={previewLoading || previewChunkIndex <= 0}
                onClick={() => void onLoadChunk(previewChunkIndex - 1)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-40"
              >
                Previous page
              </button>
              <span className="text-xs text-muted-foreground">
                Review the actual stored text before approving quality.
              </span>
              <button
                type="button"
                disabled={previewLoading || previewChunkIndex >= totalChunks - 1}
                onClick={() => void onLoadChunk(previewChunkIndex + 1)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-40"
              >
                Next page
              </button>
            </div>
          </div>
        </div>

  );
}
