/** Safe literal search fragment for Supabase PostgREST's .or() grammar.
 * Remove delimiters, operators and wildcard characters rather than trying
 * to escape arbitrary user-supplied filter syntax. */
export function sanitizeAdminCatalogSearch(input: string): string {
  return input.normalize("NFKC")
    .replace(/[^\p{L}\p{N} '-]/gu, " ")
    .replace(/\s+/gu, " ").trim().slice(0, 120).trim();
}
