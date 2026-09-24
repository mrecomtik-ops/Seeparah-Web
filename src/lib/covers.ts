import prideCover from "@/assets/cover-pride.jpg";
import lanternCover from "@/assets/cover-lantern.jpg";
import mobyCover from "@/assets/cover-moby.jpg";
import prophetCover from "@/assets/cover-prophet.jpg";

export const BOOK_COVERS: Record<string, string> = {
  "11111111-1111-1111-1111-111111111111": prideCover,
  "22222222-2222-2222-2222-222222222222": lanternCover,
  "33333333-3333-3333-3333-333333333333": mobyCover,
  "44444444-4444-4444-4444-444444444444": prophetCover,
};

// Preference only, never a fabricated entry: callers look this ID up in
// the REAL fetched books array and fall back to the first real result if
// it isn't there (which, on a fresh catalog, it never is — see
// src/routes/index.tsx and src/routes/library.tsx). Never used to invent
// or render a book that doesn't actually exist in the database.
export const FEATURED_BOOK_ID = "11111111-1111-1111-1111-111111111111";

export function coverFor(bookId: string, coverUrl?: string | null): string | null {
  return BOOK_COVERS[bookId] ?? coverUrl ?? null;
}
