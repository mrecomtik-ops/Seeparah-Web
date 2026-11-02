import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, writeDeviceRows, readDeviceRows, selectByUser } = vi.hoisted(() => ({
  upsert: vi.fn(),
  writeDeviceRows: vi.fn(),
  readDeviceRows: vi.fn(),
  selectByUser: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ upsert, select: () => ({ eq: selectByUser }) }) },
}));
vi.mock("@/lib/library", () => ({ DEMO_USER_ID: "demo-reader" }));
vi.mock("@/lib/data", () => ({
  demoStore: {
    getShelves: readDeviceRows,
    setShelves: writeDeviceRows,
  },
}));

const { toggleShelf, listShelves, dedupeShelfRows } = await import("./shelves");

beforeEach(() => {
  upsert.mockReset();
  writeDeviceRows.mockClear();
  readDeviceRows.mockReset().mockReturnValue([]);
  selectByUser.mockReset();
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


describe("SP-33 account shelf reconciliation and offline fallback", () => {
  const item = (id: string, shelf: "saved" | "favorite") => ({
    id, user_id: "reader1", book_id: "book1", shelf, created_at: "2026-01-01T00:00:00Z",
  });
  it("trusts a successful server response over outdated device memberships", async () => {
    readDeviceRows.mockReturnValue([item("stale-local", "saved")]);
    selectByUser.mockResolvedValue({ data: [item("server", "favorite")], error: null });
    const rows = await listShelves("reader1");
    expect(selectByUser).toHaveBeenCalledWith("user_id", "reader1");
    expect(rows.map((row) => row.id)).toEqual(["server"]);
    expect(writeDeviceRows).not.toHaveBeenCalled();
  });
  it("retains the current device memberships when account service is offline", async () => {
    readDeviceRows.mockReturnValue([item("local", "saved")]);
    selectByUser.mockResolvedValue({ data: null, error: { message: "network unavailable" } });
    expect((await listShelves("reader1")).map((row) => row.id)).toEqual(["local"]);
  });
  it("deduplicates server retries without collapsing independent shelf flags", async () => {
    selectByUser.mockResolvedValue({
      data: [item("one", "saved"), item("duplicate", "saved"), item("other", "favorite")],
      error: null,
    });
    expect((await listShelves("reader1")).map((row) => row.id)).toEqual(["one", "other"]);
  });
});
