import { describe, expect, it } from "vitest";
import { matchCanonicalReferenceNodes, type ReferenceNodeForPairing } from "./sacred-reference-pairing";

const node = (key: string, ref: string, index: number): ReferenceNodeForPairing => ({
  node_key: key, start_chunk_index: index, end_chunk_index: index,
  metadata: { canonical_ref: ref, reference_label: ref },
});

describe("canonical-source matching across non-identical Bible editions", () => {
  it("aligns Matthew by exact reference even after extra English verses shift indexes", () => {
    const greek = [node("verse-1-1", "Matthew 1:1", 0), node("verse-1-3", "Matthew 1:3", 1)];
    const english = [node("verse-1-1", "Matthew 1:1", 0),
      node("verse-1-2", "Matthew 1:2", 1),
      node("verse-1-3", "Matthew 1:3", 2)];
    const paired = matchCanonicalReferenceNodes(greek, english);
    expect(paired.map((p) => [p.chunkIndex, p.targetIndex, p.canonicalRef])).toEqual([
      [0, 0, "Matthew 1:1"], [1, 2, "Matthew 1:3"],
    ]);
    // English-only Matthew 1:2 has no fabricated Greek match.
    expect(paired).toHaveLength(2);
  });
  it("rejects identical node keys with conflicting canonical references", () => {
    const greek = [node("verse-1-1", "Matthew 1:1", 0)];
    const english = [node("verse-1-1", "Matthew 1:2", 0)];
    expect(matchCanonicalReferenceNodes(greek, english)).toHaveLength(0);
  });
  it("does not accept multi-chunk chapter headings as verse matches", () => {
    const chapter = { ...node("chapter-1", "Matthew 1", 0), end_chunk_index: 30 };
    expect(matchCanonicalReferenceNodes([chapter], [chapter])).toHaveLength(0);
  });
});
