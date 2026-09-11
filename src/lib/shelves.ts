import { supabase } from "@/integrations/supabase/client";
import { demoStore, type ShelfKind, type ShelfRow } from "@/lib/data";
import { DEMO_USER_ID } from "@/lib/library";

export type { ShelfKind } from "@/lib/data";

export const SHELF_LABELS: Record<ShelfKind, string> = {
  favorite: "Favorites",
  saved: "Saved",
  want_to_read: "Want to read",
};

export async function listShelves(userId: string): Promise<ShelfRow[]> {
  if (userId !== DEMO_USER_ID) {
    try {
      const { data, error } = await supabase
        .from("book_shelves")
        .select("*")
        .eq("user_id", userId);
      if (!error && data) {
        return (data as ShelfRow[]).concat(
          demoStore.getShelves().filter((s) => s.user_id === userId),
        );
      }
    } catch {
      // fall through to local
    }
  }
  return demoStore.getShelves().filter((s) => s.user_id === userId);
}

export async function toggleShelf(
  userId: string,
  bookId: string,
  shelf: ShelfKind,
  on: boolean,
): Promise<void> {
  if (userId !== DEMO_USER_ID) {
    try {
      if (on) {
        const { error } = await supabase
          .from("book_shelves")
          .upsert(
            { user_id: userId, book_id: bookId, shelf },
            { onConflict: "user_id,book_id,shelf" },
          );
        if (!error) return;
      } else {
        const { error } = await supabase
          .from("book_shelves")
          .delete()
          .eq("user_id", userId)
          .eq("book_id", bookId)
          .eq("shelf", shelf);
        if (!error) return;
      }
    } catch {
      // fall through to local
    }
  }
  const rows = demoStore
    .getShelves()
    .filter(
      (r) =>
        !(r.user_id === userId && r.book_id === bookId && r.shelf === shelf),
    );
  if (on) {
    rows.push({
      id: crypto.randomUUID(),
      user_id: userId,
      book_id: bookId,
      shelf,
      created_at: new Date().toISOString(),
    });
  }
  demoStore.setShelves(rows);
}

// ---------------------------------------------------------------------------
// Reading streak (kept on the device — a gentle daily nudge, not billing data)
// ---------------------------------------------------------------------------

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function recordReadingDay() {
  const days = new Set(demoStore.getReadingDays());
  days.add(todayKey());
  demoStore.setReadingDays([...days].sort().slice(-400));
}

export function currentStreak(): number {
  const days = new Set(demoStore.getReadingDays());
  let streak = 0;
  const cursor = new Date();
  if (!days.has(todayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(todayKey(cursor))) return 0;
  }
  while (days.has(todayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function readingDays(): string[] {
  return demoStore.getReadingDays();
}
