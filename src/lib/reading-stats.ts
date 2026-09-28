// Single definition of the "Pages read" stat shown on both /library and
// /profile. Progress rows are per (book, language); a reader who switched
// languages in the same book has several rows for it, so summing every row
// double-counts. Pages read = furthest position reached per book, summed.
export interface ProgressLike {
  book_id: string;
  last_chunk_index: number;
}

export function countPagesRead(progress: readonly ProgressLike[] | null | undefined): number {
  const furthest = new Map<string, number>();
  for (const p of progress ?? []) {
    const prev = furthest.get(p.book_id);
    if (prev === undefined || p.last_chunk_index > prev)
      furthest.set(p.book_id, p.last_chunk_index);
  }
  let total = 0;
  for (const index of furthest.values()) total += Math.max(0, index) + 1;
  return total;
}
