// Pure catalog-dedup logic, split out of library.ts for unit testing. See
// the "duplicate catalog entries" fix in the launch report: a locally
// published demo book matching a seed title+author is treated as a
// duplicate of the seed entry, not a second listing.
export function catalogKey(title: string, author: string): string {
  return `${title.trim().toLowerCase()}::${author.trim().toLowerCase()}`;
}

export function dedupeAgainstSeed<T extends { title: string; author: string }>(
  seed: T[],
  candidates: T[],
): T[] {
  const seedKeys = new Set(seed.map((b) => catalogKey(b.title, b.author)));
  return candidates.filter((b) => !seedKeys.has(catalogKey(b.title, b.author)));
}
