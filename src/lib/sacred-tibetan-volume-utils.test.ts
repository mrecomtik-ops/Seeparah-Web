// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { fetchVerifiedTibetanSource, validateTibetanSearch, verifyTibetanSourceBytes } from "./sacred-tibetan-volume-utils";

const limits = { Kangyur: 103, Tengyur: 213 } as const;
const sample = "བོད་ཡིག\n{D123}\nཚིག་འཕྲོ་ སྐད།  🕉️\n";
const encoded = new TextEncoder().encode(sample);
const integrity = {
  bytes: encoded.byteLength,
  sha256: createHash("sha256").update(encoded).digest("hex"),
};
const bytes = () => encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;

describe("Tibetan source volume navigation validation", () => {
  it("accepts exact first and last volumes in each corpus", () => {
    expect(validateTibetanSearch({ corpus: "Kangyur", volume: "103" }, limits)).toEqual({ corpus: "Kangyur", volume: 103 });
    expect(validateTibetanSearch({ corpus: "Tengyur", volume: 213 }, limits)).toEqual({ corpus: "Tengyur", volume: 213 });
  });
  it("rejects unknown collections, invalid and out-of-range volumes without rendering the wrong one", () => {
    expect(validateTibetanSearch({ corpus: "bad", volume: 888 }, limits)).toEqual({ corpus: "Kangyur", volume: 1 });
    expect(validateTibetanSearch({ corpus: "Kangyur", volume: 104 }, limits).volume).toBe(1);
    expect(validateTibetanSearch({ corpus: "Tengyur", volume: 214 }, limits).volume).toBe(1);
    for (const volume of [0, -1, 1.5, "2.5", "9999", null, "1e3", "0", {}, NaN]) {
      expect(validateTibetanSearch({ corpus: "Kangyur", volume }, limits).volume).toBe(1);
    }
  });
});
describe("exact Tibetan source-byte verification", () => {
  it("preserves every original Unicode mark, folio reference, space and line break", async () => {
    expect(await verifyTibetanSourceBytes(bytes(), integrity)).toBe(sample);
  });
  it("fails closed on a different byte count", async () => {
    await expect(verifyTibetanSourceBytes(bytes(), { ...integrity, bytes: 1 })).rejects.toThrow("length differs");
  });
  it("fails closed on a same-length checksum mismatch", async () => {
    await expect(verifyTibetanSourceBytes(bytes(), { ...integrity, sha256: "0".repeat(64) })).rejects.toThrow("SHA-256 differs");
  });
  it("fails closed on unavailable remote source", async () => {
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchVerifiedTibetanSource("https://example.invalid", integrity, undefined, fetcher)).rejects.toThrow("HTTP 503");
  });
  it("fails closed on malformed UTF-8 despite a matching checksum", async () => {
    const invalid = new Uint8Array([0xff, 0xfe]);
    const info = { bytes: 2, sha256: createHash("sha256").update(invalid).digest("hex") };
    await expect(verifyTibetanSourceBytes(invalid.buffer, info)).rejects.toThrow();
  });
});
