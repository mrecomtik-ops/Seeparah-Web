import { describe, expect, it } from "vitest";
import manifest from "./sacred-tibetan-source-manifest.json";

describe("pinned Derge Tibetan source identity", () => {
  it("contains every acquired Kangyur and Tengyur volume exactly once", () => {
    expect(manifest.volumes).toHaveLength(316);
    for (const [corpus, expected] of [["Kangyur", 103], ["Tengyur", 213]] as const) {
      const volumes = manifest.volumes.filter(x => x.corpus === corpus);
      expect(volumes).toHaveLength(expected);
      expect(volumes.map(x => x.volume)).toEqual(Array.from({length:expected},(_,i)=>i+1));
      expect(new Set(volumes.map(x => x.filename)).size).toBe(expected);
    }
  });
  it("retains exact source integrity and labels catalogue volumes", () => {
    for (const v of manifest.volumes) {
      expect(v.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(v.filename).toMatch(/^\d{3}_.*\.txt$/);
      expect(v.bytes).toBeGreaterThan(0);
      expect(v.markerCount).toBeGreaterThanOrEqual(0);
    }
    expect(manifest.volumes.filter(x => x.catalogue)).toHaveLength(2);
    expect(manifest.notCanonicalWorkSegmentation).toBe(true);
  });
  it("uses only pinned source revisions and pinned rollup hashes", () => {
    expect(manifest.corpora.Kangyur.rev).toBe("a582cf471b7c85a101035071078032f106a8e536");
    expect(manifest.corpora.Tengyur.rev).toBe("174653137d62af481f53c6ae3dc842bf8629323e");
    expect(manifest.corpora.Kangyur.fingerprint).toHaveLength(64);
    expect(manifest.corpora.Tengyur.fingerprint).toHaveLength(64);
  });
});
