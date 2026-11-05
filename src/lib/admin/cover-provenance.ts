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

/** The Supabase Storage `.info(path)` SDK recursively camelCases the REST
 * file-info JSON: `user_metadata` becomes `userMetadata` and even its
 * CUSTOM keys (`source_edition_id` -> `sourceEditionId`).
 *
 * Verify that original immutable user-metadata namespace only. Do NOT use
 * `metadata`, which contains untrusted-for-provenance system MIME/ETag fields;
 * never use any caller-submitted rights data as the source of truth.
 * Raw REST snake_case is also supported for compatibility, but conflicting
 * declarations fail closed.
 */
export function verifyStagedCoverObjectProvenance(
  fileInfo: unknown,
  expected: Parameters<typeof verifyStagedCoverProvenance>[1],
): void {
  const object = fileInfo && typeof fileInfo === "object" && !Array.isArray(fileInfo)
    ? fileInfo as Record<string, unknown>
    : null;
  const namespaces = [object?.["userMetadata"], object?.["user_metadata"]]
    .filter((value) => value !== undefined);
  if (namespaces.length === 0) {
    verifyStagedCoverProvenance(null, expected);
    return;
  }
  for (const value of namespaces) {
    const record = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
    if (!record) {
      verifyStagedCoverProvenance(null, expected);
      return;
    }
    const field = (camel: string, snake: string): unknown => {
      const a = record[camel], b = record[snake];
      if (a !== undefined && b !== undefined && a !== b) {
        throw new Error("Staged cover rights or source edition changed. Review and stage the correct edition artwork again.");
      }
      return a ?? b;
    };
    verifyStagedCoverProvenance({
      edition_language: field("editionLanguage", "edition_language"),
      source_edition_id: field("sourceEditionId", "source_edition_id"),
      attribution: record["attribution"],
      shared_artwork: field("sharedArtwork", "shared_artwork"),
    }, expected);
  }
}

/** Storage's file-info endpoint does not expose custom user_metadata in every
 * deployed Storage API version. The privileged stage handler writes these
 * exact facts to the server-owned audit_log after the successful upload.
 * Only use a matching authenticated stage audit row as rights evidence;
 * technical Storage metadata, caller values and the uploaded filename are
 * insufficient. The audit row must be found by the exact opaque object path.
 */
export function verifyStagedCoverAuditProvenance(
  auditAfter: unknown,
  expected: {
    path: string;
    language: string;
    sourceEditionId: string;
    attribution: string;
    sharedArtwork: boolean;
  },
): void {
  if (!auditAfter || typeof auditAfter !== "object" || Array.isArray(auditAfter)) {
    throw new Error("Staged cover has no verified server audit provenance. Stage and review the artwork again.");
  }
  const stored = auditAfter as Record<string, unknown>;
  const agrees = stored["path"] === expected.path
    && stored["language"] === expected.language
    && stored["sourceEditionId"] === expected.sourceEditionId
    && stored["attribution"] === expected.attribution
    && stored["sharedArtwork"] === expected.sharedArtwork
    && typeof stored["sizeBytes"] === "number"
    && Number.isSafeInteger(stored["sizeBytes"])
    && (stored["sizeBytes"] as number) > 0;
  if (!agrees) {
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
