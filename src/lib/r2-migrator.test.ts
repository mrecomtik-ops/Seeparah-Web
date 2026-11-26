import { afterEach, describe, expect, it, vi } from "vitest";
import migrator from "../../workers/r2-migrator/worker";
import { bookActivationKey, type PrivateArchiveBucket } from "./r2-book-archive.server";

const id = "be708b0b-52db-45e8-a76a-299602d17e92";
const identity = { bookId: id, language: "English", sourceVersion: 1 };
const token = "test-secret-not-for-production-use";
const chunks = [
  { chunk_index: 0, content: "First page" },
  { chunk_index: 1, content: "Exact second page" },
];

function fixture() {
  const objects = new Map<string, string>();
  const bucket: PrivateArchiveBucket = {
    async get(key) {
      const data = objects.get(key);
      return data === undefined ? null : { text: async () => data };
    },
    async put(key, value) { objects.set(key, value); return {}; },
  };
  const env = {
    SEEPARAH_BOOK_ARCHIVE: bucket,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_dummy-test-only",
    MIGRATION_ADMIN_TOKEN: token,
  };
  return { objects, env };
}

function mockDatabase(status = "published") {
  vi.stubGlobal("fetch", vi.fn(async (value: URL) => {
    const url = new URL(value.toString());
    if (url.pathname === "/rest/v1/books") {
      return Response.json([{
        id, status, content_classification: "general", source_language: "English",
        source_version: 1, total_chunks: 2,
      }]);
    }
    if (url.pathname === "/rest/v1/book_chunks") {
      const offset = Number(url.searchParams.get("offset") ?? "0");
      return Response.json(offset === 0 ? chunks : []);
    }
    throw new Error("Unexpected database request");
  }));
}

function request(path: string, body: unknown, bearer = token) {
  return new Request("https://example.workers.dev" + path, {
    method: "POST", headers: {
      authorization: "Bearer " + bearer,
      "content-type": "application/json",
    }, body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Safe R2 mirror Worker", () => {
  it("requires a separate operator token, never returns content", async () => {
    const { env } = fixture();
    const response = await migrator.fetch(request("/mirror", { bookId: id }, "wrong"), env);
    expect(response.status).toBe(401);
  });

  it("mirrors and verifies without activating, then needs exact approval", async () => {
    const { env, objects } = fixture();
    mockDatabase();
    const mirrored = await migrator.fetch(request("/mirror", { bookId: id }), env);
    expect(mirrored.status).toBe(200);
    const proof = await mirrored.json() as {
      sha256: string; chunkCount: number; activated: boolean;
    };
    expect(proof.chunkCount).toBe(2);
    expect(proof.activated).toBe(false);
    expect(objects.has(bookActivationKey(identity))).toBe(false);
    const refused = await migrator.fetch(request("/activate", {
      bookId: id, expectedSha256: proof.sha256,
    }), env);
    expect(refused.status).toBe(409);
    const activated = await migrator.fetch(request("/activate", {
      bookId: id, expectedSha256: proof.sha256,
      approval: "ACTIVATE_VERIFIED_R2_ARCHIVE",
    }), env);
    expect(activated.status).toBe(200);
    expect(objects.has(bookActivationKey(identity))).toBe(true);
    // The migrator never deletes a database row or exposes a public object.
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.every(
      ([url]: [URL]) => String(url).includes("supabase.co"))).toBe(true);
  });

  it("refuses migration of unpublished books", async () => {
    const { env, objects } = fixture();
    mockDatabase("in_review");
    const response = await migrator.fetch(request("/mirror", { bookId: id }), env);
    expect(response.status).toBe(422);
    expect(objects.size).toBe(0);
  });
});
