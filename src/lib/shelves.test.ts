import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, writeDeviceRows } = vi.hoisted(() => ({
  upsert: vi.fn(),
  writeDeviceRows: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ upsert }) },
}));
vi.mock("@/lib/library", () => ({ DEMO_USER_ID: "demo-reader" }));
vi.mock("@/lib/data", () => ({
  demoStore: {
    getShelves: () => [],
    setShelves: writeDeviceRows,
  },
}));

const { toggleShelf, dedupeShelfRows } = await import("./shelves");

beforeEach(() => {
  upsert.mockReset();
  writeDeviceRows.mockClear();
});

describe("shelf changes for authenticated readers", () => {
  it("throws on a remote write rejection rather than reporting a fake device-only save", async () => {
    upsert.mockResolvedValueOnce({ error: { message: "Database unavailable" } });
    await expect(toggleShelf("signed-in-user", "book-1", "saved", true))
      .rejects.toThrow("Could not save shelf changes to your account");
    expect(writeDeviceRows).not.toHaveBeenCalled();
  });
  it("persists via the real account when the database accepts it", async () => {
    upsert.mockResolvedValueOnce({ error: null });
    await toggleShelf("signed-in-user", "book-1", "favorite", true);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "signed-in-user", book_id: "book-1", shelf: "favorite" },
      { onConflict: "user_id,book_id,shelf" },
    );
    expect(writeDeviceRows).not.toHaveBeenCalled();
  });
});

describe("SP-33 independent memberships and legacy duplicates", () => {
  const make = (id: string, user: string, book: string, shelf: "saved"|"favorite"|"want_to_read") =>
    ({ id, user_id: user, book_id: book, shelf, created_at: "2026-01-01T00:00:00Z" });
  it("shows one per membership without erasing separate optional shelf flags", () => {
    const original = [
      make("a","reader1","book1","saved"),
      make("b","reader1","book1","favorite"),
      make("c","reader1","book1","saved"),
      make("d","reader1","book1","want_to_read"),
    ];
    expect(dedupeShelfRows(original).map((row) => row.id)).toEqual(["a","b","d"]);
    expect(original).toHaveLength(4);
  });
  it("does not merge different books or readers", () => {
    expect(dedupeShelfRows([
      make("a","reader1","book1","saved"),
      make("b","reader2","book1","saved"),
      make("c","reader1","book2","saved"),
    ])).toHaveLength(3);
  });
});
