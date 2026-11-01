// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const listShelves = vi.fn(async () => [] as Array<{book_id: string; shelf: "saved"|"favorite"|"want_to_read"}>);
const toggleShelf = vi.fn(async (_id: string, _book: string, _shelf: string, _on: boolean) => undefined);
const success = vi.fn();
const error = vi.fn();
vi.mock("@/lib/shelves", () => ({
  listShelves: (...args: []) => listShelves(...args),
  toggleShelf: (...args: [string,string,string,boolean]) => toggleShelf(...args),
}));
vi.mock("@/lib/use-auth", () => ({
  useAuth: () => ({ userId: "demo-reader", loading: false }),
}));
vi.mock("sonner", () => ({ toast: { success: (...args: string[]) => success(...args),
  error: (...args: string[]) => error(...args) } }));

const { ShelfButtons } = await import("./ShelfButtons");

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <ShelfButtons bookId="book-1" showLabels />
  </QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  listShelves.mockReset();
  listShelves.mockResolvedValue([]);
  toggleShelf.mockReset();
  toggleShelf.mockResolvedValue(undefined);
  success.mockClear();
  error.mockClear();
});

describe("One primary shelf action with optional lists", () => {
  it("does not expose three competing main shelf buttons", async () => {
    show();
    await screen.findByRole("button", { name: "Save book" });
    expect(screen.getByText("More shelf options")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add to favorites" })).toBeNull();
    fireEvent.click(screen.getByText("More shelf options"));
    expect(screen.getByRole("button", { name: "Add to favorites" })).toBeTruthy();
  });
  it("confirms saving only after the server mutation succeeds", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Save book" }));
    await waitFor(() => expect(toggleShelf).toHaveBeenCalledWith("demo-reader", "book-1", "saved", true));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Saved to your library"));
  });
  it("does not falsely announce success on a failed remote write", async () => {
    toggleShelf.mockRejectedValueOnce(new Error("Account write failed"));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Save book" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Account write failed"));
    expect(success).not.toHaveBeenCalled();
  });
});
