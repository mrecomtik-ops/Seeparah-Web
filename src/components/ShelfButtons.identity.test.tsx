// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({ userId: "reader-one", loading: false }));
const listShelves = vi.hoisted(() => vi.fn());
const toggleShelf = vi.hoisted(() => vi.fn());
vi.mock("@/lib/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/shelves", () => ({
  listShelves: (...args: unknown[]) => listShelves(...args),
  toggleShelf: (...args: unknown[]) => toggleShelf(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { ShelfButtons } = await import("./ShelfButtons");
function draw(client: QueryClient) {
  return render(<QueryClientProvider client={client}><ShelfButtons bookId="book-1" /></QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.userId = "reader-one";
  auth.loading = false;
});
describe("SP-33 authenticated shelf identity and reconnection integration", () => {
  it("switches query identities without leaking the previous signed-in reader's saved flags", async () => {
    listShelves.mockImplementation(async (user: string) =>
      user === "reader-one"
        ? [{ user_id: user, book_id: "book-1", shelf: "saved" }]
        : []);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const result = draw(client);
    await screen.findByRole("button", { name: "Remove saved book" });
    auth.userId = "reader-two";
    result.rerender(<QueryClientProvider client={client}>
      <ShelfButtons bookId="book-1" />
    </QueryClientProvider>);
    await screen.findByRole("button", { name: "Save book" });
    expect(listShelves).toHaveBeenCalledWith("reader-two");
    expect(client.getQueryData(["shelves", "reader-one"])).toBeDefined();
    expect(client.getQueryData(["shelves", "reader-two"])).toEqual([]);
  });
  it("reconciles a changed server shelf response when the current identity refetches", async () => {
    listShelves.mockResolvedValueOnce([{ user_id: "reader-one", book_id: "book-1", shelf: "saved" }])
      .mockResolvedValueOnce([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    draw(client);
    await screen.findByRole("button", { name: "Remove saved book" });
    await client.invalidateQueries({ queryKey: ["shelves", "reader-one"] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save book" })).toBeTruthy());
    expect(listShelves).toHaveBeenCalledTimes(2);
  });
});
