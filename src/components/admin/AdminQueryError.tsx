import { AlertTriangle } from "lucide-react";

/** A query that errors out should never look identical to "no results" —
 * silently rendering an empty table/list when a fetch actually failed
 * hides the problem from the one person who could do something about it.
 * Shared across admin data pages so a failed adminListCatalog,
 * searchAdminUsers, etc. always gets a real message and a retry, not a
 * blank screen or a permanent spinner. */
export function AdminQueryError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="max-w-sm text-sm text-foreground">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold hover:bg-secondary"
      >
        Retry
      </button>
    </div>
  );
}
