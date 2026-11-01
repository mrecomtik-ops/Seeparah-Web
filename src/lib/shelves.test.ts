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

const { toggleShelf } = await import("./shelves");

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
