// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  token: vi.fn(async () => "synthetic-never-production-token"),
  rights: vi.fn(async (_payload: unknown) => ({})),
  edition: vi.fn(async () => ({})),
  quality: vi.fn(async () => ({})),
  acknowledge: vi.fn(async () => ({})),
}));
vi.mock("@/lib/admin/use-admin-session", () => ({ getAccessToken: actions.token }));
vi.mock("@/lib/admin/catalog.functions", () => ({
  adminReviewBookRights: actions.rights,
  adminReviewBookEdition: actions.edition,
  adminReviewBookReaderQuality: actions.quality,
  adminAcknowledgeBookRightsSignals: actions.acknowledge,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AdminBookReviewPanels } from "./AdminBookReviewPanels";

const book = {
  status: "in_review", rights_status: "pending", rights_basis: "Verified source",
  rights_evidence_url: "https://example.test/rights",
  source_url: "https://example.test/manuscript",
  attribution: "Original source", translation_permission: false,
  permitted_territories: [], rights_risk_acknowledged_at: null,
  edition_review_status: "pending", total_chunks: 8,
  available_languages: ["English"],
  review_notes: null,
};
const busy = vi.fn(async (fn: () => Promise<void>) => { await fn(); });
const openEdit = vi.fn();
function view(props: Record<string, unknown> = {}) {
  render(<AdminBookReviewPanels
    book={book as never}
    bookId="synthetic-book-id"
    rightsSignals={[]}
    rightsRiskReviewed
    readerV2SchemaAvailable={false}
    canReview
    busy={false}
    notes="Human reviewer proof"
    openRightsEdit={openEdit}
    withBusy={busy}
    {...props}
  />);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("SP-04/14/36 guarded admin rights and edition reviewer extraction", () => {
  it("exposes source evidence without authorizing edits when role lacks catalog.review", () => {
    view({canReview:false});
    expect(screen.getByText("Rights & provenance")).toBeTruthy();
    expect(screen.getByText("Edition quality review")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve rights" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve edition" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit rights" })).toBeNull();
    expect(actions.rights).not.toHaveBeenCalled();
  });
  it("blocks rights approval until human risk clues acknowledged", () => {
    view({ rightsRiskReviewed:false, rightsSignals:[{ label:"Rights clue",chunkIndex:0,snippet:"Requires human review" }] });
    expect((screen.getByRole("button", { name: "Approve rights" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "I reviewed these clues" })).toBeTruthy();
  });
  it("stays review-only for published book rights", () => {
    view({book:{...book,status:"published"} as never});
    expect((screen.getByRole("button", { name: "Edit rights" }) as HTMLButtonElement).disabled).toBe(true);
    expect(openEdit).not.toHaveBeenCalled();
  });
  it("passes the chosen human decision to the existing MFA-guarded server function", async () => {
    view();
    fireEvent.click(screen.getByRole("button", {name:"Approve rights"}));
    await waitFor(() => expect(actions.rights).toHaveBeenCalledTimes(1));
    expect(actions.rights.mock.calls[0][0]).toEqual({
      data:{ accessToken:"synthetic-never-production-token",bookId:"synthetic-book-id",
        decision:"approved",notes:"Human reviewer proof" },
    });
    expect(busy).toHaveBeenCalledTimes(1);
    expect(actions.edition).not.toHaveBeenCalled();
  });
});
