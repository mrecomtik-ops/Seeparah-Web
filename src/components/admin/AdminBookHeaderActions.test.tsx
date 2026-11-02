// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminBookHeaderActions } from "./AdminBookHeaderActions";

const preview = vi.fn(async () => {});
const edit = vi.fn();
const archive = vi.fn();
const permanent = vi.fn(async () => {});
function view(role: "owner" | "administrator" | "editor" | "support" | null, status = "archived") {
  render(<AdminBookHeaderActions
    role={role} status={status}
    onPreview={preview} onEdit={edit}
    onArchive={archive} onPermanentDelete={permanent}
  />);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SP-04/14 owner-editor-support admin actions", () => {
  it("allows owner and administrator only to open irreversible deletion on eligible book", () => {
    view("owner");
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(permanent).toHaveBeenCalledTimes(1);
    cleanup();
    view("administrator", "unpublished");
    expect(screen.getByRole("button", { name: "Delete permanently" })).toBeTruthy();
  });
  it("rejects permanent delete action for still-published or in-review book", () => {
    view("owner", "published");
    expect(screen.queryByRole("button", { name: "Delete permanently" })).toBeNull();
    cleanup();
    view("owner", "in_review");
    expect(screen.queryByRole("button", { name: "Delete permanently" })).toBeNull();
  });
  it("keeps editor's reversible review/edit capabilities but never exposes irreversible deletion", () => {
    view("editor");
    expect(screen.queryByRole("button", { name: "Delete permanently" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(edit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Preview book" }));
    expect(preview).toHaveBeenCalledTimes(1);
  });
  it("does not render privileged controls for support or unassigned roles", () => {
    view("support");
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    view(null);
    expect(screen.queryByRole("button")).toBeNull();
    expect(permanent).not.toHaveBeenCalled();
  });
  it("keeps reversible archive separate from permanent delete", () => {
    view("editor", "published");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(archive).toHaveBeenCalledTimes(1);
    expect(permanent).not.toHaveBeenCalled();
  });
});
