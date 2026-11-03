// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/library">{children}</a>,
}));
vi.mock("@/components/ShelfButtons", () => ({
  ShelfButtons: ({ bookId }: { bookId: string }) => <span data-testid="shelf-buttons">{bookId}</span>,
}));
import { BookReaderTopbar } from "./BookReaderTopbar";
import { BookReaderBottomBar } from "./BookReaderBottomBar";
import { BookReaderFinishDialog } from "./BookReaderFinishDialog";

const onContents = vi.fn();
const onBackToReading = vi.fn();
const onLanguageChange = vi.fn();
const onHighlight = vi.fn();
const onOpenSettings = vi.fn();
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function drawTopbar(canReturnToReading = false) {
  render(<BookReaderTopbar
    title="Verified reader title" pageLabel="Page 15 of 100"
    language="English" availableLanguages={["English", "Urdu"]}
    bookId="book-1" canReturnToReading={canReturnToReading}
    progress={15} onLanguageChange={onLanguageChange}
    onBackToReading={onBackToReading} onContents={onContents}
    onHighlight={onHighlight} onOpenSettings={onOpenSettings}
  />);
}
describe("SP-36 modular reader chrome preserves source actions and accessible navigation", () => {
  it("keeps the accessible toolbar, source selector and user-owned callbacks intact", () => {
    drawTopbar();
    expect(screen.getByRole("link", { name: /Library/i })).toBeTruthy();
    expect(screen.getByText("Verified reader title")).toBeTruthy();
    expect(screen.getByTestId("shelf-buttons").textContent).toBe("book-1");
    fireEvent.change(screen.getByRole("combobox", { name: "Reading language" }), { target: { value: "Urdu" } });
    expect(onLanguageChange).toHaveBeenCalledWith("Urdu");
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    expect(onContents).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Highlight selection" }));
    expect(onHighlight).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Reader settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
  it("keeps a dedicated return-to-reading control after opening contents", () => {
    drawTopbar(true);
    expect(screen.queryByRole("button", { name: "Contents" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to reading position" }));
    expect(onBackToReading).toHaveBeenCalledTimes(1);
    expect(onContents).not.toHaveBeenCalled();
  });
  it("keeps keyboard-safe page boundary navigation and explicit finish", () => {
    const prev = vi.fn(), next = vi.fn(), finish = vi.fn();
    const { rerender } = render(<BookReaderBottomBar
      atBeginning atEnd={false} pageLabel="Page 1 of 15"
      onPrevious={prev} onNext={next} onFinish={finish}
    />);
    const first = screen.getByRole("button", { name: /Previous/ }) as HTMLButtonElement;
    expect(first.disabled).toBe(true);
    fireEvent.click(first);
    expect(prev).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(next).toHaveBeenCalledTimes(1);
    rerender(<BookReaderBottomBar
      atBeginning={false} atEnd pageLabel="Page 15 of 15"
      onPrevious={prev} onNext={next} onFinish={finish}
    />);
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(finish).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
  it("shows completion with a named dialog and preserves Keep reading as reversible", () => {
    const onClose = vi.fn();
    render(<BookReaderFinishDialog title="Verified reader title" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Finished" });
    expect(dialog.textContent).toContain("Verified reader title");
    fireEvent.click(screen.getByRole("button", { name: "Keep reading" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back to library" })).toBeTruthy();
  });
});
