import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Heart, Plus } from "lucide-react";
import { toast } from "sonner";
import { listShelves, toggleShelf, type ShelfKind } from "@/lib/shelves";
import { useAuth } from "@/lib/use-auth";

interface ShelfAction {
  shelf: ShelfKind;
  icon: typeof Heart;
  label: string;
  /** Imperative label for the button itself, describing what tapping it
   * will do next — shown before the action happens. */
  actionWhenActive: string;
  actionWhenInactive: string;
  /** Past-tense confirmation shown in the toast after the action happens. */
  confirmedOn: string;
  confirmedOff: string;
}

const ACTIONS: ShelfAction[] = [
  {
    shelf: "favorite",
    label: "Favorite",
    icon: Heart,
    actionWhenActive: "Remove from favorites",
    actionWhenInactive: "Add to favorites",
    confirmedOn: "Added to favorites",
    confirmedOff: "Removed from favorites",
  },
  {
    shelf: "saved",
    label: "Save",
    icon: Bookmark,
    actionWhenActive: "Remove saved book",
    actionWhenInactive: "Save book",
    confirmedOn: "Saved to your library",
    confirmedOff: "Removed from saved",
  },
  {
    shelf: "want_to_read",
    label: "Want to read",
    icon: Plus,
    actionWhenActive: "Remove from want to read",
    actionWhenInactive: "Add to want to read",
    confirmedOn: "Added to want to read",
    confirmedOff: "Removed from want to read",
  },
];

export function useShelves() {
  const { userId, loading } = useAuth();
  return useQuery({
    queryKey: ["shelves", userId],
    // While auth is still resolving, userId is the DEMO_USER_ID fallback
    // — not yet known to be right. Waiting for loading to clear avoids
    // firing a request (and caching a result) against the wrong,
    // possibly-temporary identity.
    enabled: !loading,
    queryFn: () => listShelves(userId),
  });
}

/** One primary Save action plus a disclosure for the two optional shelf flags.
 * Legacy overlapping shelf memberships are shown accurately; this component
 * never deletes user data or silently converts shelf states.
 */
export function ShelfButtons({
  bookId,
  showLabels = false,
}: {
  bookId: string;
  showLabels?: boolean;
}) {
  const { userId, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const shelvesQuery = useShelves();
  const rows = shelvesQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: ({ shelf, on }: { shelf: ShelfKind; on: boolean }) =>
      toggleShelf(userId, bookId, shelf, on),
    onSuccess: async (_result, { shelf, on }) => {
      await queryClient.invalidateQueries({ queryKey: ["shelves", userId] });
      const action = ACTIONS.find((item) => item.shelf === shelf);
      toast.success(on ? action?.confirmedOn ?? "Shelf updated" : action?.confirmedOff ?? "Shelf updated");
    },
    onError: (error) => toast.error(
      error instanceof Error ? error.message : "Could not update your shelves. Please retry.",
    ),
  });
  const busy = authLoading || shelvesQuery.isPending || mutation.isPending;
  const saved = rows.some((row) => row.book_id === bookId && row.shelf === "saved");
  const saveAction = ACTIONS.find((action) => action.shelf === "saved")!;

  function toggle(shelf: ShelfKind) {
    const active = rows.some((row) => row.book_id === bookId && row.shelf === shelf);
    mutation.mutate({ shelf, on: !active });
  }

  return (
    <div className={showLabels ? "flex flex-wrap items-center gap-2" : "flex items-center gap-2"}
      role="group" aria-label="Your reading shelves" aria-busy={busy}>
      <button
        type="button"
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? saveAction.actionWhenActive : saveAction.actionWhenInactive}
        title={saved ? saveAction.actionWhenActive : saveAction.actionWhenInactive}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggle("saved");
        }}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
          saved ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card/95 text-foreground hover:bg-secondary"
        }`}
      >
        <Bookmark className={`h-4 w-4 shrink-0 ${saved ? "fill-current" : ""}`} aria-hidden="true" />
        {showLabels && <span>{saved ? "Saved" : "Save"}</span>}
      </button>
      <details className="group relative" onClick={(event) => event.stopPropagation()}>
        <summary
          aria-label="More reading shelf options"
          className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-card/95 px-3 text-sm font-semibold text-foreground hover:bg-secondary"
        >
          {showLabels ? "More shelf options" : <Plus className="h-4 w-4" aria-hidden="true" />}
        </summary>
        <div className="absolute end-0 z-40 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-card p-2 shadow-xl">
          <p className="px-2 pb-2 text-xs font-semibold text-muted-foreground">Optional reading lists</p>
          {ACTIONS.filter((item) => item.shelf !== "saved").map((action) => {
            const active = rows.some((row) => row.book_id === bookId && row.shelf === action.shelf);
            const Icon = action.icon;
            return (
              <button key={action.shelf} type="button"
                disabled={busy}
                aria-pressed={active}
                aria-label={active ? action.actionWhenActive : action.actionWhenInactive}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggle(action.shelf);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm text-foreground hover:bg-secondary disabled:opacity-50"
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "fill-current text-primary" : ""}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">{action.label}</span>
                <span className="text-xs font-semibold text-muted-foreground">{active ? "Added" : "Add"}</span>
              </button>
            );
          })}
          <p className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">
            You can keep a book in multiple lists. Your existing choices are preserved.
          </p>
        </div>
      </details>
      {shelvesQuery.isError && <span role="alert" className="text-xs text-destructive">
        Shelf status unavailable
      </span>}
    </div>
  );
}
