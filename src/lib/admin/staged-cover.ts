/** A staged cover is an exact reviewed edition/attribution decision.
 * Changing a form field after staging must not silently rewrite its rights
 * declaration during the final Assign action.
 */
export interface StagedEditionCover {
  path: string;
  url: string;
  language: string;
  sourceEditionId: string;
  attribution: string;
  sharedArtwork: boolean;
}

export function lockStagedCoverReview(
  uploaded: Pick<StagedEditionCover, "path" | "url" | "language" | "sourceEditionId">,
  attribution: string,
  sharedArtwork: boolean,
): StagedEditionCover {
  if (attribution.trim().length < 3) throw new Error("Cover source attribution is required.");
  return { ...uploaded, attribution: attribution.trim(), sharedArtwork };
}

export function stagedCoverAssignment(staged: StagedEditionCover, selectedLanguage: string) {
  if (staged.language !== selectedLanguage) {
    throw new Error("Select the exact reviewed edition before assigning this cover.");
  }
  return {
    language: staged.language,
    path: staged.path,
    attribution: staged.attribution,
    sharedArtwork: staged.sharedArtwork,
  };
}
