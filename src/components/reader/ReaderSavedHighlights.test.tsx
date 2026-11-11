// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Highlight } from "@/lib/data";
import { ReaderSavedHighlights } from "./ReaderSavedHighlights";

const record: Highlight = {
  id: "highlight-1",
  user_id: "reader-1",
  book_id: "book-1",
  language: "English",
  chunk_index: 3,
  highlight_text: "An exact passage that I saved",
  start_offset: 12,
  end_offset: 42,
  note: "An important point",
  created_at: "2026-11-09T08:00:00.000Z",
};

afterEach(cleanup);

describe("saved highlights visible while reading", () => {
  it("shows the empty state with accessible dismiss control", () => {
    const close = vi.fn();
    render(<ReaderSavedHighlights highlights={[]} language="English" onClose={close} onJump={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Saved highlights" })).toBeTruthy();
    expect(screen.getByText("No highlights yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close saved highlights" }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("lists exact saved excerpts and returns to their original source on click", () => {
    const jump = vi.fn();
    render(<ReaderSavedHighlights highlights={[record]} language="English" onClose={vi.fn()} onJump={jump} />);
    expect(screen.getByText(record.highlight_text)).toBeTruthy();
    expect(screen.getByText("Note: An important point")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Go to saved highlight:/ }));
    expect(jump).toHaveBeenCalledTimes(1);
    expect(jump).toHaveBeenCalledWith(record);
  });
  it("shows source-linked chapter titles instead of raw section numbers", () => {
    const inChapter = { ...record, chunk_index: 24 };
    render(<ReaderSavedHighlights
      highlights={[inChapter]} language="English" onClose={vi.fn()} onJump={vi.fn()}
      chapters={[{ title: "CHAPTER I", startChunkIndex: 0 },
        { title: "CHAPTER III", startChunkIndex: 20 }]}
    />);
    expect(screen.getByText(/CHAPTER III/)).toBeTruthy();
    expect(screen.queryByText(/Source section 25/)).toBeNull();
  });
});
