/** Protect the exact source-edition and artwork rights declarations that
 * were written to immutable Supabase Storage metadata when a cover was staged.
 * The client's Assign request must never be the authority for attribution.
 */
export function verifyStagedCoverProvenance(
  stored: Record<string, unknown> | null | undefined,
  expected: {
    language: string;
    sourceEditionId: string;
    attribution: string;
    sharedArtwork: boolean;
  },
): void {
  if (!stored) {
    throw new Error("Staged cover has no stored rights provenance. Stage and review the artwork again.");
  }
  const isSame = stored['edition_language'] === expected.language
    && stored['source_edition_id'] === expected.sourceEditionId
    && stored['attribution'] === expected.attribution
    && stored['shared_artwork'] === String(expected.sharedArtwork);
  if (!isSame) {
    throw new Error("Staged cover rights or source edition changed. Review and stage the correct edition artwork again.");
  }
}

/** Never stage or assign an edition-specific cover to an unidentified source.
 * Preserve every byte of an existing ID; do not "normalize" canonical IDs. */
export function requireVerifiedSourceEditionId(sourceEditionId: string | null | undefined): string {
  if (!sourceEditionId || sourceEditionId.trim().length === 0) {
    throw new Error("The source edition has no verified identifier. Record and review the exact edition before assigning artwork.");
  }
  return sourceEditionId;
}
