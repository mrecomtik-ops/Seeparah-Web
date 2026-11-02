import { describe, expect, it } from "vitest";
import { lockStagedCoverReview, stagedCoverAssignment } from "./staged-cover";

const upload = {
  path: "staged/book-1/source-1/cover.jpg",
  url: "https://example.test/staged.jpg",
  language: "Urdu",
  sourceEditionId: "source-1",
};

describe("SP-14 source-edition cover staging provenance", () => {
  it("locks reviewed edition, attribution and shared-artwork status", () => {
    const staged = lockStagedCoverReview(upload, "  Original museum scan  ", false);
    let changedFormAttribution = "Unrelated stock image";
    let changedFormSharedArtwork = true;
    expect(changedFormAttribution).not.toBe(staged.attribution);
    expect(changedFormSharedArtwork).not.toBe(staged.sharedArtwork);
    expect(stagedCoverAssignment(staged, "Urdu")).toEqual({
      language: "Urdu",
      path: upload.path,
      attribution: "Original museum scan",
      sharedArtwork: false,
    });
  });
  it("never assigns staged Urdu artwork to a different language", () => {
    const staged = lockStagedCoverReview(upload, "Original museum scan", false);
    expect(() => stagedCoverAssignment(staged, "Arabic")).toThrow(/exact reviewed edition/i);
  });
  it("refuses a staging attribution with no meaningful source", () => {
    expect(() => lockStagedCoverReview(upload, "  ", false)).toThrow(/attribution/i);
  });
});
