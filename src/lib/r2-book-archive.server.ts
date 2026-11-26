/**
 * Private, version-specific archive for book text. This is a staging/cutover
 * layer, not a public R2 URL: every read still passes reader.server.ts access
 * checks BEFORE this module is called.
 *
 * Mirror bytes without modifying PostgreSQL. Only a separately verified
 * activation marker switches a book/language/version to the R2 copy.
 * Absence of a marker always keeps the legacy Postgres reader operational.
 */
export const R2_BOOK_ARCHIVE_SCHEMA = "seeparah-book-chunks-v1" as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;

export type ArchivedChunk = { chunk_index: number; content: string };
export type ArchivedEdition = {
  schema: typeof R2_BOOK_ARCHIVE_SCHEMA;
  book_id: string;
  language: string;
  source_version: number;
  chunks: ArchivedChunk[];
};
export type EditionIdentity = {
  bookId: string;
  language: string;
  sourceVersion: number;
};
export type ArchiveObject = {
  text(): Promise<string>;
  customMetadata?: Record<string, string>;
};
export type PrivateArchiveBucket = {
  get(key: string): Promise<ArchiveObject | null>;
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
};

function verifiedIdentity(value: EditionIdentity) {
  if (!UUID.test(value.bookId) || value.language.length < 1 ||
      value.language.length > 100 || !Number.isSafeInteger(value.sourceVersion) ||
      value.sourceVersion < 1) {
    throw new Error("Invalid R2 book edition identity");
  }
  return value;
}

export function bookArchiveKey(identity: EditionIdentity): string {
  const value = verifiedIdentity(identity);
  return `book-text/v1/${value.bookId.toLowerCase()}/${encodeURIComponent(value.language)}/${value.sourceVersion}.json`;
}

export function bookActivationKey(identity: EditionIdentity): string {
  const value = verifiedIdentity(identity);
  return `book-text/active/${value.bookId.toLowerCase()}/${encodeURIComponent(value.language)}/${value.sourceVersion}.json`;
}

export function parseBookArchive(value: unknown, identity: EditionIdentity): ArchivedEdition {
  verifiedIdentity(identity);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid R2 book archive");
  }
  const archive = value as Record<string, unknown>;
  if (archive["schema"] !== R2_BOOK_ARCHIVE_SCHEMA ||
      archive["book_id"] !== identity.bookId ||
      archive["language"] !== identity.language ||
      archive["source_version"] !== identity.sourceVersion ||
      !Array.isArray(archive["chunks"])) {
    throw new Error("R2 edition identity or schema mismatch");
  }
  const chunks: ArchivedChunk[] = [];
  let lastIndex = -1;
  for (const unknownRow of archive["chunks"] as unknown[]) {
    if (!unknownRow || typeof unknownRow !== "object" || Array.isArray(unknownRow)) {
      throw new Error("Invalid R2 book chunk");
    }
    const row = unknownRow as Record<string, unknown>;
    const index = row["chunk_index"];
    if (!Number.isSafeInteger(index) || typeof index !== "number" ||
        index < 0 || index <= lastIndex || typeof row["content"] !== "string") {
      throw new Error("R2 book archive has invalid or unordered chunks");
    }
    chunks.push({ chunk_index: index, content: row["content"] });
    lastIndex = index;
  }
  if (chunks.length === 0) throw new Error("Empty R2 book archive");
  return {
    schema: R2_BOOK_ARCHIVE_SCHEMA,
    book_id: identity.bookId,
    language: identity.language,
    source_version: identity.sourceVersion,
    chunks,
  };
}

