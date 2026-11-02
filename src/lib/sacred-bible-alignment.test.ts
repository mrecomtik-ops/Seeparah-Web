import { describe, expect, it } from "vitest";
import {
  VERIFIED_GREEK_ENGLISH_CANONICAL_WORKS,
  canCompareByCanonicalReference,
} from "./sacred-bible-alignment";

describe("Verified Greek-English source-reference pairs (SP-28)", () => {
  it("includes only the 27 published New Testament works verified in production SQL", () => {
    expect(Object.keys(VERIFIED_GREEK_ENGLISH_CANONICAL_WORKS)).toHaveLength(27);
    for (const bookId of Object.keys(VERIFIED_GREEK_ENGLISH_CANONICAL_WORKS)) {
      expect(canCompareByCanonicalReference(bookId, "Greek", "English")).toBe(true);
      expect(canCompareByCanonicalReference(bookId, "English", "Greek")).toBe(true);
    }
  });
  it("includes newly verified shifted-index books but never blesses positional alignment", () => {
    const mark = "d725cedf-2443-5c10-a68a-0e100a33aecd";
    const revelation = "0f04a44a-fe48-5f59-99f9-36ce801271ee";
    expect(canCompareByCanonicalReference(mark, "Greek", "English")).toBe(true);
    expect(canCompareByCanonicalReference(revelation, "English", "Greek")).toBe(true);
    expect(canCompareByCanonicalReference(mark, "Greek", "Greek")).toBe(false);
    expect(canCompareByCanonicalReference(mark, "Urdu", "English")).toBe(false);
    expect(canCompareByCanonicalReference("f7e3a9f0-931a-5207-9859-a27210cc2ca8", "Greek", "English")).toBe(false);
    expect(canCompareByCanonicalReference("00000000-0000-0000-0000-000000000000", "Greek", "English")).toBe(false);
  });
});
