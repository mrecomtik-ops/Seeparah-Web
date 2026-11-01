/** Explicit source-unit alignment: never infer a translation from array index.
 * Imported source node keys and canonical references must both match.
 */
export interface ReferenceNodeForPairing {
  node_key: string;
  start_chunk_index: number;
  end_chunk_index: number;
  metadata: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function matchCanonicalReferenceNodes(
  source: readonly ReferenceNodeForPairing[],
  translation: readonly ReferenceNodeForPairing[],
): Array<{ chunkIndex: number; targetIndex: number; canonicalRef: string; label: string }> {
  const candidates = new Map(
    translation.filter((node) => node.start_chunk_index === node.end_chunk_index)
      .map((node) => [node.node_key, node]),
  );
  return source.flatMap((node) => {
    if (node.start_chunk_index !== node.end_chunk_index) return [];
    const matching = candidates.get(node.node_key);
    const canonicalRef = record(node.metadata)?.["canonical_ref"];
    if (!matching || typeof canonicalRef !== "string" || !canonicalRef ||
        record(matching.metadata)?.["canonical_ref"] !== canonicalRef) return [];
    const label = record(matching.metadata)?.["reference_label"];
    return [{
      chunkIndex: node.start_chunk_index,
      targetIndex: matching.start_chunk_index,
      canonicalRef,
      label: typeof label === "string" && label ? label : canonicalRef,
    }];
  }).sort((a, b) => a.chunkIndex - b.chunkIndex);
}
