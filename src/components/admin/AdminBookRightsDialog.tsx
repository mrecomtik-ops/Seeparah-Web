import type { Dispatch, SetStateAction } from "react";

export type RightsEditorDraft = {
  rightsBasis: string;
  rightsEvidenceUrl: string;
  sourceUrl: string;
  attribution: string;
  permittedTerritories: string;
  translationPermission: boolean;
};

/** Rights editing UI only. Never approves rights or edits source content;
 * existing authenticated server actions remain in the parent route. */
export function AdminBookRightsDialog({
  rightsDraft, setRightsDraft, busy, onClose, onSave,
}: {
  rightsDraft: RightsEditorDraft;
  setRightsDraft: Dispatch<SetStateAction<RightsEditorDraft>>;
  busy: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  return (
        <div role="dialog" aria-modal="true" aria-labelledby="admin-rights-dialog-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 id="admin-rights-dialog-title" className="font-display text-lg font-semibold text-foreground">
              Edit rights & provenance
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Record only evidence you have actually verified for this exact edition. Saving does
              not approve the book; the rights review remains pending/unverified until you approve
              it separately.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Rights basis *</span>
                <textarea
                  value={rightsDraft.rightsBasis}
                  onChange={(e) => setRightsDraft((d) => ({ ...d, rightsBasis: e.target.value }))}
                  rows={4}
                  placeholder="Explain what establishes permission for this exact edition…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Rights evidence URL
                </span>
                <input
                  value={rightsDraft.rightsEvidenceUrl}
                  onChange={(e) =>
                    setRightsDraft((d) => ({ ...d, rightsEvidenceUrl: e.target.value }))
                  }
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  A valid http(s) evidence URL is required before approval.
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Source URL</span>
                <input
                  value={rightsDraft.sourceUrl}
                  onChange={(e) => setRightsDraft((d) => ({ ...d, sourceUrl: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Attribution</span>
                <textarea
                  value={rightsDraft.attribution}
                  onChange={(e) => setRightsDraft((d) => ({ ...d, attribution: e.target.value }))}
                  rows={2}
                  placeholder="Required credit or attribution, if any"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Permitted territories
                </span>
                <input
                  value={rightsDraft.permittedTerritories}
                  onChange={(e) =>
                    setRightsDraft((d) => ({ ...d, permittedTerritories: e.target.value }))
                  }
                  placeholder="Leave blank for unrestricted; otherwise comma-separated"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={rightsDraft.translationPermission}
                  onChange={(e) =>
                    setRightsDraft((d) => ({ ...d, translationPermission: e.target.checked }))
                  }
                />
                Translation permission is documented
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onClose()}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={busy || !rightsDraft.rightsBasis.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save rights information"}
              </button>
            </div>
          </div>
        </div>

  );
}
