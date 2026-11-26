import { describe, expect, it } from "vitest";
import {
  activateVerifiedBookArchive,
  archiveSha256,
  bookArchiveKey,
  bookActivationKey,
  parseBookArchive,
  readActiveBookArchive,
  writeVerifiedBookArchive,
  type PrivateArchiveBucket,
} from "./r2-book-archive.server";

const edition = {
  bookId: "ae26faf4-ac39-43f4-931a-73db719e9f14",
  language: "English",
  sourceVersion: 3,
};
const rows = [
  { chunk_index: 0, content: "The first page. \n" },
  { chunk_index: 1, content: "الصفحة الثانية — exact Unicode." },
];

function bucketFixture() {
  const objects = new Map<string, string>();
  const bucket: PrivateArchiveBucket = {
    async get(key) {
      const data = objects.get(key);
      return data === undefined ? null : { text: async () => data };
    },
    async put(key, content) { objects.set(key, content); return {}; },
  };
  return { bucket, objects };
}

describe("Private R2 book archive migration safety", () => {
  it("retains exact chunk text, source version and order", async () => {
    const { bucket } = bucketFixture();
    const result = await writeVerifiedBookArchive(bucket, edition, rows);
    expect(result).toMatchObject({ key: bookArchiveKey(edition), chunks: 2 });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Copy alone NEVER enables R2 reads. Explicitly QA and activate later.
    expect(await readActiveBookArchive(bucket, edition)).toBeNull();
    await activateVerifiedBookArchive(bucket, edition, result.sha256);
    expect(await readActiveBookArchive(bucket, edition)).toEqual(rows);
  });

  it("does not silently overwrite changed source bytes within a version", async () => {
    const { bucket } = bucketFixture();
    await writeVerifiedBookArchive(bucket, edition, rows);
    await expect(writeVerifiedBookArchive(bucket, edition, [
      { chunk_index: 0, content: "CHANGED" },
    ])).rejects.toThrow(/different bytes/);
  });

  it("fails closed on missing or corrupted activated content", async () => {
    const { bucket, objects } = bucketFixture();
    const result = await writeVerifiedBookArchive(bucket, edition, rows);
    await activateVerifiedBookArchive(bucket, edition, result.sha256);
    objects.set(bookArchiveKey(edition), "CORRUPTED");
    await expect(readActiveBookArchive(bucket, edition)).rejects.toThrow(/checksum/);
    objects.delete(bookArchiveKey(edition));
    await expect(readActiveBookArchive(bucket, edition)).rejects.toThrow(/missing/);
  });

  it("rejects reordered/duplicate chunks and identity changes", async () => {
    expect(() => parseBookArchive({
      schema: "seeparah-book-chunks-v1",
      book_id: edition.bookId, language: edition.language,
      source_version: edition.sourceVersion,
      chunks: [rows[1], rows[0]],
    }, edition)).toThrow(/unordered/);
    expect(() => bookArchiveKey({ ...edition, bookId: "../bad" })).toThrow(/identity/);
    expect(await archiveSha256("exact bytes")).toHaveLength(64);
    expect(bookActivationKey(edition)).toContain("/active/");
  });

  it("refuses a conflicting activation marker", async () => {
    const { bucket, objects } = bucketFixture();
    const result = await writeVerifiedBookArchive(bucket, edition, rows);
    objects.set(bookActivationKey(edition), JSON.stringify({ sha256: "f".repeat(64) }));
    await expect(activateVerifiedBookArchive(bucket, edition, result.sha256))
      .rejects.toThrow(/Conflicting/);
  });
});
