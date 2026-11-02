import { supabase } from "@/integrations/supabase/client";
import { demoStore, type ShelfKind, type ShelfRow } from "@/lib/data";
import { DEMO_USER_ID } from "@/lib/library";

export type { ShelfKind } from "@/lib/data";

export const SHELF_LABELS: Record<ShelfKind, string> = {
  favorite: "Favorites",
  saved: "Saved",
  want_to_read: "Want to read",
};

/** A work has one membership per optional shelf type. Duplicated legacy
 * rows or reconnection retries must not produce repeated badges/counters.
 * This never writes, merges, or deletes any original user records.
 */
export function dedupeShelfRows(rows: readonly ShelfRow[]): ShelfRow[] {
  const unique = new Map<string, ShelfRow>();
  for (const row of rows) {
    const key = row.user_id + "\u0000" + row.book_id + "\u0000" + row.shelf;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

export async function listShelves(userId: string): Promise<ShelfRow[]> {
  if (userId !== DEMO_USER_ID) {
    try {
      const { data, error } = await supabase
        .from("book_shelves")
        .select("*")
        .eq("user_id", userId);
      if (error) throw error;
      // A successful authenticated read is authoritative. Older versions
      // concatenated stale on-device rows after remote records, which could
      // resurrect a shelf the reader had explicitly removed online.
      // Local records are not erased, and are only shown as an offline
      // fallback when the database cannot be reached.
      return dedupeShelfRows((data as ShelfRow[] | null) ?? []);
    } catch {
      // Keep existing on-device memberships visible during connection
      // errors without claiming they have synced to the account.
    }
  }
  return dedupeShelfRows(demoStore.getShelves().filter((s) => s.user_id === userId));
}

export async function toggleShelf(
  userId: string,
  bookId: string,
  shelf: ShelfKind,
  on: boolean,
): Promise<void> {
  if (userId !== DEMO_USER_ID) {
    // A failed remote write must not masquerade as a successful synchronized
    // change. Keep the existing database rows and surface a retryable error.
    if (on) {
      const { error } = await supabase
        .from("book_shelves")
        .upsert(
          { user_id: userId, book_id: bookId, shelf },
          { onConflict: "user_id,book_id,shelf" },
        );
      if (error) throw new Error("Could not save shelf changes to your account. Please retry.");
      return;
    }
    const { error } = await supabase
      .from("book_shelves")
      .delete()
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .eq("shelf", shelf);
    if (error) throw new Error("Could not remove the book from your shelf. Please retry.");
    return;
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
