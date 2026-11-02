// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BookDeletionImpact } from "@/lib/admin/catalog.server";
import { AdminBookDestructiveDialogs, canConfirmPermanentDeletion } from "./AdminBookDestructiveDialogs";

const impact: BookDeletionImpact = {
  bookId: "book-1", title: "Read Only Book", status: "archived",
  chunkCount: 1, editionCount: 0, translationJobCount: 0,
  progressCount: 0, highlightCount: 0, shelfCount: 0,
  subscriptionCount: 0, translationRequestCount: 0,
  translationReportCount: 0, relatedSupportTicketCount: 0,
};
const onConfirmPermanent = vi.fn(async () => {});
const onConfirmArchive = vi.fn(async () => {});
function display(overrides: Partial<Parameters<typeof AdminBookDestructiveDialogs>[0]> = {}) {
  return render(<AdminBookDestructiveDialogs
    title="Read Only Book"
    deleteOpen={false}
    permDeleteOpen={true}
    busy={false}
    permDeleteImpact={impact}
    permDeleteConfirmText="Read Only Book"
    onChangeConfirmText={() => {}}
    onCloseArchive={() => {}}
    onClosePermanent={() => {}}
    onConfirmArchive={onConfirmArchive}
    onConfirmPermanent={onConfirmPermanent}
    {...overrides}
  />);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SP-04 permanent delete modal safety", () => {
  it("refuses without an exact reviewed title and archived status", () => {
    expect(canConfirmPermanentDeletion("Read Only Book", impact, "Read Only Book")).toBe(true);
    expect(canConfirmPermanentDeletion("Read Only Book", impact, "read only book")).toBe(false);
    expect(canConfirmPermanentDeletion("Read Only Book", { ...impact, status: "published" }, "Read Only Book")).toBe(false);
    expect(canConfirmPermanentDeletion("Read Only Book", null, "Read Only Book")).toBe(false);
  });
  it("disables delete while retained support tickets reference book", () => {
    display({ permDeleteImpact: { ...impact, relatedSupportTicketCount: 2 } });
    expect(screen.getByRole("dialog", { name: /Permanently delete/i })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/tickets still reference/i);
    const action = screen.getByRole("button", { name: "Permanently delete" }) as HTMLButtonElement;
    expect(action.disabled).toBe(true);
    fireEvent.click(action);
    expect(onConfirmPermanent).not.toHaveBeenCalled();
  });
  it("disables the destructive action for published status, absent impact, and busy state", () => {
    const { rerender } = display({ permDeleteImpact: { ...impact, status: "published" } });
    const btn = screen.getByRole("button", { name: "Permanently delete" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    rerender(<AdminBookDestructiveDialogs
      title="Read Only Book" deleteOpen={false} permDeleteOpen={true} busy={true}
      permDeleteImpact={impact} permDeleteConfirmText="Read Only Book"
      onChangeConfirmText={() => {}} onCloseArchive={() => {}}
      onClosePermanent={() => {}} onConfirmArchive={onConfirmArchive} onConfirmPermanent={onConfirmPermanent}
    />);
    expect(btn.disabled).toBe(true);
  });
  it("only allows explicitly confirmed eligible archived books", () => {
    display();
    const btn = screen.getByRole("button", { name: "Permanently delete" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onConfirmPermanent).toHaveBeenCalledTimes(1);
  });
  it("focuses Cancel, handles Escape, and keeps Tab within the dangerous dialog", () => {
    const onClosePermanent = vi.fn();
    display({ onClosePermanent });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    screen.getByRole("textbox").focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Permanently delete" }));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClosePermanent).toHaveBeenCalledTimes(1);
  });
  it("does not allow Escape while a destructive operation is busy", () => {
    const onClosePermanent = vi.fn();
    display({ onClosePermanent, busy: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClosePermanent).not.toHaveBeenCalled();
  });

  it("distinguishes reversible Archive from permanent deletion", () => {
    display({ deleteOpen: true, permDeleteOpen: false });
    expect(screen.getByRole("dialog", { name: /Delete.*Read Only Book/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete (archive)" }));
    expect(onConfirmArchive).toHaveBeenCalledTimes(1);
    expect(onConfirmPermanent).not.toHaveBeenCalled();
  });
});
