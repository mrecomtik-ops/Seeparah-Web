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

// Previously pointed at the fake "Lantern in the Rain" publishing-flow demo
// manuscript and was labeled "Book of the day" — presenting a demo entry as
// a curated real pick. Repointed at a genuine (if excerpted) public-domain
// classic; callers should label this "Featured", not imply daily curation
// that isn't actually happening yet.
export const FEATURED_BOOK_ID = "11111111-1111-1111-1111-111111111111";
export const DEMO_BOOK_ID = "11111111-1111-1111-1111-111111111111";

export function coverFor(bookId: string, coverUrl?: string | null): string | null {
  return BOOK_COVERS[bookId] ?? coverUrl ?? null;
}
