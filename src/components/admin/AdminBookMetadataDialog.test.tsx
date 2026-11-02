// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdminBookMetadataDialog } from "./AdminBookMetadataDialog";

const noop = vi.fn();
const props = {
  editOpen: true,
  editDraft: {
    title: "Test Edition", author: "Author", description: "Description",
    genre: "", coverUrl: "", editionTitle: "", editionYear: "",
    publisher: "", isbn: "", sourceScanId: "", originalPublicationYear: "",
  },
  setEditDraft: noop,
  book: {
    source_edition_id: "English-001", source_scan_id: null, edition_title: "Sourced Book",
    source_language: "English", available_languages: ["English", "Urdu"],
  },
  editions: [
    { language: "English", source_edition_id: "English-001" },
    { language: "Urdu", source_edition_id: "Urdu-001" },
  ],
  busy: false, canPublish: true,
  coverPreviewFailed: false, setCoverPreviewFailed: noop,
  coverAttribution: "Authorized cover artist", setCoverAttribution: noop,
  coverTargetLanguage: "English", setCoverTargetLanguage: noop,
  stagedEditionCover: {
    language: "Urdu", sourceEditionId: "Urdu-001", path: "editorial/book/urdu.jpg",
    url: "https://example.test/cover.jpg", attribution: "Artist", sharedArtwork: false,
  },
  setStagedEditionCover: noop,
  coverSharedArtwork: false, setCoverSharedArtwork: noop,
  coverUploading: false, selectedCoverFile: null, setSelectedCoverFile: noop,
  selectedCoverPreview: "", cropToPortrait: false, setCropToPortrait: noop,
  cropFocusX: 50, setCropFocusX: noop, cropFocusY: 50, setCropFocusY: noop,
  readerV2SchemaAvailable: true, stageCoverFile: vi.fn(async () => {}),
  assignStagedEditionCover: vi.fn(async () => {}),
  setEditOpen: noop, saveEdit: vi.fn(async () => {}),
};
afterEach(cleanup);

describe("SP-14/36 extracted editor presentation", () => {
  it("renders exact edition provenance and blocks assignment across languages", () => {
    render(<AdminBookMetadataDialog {...props} />);
    expect(screen.getByRole("dialog", { name: "Edit metadata" })).toBeTruthy();
    expect(screen.getByText("English-001")).toBeTruthy();
    const assign = screen.getByRole("button", { name: /Assign to this verified edition/i }) as HTMLButtonElement;
    expect(assign.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/Select Urdu/i);
    expect(props.assignStagedEditionCover).not.toHaveBeenCalled();
  });
  it("does not render the editor when it is closed", () => {
    render(<AdminBookMetadataDialog {...props} editOpen={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
