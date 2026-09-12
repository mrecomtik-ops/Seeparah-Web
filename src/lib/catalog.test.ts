import { describe, expect, it } from "vitest";
import { dedupeAgainstSeed } from "@/lib/catalog";

describe("dedupeAgainstSeed", () => {
  const seed = [
    { id: "seed-1", title: "The Lantern in the Rain", author: "Amina Rahman" },
  ];

  it("drops a locally-published book that matches a seed title+author", () => {
    const candidates = [
      { id: "local-dup", title: "The Lantern in the Rain", author: "Amina Rahman" },
      { id: "local-unique", title: "A Different Book", author: "Someone Else" },
    ];
    const result = dedupeAgainstSeed(seed, candidates);
    expect(result.map((b) => b.id)).toEqual(["local-unique"]);
  });

  it("is case- and whitespace-insensitive", () => {
    const candidates = [{ id: "local-dup", title: "  the lantern in the rain  ", author: "AMINA RAHMAN" }];
    expect(dedupeAgainstSeed(seed, candidates)).toEqual([]);
  });

  it("keeps a genuinely distinct book by a different author with the same title", () => {
    const candidates = [{ id: "local-legit", title: "The Lantern in the Rain", author: "A Real Different Author" }];
    expect(dedupeAgainstSeed(seed, candidates)).toHaveLength(1);
  });
});
