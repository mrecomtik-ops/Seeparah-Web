import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Heart, Plus } from "lucide-react";
import { toast } from "sonner";
import { listShelves, toggleShelf, type ShelfKind } from "@/lib/shelves";
import { useAuth } from "@/lib/use-auth";

const ACTIONS: { shelf: ShelfKind; icon: typeof Heart; on: string; off: string }[] = [
  { shelf: "favorite", icon: Heart, on: "Removed from favorites", off: "Added to favorites" },
  { shelf: "saved", icon: Bookmark, on: "Removed from saved", off: "Saved to your library" },
  { shelf: "want_to_read", icon: Plus, on: "Removed from want to read", off: "Added to want to read" },
];

export function useShelves() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["shelves", userId],
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
      {ACTIONS.map(({ shelf, icon: Icon, on, off }) => {
        const active = rows.some((r) => r.book_id === bookId && r.shelf === shelf);
        return (
          <button
            key={shelf}
            type="button"
            aria-label={active ? on : off}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              mutation.mutate({ shelf, on: !active });
              toast.success(active ? on : off);
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
