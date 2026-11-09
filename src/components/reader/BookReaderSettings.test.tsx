// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BookReaderSettings, type BookReaderSettingsProps } from "./BookReaderSettings";

vi.mock("@/components/ShelfButtons", () => ({
  ShelfButtons: () => <span data-testid="shelf-controls">Library shelves</span>,
}));

const callbacks = {
  onClose: vi.fn(), onLanguageChange: vi.fn(), onFontSizeChange: vi.fn(),
  onTypefaceChange: vi.fn(), onLineSpacingChange: vi.fn(), onTextMeasureChange: vi.fn(),
  onRequestLanguageChange: vi.fn(), onTranslationRequest: vi.fn(), onThemeChange: vi.fn(),
};
const props: BookReaderSettingsProps = {
  book: { id: "book-1", available_languages: ["English", "Urdu"] },
  language: "English", fontSizeDraft: 18, typeface: "literary",
  lineSpacing: 1.5, textMeasure: "medium",
  requestableLanguages: ["Hindi"], requestLanguage: "Hindi",
  requestingTranslation: false, translationRequestStatus: null, theme: "light", ...callbacks,
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SP-36 extracted book-reader settings controls", () => {
  it("delegates layout/position state only through the parent's callbacks", () => {
    render(<BookReaderSettings {...props} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "20" } });
    expect(callbacks.onFontSizeChange).toHaveBeenCalledWith(20);
    fireEvent.change(screen.getByRole("combobox", { name: "Line spacing" }), {
      target: { value: "1.8" },
    });
    expect(callbacks.onLineSpacingChange).toHaveBeenCalledWith(1.8);
    fireEvent.click(screen.getByRole("button", { name: "serif" }));
    expect(callbacks.onTypefaceChange).toHaveBeenCalledWith("serif");
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    expect(callbacks.onTextMeasureChange).toHaveBeenCalledWith("wide");
    fireEvent.click(screen.getByRole("button", { name: "sepia reading theme" }));
    expect(callbacks.onThemeChange).toHaveBeenCalledWith("sepia");
  });
  it("routes user events without initiating an unapproved translation", () => {
    render(<BookReaderSettings {...props} />);
    expect(callbacks.onTranslationRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Request" }));
    expect(callbacks.onTranslationRequest).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });
  it("shows active theme and prevents duplicate requests", () => {
    render(<BookReaderSettings {...props} theme="dark" translationRequestStatus="approved_awaiting_edition" />);
    expect(screen.getByRole("button", { name: "dark reading theme" }).getAttribute("aria-pressed")).toBe("true");
    const button = screen.getByRole("button", { name: "Recorded" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("approved awaiting edition");
  });
  it("keeps a pending translation request disabled", () => {
    render(<BookReaderSettings {...props} requestingTranslation />);
    expect((screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