export async function archiveSha256(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

export async function writeVerifiedBookArchive(
  bucket: PrivateArchiveBucket,
  identity: EditionIdentity,
  rows: ArchivedChunk[],
): Promise<{ key: string; sha256: string; chunks: number }> {
  const archive = parseBookArchive({
    schema: R2_BOOK_ARCHIVE_SCHEMA,
    book_id: identity.bookId,
    language: identity.language,
    source_version: identity.sourceVersion,
    chunks: rows,
  }, identity);
  const key = bookArchiveKey(identity);
  const payload = JSON.stringify(archive);
  const sha256 = await archiveSha256(payload);
  // An archive key is immutable within its source version; never overwrite
  // unexpectedly different content without a new version and review.
  const previous = await bucket.get(key);
  if (previous) {
    const priorHash = await archiveSha256(await previous.text());
    if (priorHash !== sha256) throw new Error("R2 archive already exists with different bytes");
  } else {
    await bucket.put(key, payload, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { sha256, schema: R2_BOOK_ARCHIVE_SCHEMA },
    });
  }
  const check = await bucket.get(key);
  if (!check || await archiveSha256(await check.text()) !== sha256) {
    throw new Error("R2 archive readback checksum mismatch");
  }
  return { key, sha256, chunks: archive.chunks.length };
}

/** Activation is an explicit post-QA step; migration does NOT call this. */
export async function activateVerifiedBookArchive(
  bucket: PrivateArchiveBucket,
  identity: EditionIdentity,
  expectedSha256: string,
): Promise<void> {
  if (!SHA256.test(expectedSha256)) throw new Error("Invalid expected SHA256");
  const object = await bucket.get(bookArchiveKey(identity));
  if (!object) throw new Error("Missing R2 archive");
  const data = await object.text();
  if (await archiveSha256(data) !== expectedSha256) {
    throw new Error("R2 archive checksum changed before activation");
  }
  parseBookArchive(JSON.parse(data), identity);
  const markerKey = bookActivationKey(identity);
  const existing = await bucket.get(markerKey);
  if (existing) {
    const value: unknown = JSON.parse(await existing.text());
    if (!value || typeof value !== "object" ||
        (value as Record<string, unknown>)["sha256"] !== expectedSha256) {
      throw new Error("Conflicting existing R2 activation marker");
    }
    return;
  }
  await bucket.put(markerKey, JSON.stringify({ sha256: expectedSha256 }), {
    httpMetadata: { contentType: "application/json" },
  });
  const readback = await bucket.get(markerKey);
  if (!readback || JSON.parse(await readback.text()).sha256 !== expectedSha256) {
    throw new Error("R2 activation marker readback failed");
  }
}

export async function readActiveBookArchive(
  bucket: PrivateArchiveBucket,
  identity: EditionIdentity,
): Promise<ArchivedChunk[] | null> {
  const marker = await bucket.get(bookActivationKey(identity));
  if (!marker) return null;
  const m: unknown = JSON.parse(await marker.text());
  if (!m || typeof m !== "object" || Array.isArray(m)) {
    throw new Error("Malformed R2 activation marker");
  }
  const sha256 = (m as Record<string, unknown>)["sha256"];
  if (typeof sha256 !== "string" || !SHA256.test(sha256)) {
    throw new Error("Invalid R2 activation checksum");
  }
  const object = await bucket.get(bookArchiveKey(identity));
  if (!object) throw new Error("Activated R2 archive is missing");
  const payload = await object.text();
  if (await archiveSha256(payload) !== sha256) {
    throw new Error("Activated R2 archive failed checksum verification");
  }
  return parseBookArchive(JSON.parse(payload), identity).chunks;
}

/** In local/test builds the binding is absent, so the database reader wins.
 * Never expose this private bucket through a public r2.dev or direct URL.
 */
async function configuredBookBucket(): Promise<PrivateArchiveBucket | null> {
  try {
    const module = await import("cloudflare:workers");
    const candidate = (module.env as Record<string, unknown>)["SEEPARAH_BOOK_ARCHIVE"];
    if (!candidate || typeof candidate !== "object") return null;
    const bucket = candidate as Partial<PrivateArchiveBucket>;
    return typeof bucket.get === "function" && typeof bucket.put === "function"
      ? bucket as PrivateArchiveBucket : null;
  } catch {
    return null;
  }
}

export async function getActiveBookChunks(
  bookId: string, language: string, sourceVersion: number,
): Promise<ArchivedChunk[] | null> {
  const bucket = await configuredBookBucket();
  if (!bucket) return null;
  return readActiveBookArchive(bucket, { bookId, language, sourceVersion });
}
