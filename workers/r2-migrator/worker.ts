/**
 * SEPARATE, manually operated R2 migration Worker.
 *
 * Never deploy this in place of seeparah-web. No cron, no automatic database
 * changes, no public object URLs and no deletion endpoint. R2 is private.
 * Configure secrets and bucket before deployment; see docs/r2-migration.md.
 */
import {
  activateVerifiedBookArchive, writeVerifiedBookArchive,
  type ArchivedChunk, type EditionIdentity, type PrivateArchiveBucket,
} from "../../src/lib/r2-book-archive.server";

interface Env {
  SEEPARAH_BOOK_ARCHIVE: PrivateArchiveBucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  MIGRATION_ADMIN_TOKEN: string;
}
type PublishedBook = {
  id: string; status: string; content_classification: string;
  source_language: string; source_version: number; total_chunks: number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_CHUNKS = 10000;
const MAX_BYTES = 26 * 1024 * 1024;
const PAGE_SIZE = 500;

function reply(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function isConfigured(env: Env): boolean {
  const bucket = env.SEEPARAH_BOOK_ARCHIVE as Partial<PrivateArchiveBucket> | undefined;
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY &&
    env.MIGRATION_ADMIN_TOKEN && bucket &&
    typeof bucket.get === "function" && typeof bucket.put === "function");
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = "Bearer " + env.MIGRATION_ADMIN_TOKEN;
  if (!supplied.startsWith("Bearer ") || supplied.length !== expected.length) return false;
  // Compare fixed-length SHA256 digests without early exit.
  const encode = (value: string) => new TextEncoder().encode(value);
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode(supplied)),
    crypto.subtle.digest("SHA-256", encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a[index]! ^ b[index]!;
  return mismatch === 0;
}

async function supabaseRows(env: Env, table: string, query: URLSearchParams): Promise<unknown[]> {
  // The path is controlled by this Worker; never proxy arbitrary user URLs.
  const url = new URL("/rest/v1/" + table, env.SUPABASE_URL);
  url.search = query.toString();
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = new Headers({
    "apikey": key, "accept": "application/json", "cache-control": "no-store",
  });
  if (!key.startsWith("sb_secret_")) headers.set("authorization", "Bearer " + key);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error("Supabase read failed with HTTP " + response.status);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Unexpected Supabase response");
  return data;
}

async function sourceBook(env: Env, bookId: string): Promise<PublishedBook> {
  const query = new URLSearchParams({
    select: "id,status,content_classification,source_language,source_version,total_chunks",
    id: "eq." + bookId, limit: "1",
  });
  const rows = await supabaseRows(env, "books", query);
  const row = rows[0] as Partial<PublishedBook> | undefined;
  // Pilot is deliberately restricted to published, ordinary literary texts.
  if (!row || row.id !== bookId || row.status !== "published" ||
      row.content_classification !== "general" ||
      typeof row.source_language !== "string" ||
      row.source_language.length === 0 ||
      !Number.isSafeInteger(row.source_version) ||
      !Number.isSafeInteger(row.total_chunks) ||
      (row.total_chunks ?? 0) <= 0 || (row.total_chunks ?? 0) > MAX_CHUNKS) {
    throw new Error("Edition is not an eligible complete published book");
  }
  return row as PublishedBook;
}

async function sourceChunks(env: Env, book: PublishedBook): Promise<ArchivedChunk[]> {
  const result: ArchivedChunk[] = [];
  let bytes = 0;
  for (let offset = 0; offset < MAX_CHUNKS; offset += PAGE_SIZE) {
    const query = new URLSearchParams({
      select: "chunk_index,content",
      book_id: "eq." + book.id,
      language: "eq." + book.source_language,
      source_version: "eq." + book.source_version,
      status: "eq.published", order: "chunk_index.asc",
      offset: String(offset), limit: String(PAGE_SIZE),
    });
    const page = await supabaseRows(env, "book_chunks", query);
    for (const raw of page) {
      const row = raw as Record<string, unknown>;
      const index = row["chunk_index"];
      const content = row["content"];
      // The migration refuses incomplete or reordered content rather than
      // making an attractive but truncated book appear safe to delete.
      if (typeof index !== "number" || index !== result.length ||
          typeof content !== "string") {
        throw new Error("Source chunks are incomplete, duplicated or unordered");
      }
      bytes += new TextEncoder().encode(content).byteLength;
      if (bytes > MAX_BYTES) throw new Error("Source archive exceeds migration memory budget");
      result.push({ chunk_index: index, content });
    }
    if (page.length < PAGE_SIZE) break;
  }
  if (result.length !== book.total_chunks) {
    throw new Error("Book chunk count differs from published edition metadata");
  }
  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isConfigured(env)) return reply({ error: "R2 migrator not configured" }, 503);
    if (!await authorized(request, env)) return reply({ error: "Unauthorized" }, 401);
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    const path = new URL(request.url).pathname;
    if (path !== "/mirror" && path !== "/activate") return reply({ error: "Not found" }, 404);

    // Fail closed on untrusted arguments and avoid logging source text.
    let input: Record<string, unknown>;
    try {
      if (Number(request.headers.get("content-length") ?? "0") > 4096) {
        return reply({ error: "Body too large" }, 413);
      }
      const body = await request.text();
      if (body.length > 4096) return reply({ error: "Body too large" }, 413);
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return reply({ error: "Expected object" }, 400);
      }
      input = parsed as Record<string, unknown>;
    } catch {
      return reply({ error: "Malformed JSON" }, 400);
    }
    const bookId = input["bookId"];
    if (typeof bookId !== "string" || !UUID.test(bookId)) {
      return reply({ error: "Invalid book id" }, 400);
    }

    try {
      const book = await sourceBook(env, bookId);
      const identity: EditionIdentity = {
        bookId: book.id, language: book.source_language, sourceVersion: book.source_version,
      };
      const rows = await sourceChunks(env, book);
      const proof = await writeVerifiedBookArchive(env.SEEPARAH_BOOK_ARCHIVE, identity, rows);
      if (path === "/activate") {
        if (input["approval"] !== "ACTIVATE_VERIFIED_R2_ARCHIVE" ||
            input["expectedSha256"] !== proof.sha256) {
          return reply({ error: "Explicit matching checksum and activation approval required" }, 409);
        }
        // The source was read again before activation, verifying that R2
        // still agrees byte-for-byte with the published Postgres edition.
        await activateVerifiedBookArchive(env.SEEPARAH_BOOK_ARCHIVE, identity, proof.sha256);
      }
      return reply({
        bookId, sourceVersion: identity.sourceVersion, language: identity.language,
        sha256: proof.sha256, chunkCount: proof.chunks,
        archiveKey: proof.key, activated: path === "/activate",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown migration failure";
      console.error("[r2-migration] safe fail", bookId, message);
      // Don't leak internal Supabase errors to unauthenticated callers.
      return reply({ error: "R2 copy or validation failed; see Worker logs" }, 422);
    }
  },
};
