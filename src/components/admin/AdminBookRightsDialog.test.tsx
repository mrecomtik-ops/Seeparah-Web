// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { AdminBookRightsDialog, type RightsEditorDraft } from "./AdminBookRightsDialog";

const onSave = vi.fn(async () => {});
const onClose = vi.fn();
const initial: RightsEditorDraft = {
  rightsBasis: "", rightsEvidenceUrl: "", sourceUrl: "", attribution: "",
  permittedTerritories: "", translationPermission: false,
};
function Harness() {
  const [rightsDraft, setRightsDraft] = useState(initial);
  return <AdminBookRightsDialog
    rightsDraft={rightsDraft} setRightsDraft={setRightsDraft}
    busy={false} onSave={onSave} onClose={onClose}
  />;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SP-36 separate, evidence-gated rights form", () => {
  it("does not approve or save rights by changing the draft", () => {
    render(<Harness />);
    const save = screen.getByRole("button", { name: "Save rights information" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Explain what establishes permission/i), {
      target: { value: "Verified exact-edition permission record" },
    });
    expect(save.disabled).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it("preserves explicit translation-permission choice and cancellation", () => {
    render(<Harness />);
    const checkbox = screen.getByRole("checkbox", { name: /Translation permission is documented/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
