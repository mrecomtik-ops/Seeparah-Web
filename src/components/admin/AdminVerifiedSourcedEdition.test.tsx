// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdminVerifiedSourcedEdition } from "./AdminVerifiedSourcedEdition";

const update = vi.fn();
const draft = {
  language: "", provenanceType: "human_translation" as const,
  typographyProfile: "facsimile_preserving", editionTitle: "",
  translator: "", sourceUrl: "", sourceEditionId: "",
  rightsBasis: "", rightsEvidenceUrl: "", authenticityNotes: "",
  manuscriptText: "",
};
const base = {
  book: { content_classification: "religious", source_language: "Arabic", total_chunks: 2 },
  editions: [{ language: "Urdu" }], canManageTranslations: true,
  sourcedEditionOpen: true, setSourcedEditionOpen: update,
  sourcedEditionDraft: draft, setSourcedEditionDraft: update,
  sourcedEditionBusy: false, importSourcedEdition: vi.fn(async () => {}),
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("SP-36 sourced religious importer presentation", () => {
  it("only offers verified human/licensed/public domain paths, never AI translations", () => {
    render(<AdminVerifiedSourcedEdition {...base} />);
    expect(screen.getByText(/never use Seeparah AI translation/)).toBeTruthy();
    expect(screen.getByRole("option", { name: /Verified human translation/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Licensed translation/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Public-domain translation/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Urdu/ })).toBeTruthy(); // provenance/type option only? no duplicate source?
  });
  it("hides source-import controls for non-religious works or insufficient capability", () => {
    render(<AdminVerifiedSourcedEdition {...base} canManageTranslations={false} />);
    expect(screen.queryByRole("button", { name: /Verify & publish free sourced edition/ })).toBeNull();
  });
  it("prevents duplicate import action while a sourced edition is processing", () => {
    render(<AdminVerifiedSourcedEdition {...base} sourcedEditionBusy={true} />);
    const btn = screen.getByRole("button", { name: /Importing/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
