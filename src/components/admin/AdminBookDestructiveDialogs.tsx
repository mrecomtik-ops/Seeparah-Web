import { Loader2 } from "lucide-react";
import type { BookDeletionImpact } from "@/lib/admin/catalog.server";

/** Preflight for a protected, irreversible action. The server independently
 * repeats this check and verifies the title/status at the final SQL DELETE. */
export function canConfirmPermanentDeletion(
  title: string,
  impact: BookDeletionImpact | null,
  confirmation: string,
): boolean {
  return Boolean(
    impact &&
    (impact.status === "archived" || impact.status === "unpublished") &&
    impact.relatedSupportTicketCount === 0 &&
    confirmation === title,
  );
}

export function AdminBookDestructiveDialogs({
  title, deleteOpen, permDeleteOpen, busy, permDeleteImpact,
  permDeleteConfirmText, onChangeConfirmText,
  onCloseArchive, onClosePermanent, onConfirmArchive, onConfirmPermanent,
}: {
  title: string;
  deleteOpen: boolean;
  permDeleteOpen: boolean;
  busy: boolean;
  permDeleteImpact: BookDeletionImpact | null;
  permDeleteConfirmText: string;
  onChangeConfirmText: (value: string) => void;
  onCloseArchive: () => void;
  onClosePermanent: () => void;
  onConfirmArchive: () => Promise<void>;
  onConfirmPermanent: () => Promise<void>;
}) {
  return (
    <>
      {deleteOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 id="archive-dialog-title" className="font-display text-lg font-semibold text-foreground">
              Delete “{title}”?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This archives the book — it stops being published and disappears from the catalog, but
              nothing is erased. Chunks, translations, editions, reader highlights and progress,
              requests, and audit history all stay intact, and this can be reversed from here
              anytime. For irreversible deletion, use "Delete permanently" instead (owner/
              administrator only).
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => onCloseArchive()}
                disabled={busy}
                className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void onConfirmArchive()}
                disabled={busy}
                className="min-h-11 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {busy ? "Archiving…" : "Delete (archive)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {permDeleteOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="permanent-delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-destructive/40 bg-card p-6 card-shadow-lg">
            <h2 id="permanent-delete-dialog-title" className="font-display text-lg font-semibold text-destructive">
              Permanently delete “{title}”?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This cannot be undone. Everything below is deleted along with the book:
            </p>
            {!permDeleteImpact ? (
              <div className="mt-3 flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border bg-background p-3 text-xs">
                <li>Pages (chunks): {permDeleteImpact.chunkCount}</li>
                <li>Translated editions: {permDeleteImpact.editionCount}</li>
                <li>Translation jobs: {permDeleteImpact.translationJobCount}</li>
                <li>Reading progress rows: {permDeleteImpact.progressCount}</li>
                <li>Reader highlights: {permDeleteImpact.highlightCount}</li>
                <li>Shelf entries: {permDeleteImpact.shelfCount}</li>
                <li>Subscriptions: {permDeleteImpact.subscriptionCount}</li>
                <li>Translation requests: {permDeleteImpact.translationRequestCount}</li>
                <li>Issue reports: {permDeleteImpact.translationReportCount}</li>
                <li>
                  Support tickets referencing it: {permDeleteImpact.relatedSupportTicketCount}{" "}
                  {permDeleteImpact.relatedSupportTicketCount > 0 ? "(must be reassociated first — deletion blocked)" : ""}
                </li>
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Moderation and audit history for this book cannot be erased and is not affected by
              this action.
            </p>
            {permDeleteImpact &&
              permDeleteImpact.status !== "archived" &&
              permDeleteImpact.status !== "unpublished" && (
                <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  This book is still {permDeleteImpact.status} — take it down (Delete/archive)
                  first, then permanently delete it as a separate step.
                </p>
              )}
            {permDeleteImpact && permDeleteImpact.relatedSupportTicketCount > 0 && (
              <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Permanent deletion is blocked while support tickets still reference this book. Keep it archived, or have a reviewer explicitly reassociate those tickets first. No tickets will be detached automatically.
              </p>
            )}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-muted-foreground">
                Type the exact title to confirm: <strong>{title}</strong>
              </span>
              <input
                value={permDeleteConfirmText}
                onChange={(e) => onChangeConfirmText(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => onClosePermanent()}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                disabled={
                  busy || !canConfirmPermanentDeletion(title, permDeleteImpact, permDeleteConfirmText)
                }
                onClick={() => void onConfirmPermanent()}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
