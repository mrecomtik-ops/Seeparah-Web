// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminBookSourceEditPanel } from "./AdminBookSourceEditPanel";

const onLoadChunk = vi.fn(async () => {});
const onStageEdit = vi.fn(async () => {});
const onPublishEdit = vi.fn(async () => {});
const onDiscardEdit = vi.fn(async () => {});
const onEditorLanguageChange = vi.fn();
const onEditorChunkIndexChange = vi.fn();
const onEditorDraftChange = vi.fn();
const props = {
  totalChunks: 3, allLanguages: ["Arabic", "English"],
  editorLanguage: "Arabic", editorChunkIndex: 0, editorLoading: false,
  editorContent: "Verified original text", editorPending: null,
  editorDraft: "Verified original text", busy: false,
  onEditorLanguageChange, onEditorChunkIndexChange, onEditorDraftChange,
  onLoadChunk, onStageEdit, onPublishEdit, onDiscardEdit,
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("SP-36 exact-source human editing workflow", () => {
  it("cannot stage an unchanged source and never publishes on panel open", () => {
    render(<AdminBookSourceEditPanel {...props} />);
    expect((screen.getByRole("button", { name: "Stage edit" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onPublishEdit).not.toHaveBeenCalled();
  });
  it("keeps staging distinct from publishing an existing pending edit", () => {
    render(<AdminBookSourceEditPanel {...props} editorDraft="Human reviewed change"
      editorPending={{ at: "2026-11-02T08:00:00Z" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Stage edit" }));
    expect(onStageEdit).toHaveBeenCalledTimes(1);
    expect(onPublishEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish staged edit" }));
    expect(onPublishEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Discard staged edit" }));
    expect(onDiscardEdit).toHaveBeenCalledTimes(1);
  });
  it("lets a reviewer choose exact language and chunk, without silently saving", () => {
    render(<AdminBookSourceEditPanel {...props} editorContent={null} />);
    fireEvent.change(screen.getByRole("combobox", { name: /Language/i }), { target: { value: "English" } });
    expect(onEditorLanguageChange).toHaveBeenCalledWith("English");
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(onLoadChunk).toHaveBeenCalledTimes(1);
    expect(onStageEdit).not.toHaveBeenCalled();
  });
});
