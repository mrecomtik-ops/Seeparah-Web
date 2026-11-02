// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminBookReviewPreview } from "./AdminBookReviewPreview";

const load = vi.fn(async (_index: number) => {});
const close = vi.fn();
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show(index: number, loading = false) {
  render(<AdminBookReviewPreview
    title="Reviewed source" sourceLanguage="Arabic" totalChunks={3}
    previewChunkIndex={index} previewContent="Exact authored text"
    previewLoading={loading} onClose={close} onLoadChunk={load} />);
}
describe("SP-36 read-only source preview separation", () => {
  it("does not modify source while browsing exact numbered pages", () => {
    show(1);
    expect(screen.getByText(/Page 2 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(load.mock.calls).toEqual([[0], [2]]);
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("disables navigation during loading or at first boundary", () => {
    show(0, true);
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
