import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Heart, Plus } from "lucide-react";
import { toast } from "sonner";
import { listShelves, toggleShelf, type ShelfKind } from "@/lib/shelves";
import { useAuth } from "@/lib/use-auth";

interface ShelfAction {
  shelf: ShelfKind;
  icon: typeof Heart;
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
    icon: Heart,
    actionWhenActive: "Remove from favorites",
    actionWhenInactive: "Add to favorites",
    confirmedOn: "Added to favorites",
    confirmedOff: "Removed from favorites",
  },
  {
    shelf: "saved",
    icon: Bookmark,
    actionWhenActive: "Remove saved book",
    actionWhenInactive: "Save book",
    confirmedOn: "Saved to your library",
    confirmedOff: "Removed from saved",
  },
  {
    shelf: "want_to_read",
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

export function ShelfButtons({ bookId }: { bookId: string }) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const shelvesQuery = useShelves();
  const rows = shelvesQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: ({ shelf, on }: { shelf: ShelfKind; on: boolean }) =>
      toggleShelf(userId, bookId, shelf, on),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shelves", userId] }),
  });

  return (
    <div className="flex items-center gap-1.5">
      {ACTIONS.map(({ shelf, icon: Icon, actionWhenActive, actionWhenInactive, confirmedOn, confirmedOff }) => {
        const active = rows.some((r) => r.book_id === bookId && r.shelf === shelf);
        return (
          <button
            key={shelf}
            type="button"
            aria-pressed={active}
            aria-label={active ? actionWhenActive : actionWhenInactive}
            title={active ? actionWhenActive : actionWhenInactive}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              mutation.mutate({ shelf, on: !active });
              toast.success(active ? confirmedOff : confirmedOn);
            }}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card/90 text-muted-foreground backdrop-blur hover:text-foreground"
            }`}
          >
            <Icon className={`h-4 w-4 ${active ? "fill-current" : ""}`} />
          </button>
        );
      })}
    </div>
  );
}
