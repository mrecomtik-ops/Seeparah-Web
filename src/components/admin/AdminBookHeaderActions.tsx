import { Eye, Pencil, Trash2 } from "lucide-react";
import { roleHasCapability, type AdminRole } from "@/lib/admin/permissions";

export function AdminBookHeaderActions({
  status, role, onPreview, onEdit, onArchive, onPermanentDelete,
}: {
  status: string;
  role: AdminRole | null;
  onPreview: () => Promise<void>;
  onEdit: () => void;
  onArchive: () => void;
  onPermanentDelete: () => Promise<void>;
}) {
  const canPublish = roleHasCapability(role, "catalog.publish");
  const canReview = roleHasCapability(role, "catalog.review");
  const canDeletePermanently = roleHasCapability(role, "catalog.delete_permanent");
  if (!canPublish) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canReview && (
        <button type="button" onClick={() => void onPreview()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">
          <Eye className="h-3.5 w-3.5" /> Preview book
        </button>
      )}
      <button type="button" onClick={onEdit}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary">
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
      {status !== "archived" && (
        <button type="button" onClick={onArchive}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" /> Archive
        </button>
      )}
      {/* Do not invite a permanent delete unless both authorization and
          the server's required pre-deletion lifecycle are satisfied. */}
      {canDeletePermanently && (status === "archived" || status === "unpublished") && (
        <button type="button" onClick={() => void onPermanentDelete()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground hover:opacity-90">
          <Trash2 className="h-3.5 w-3.5" /> Delete permanently
        </button>
      )}
    </div>
  );
}
