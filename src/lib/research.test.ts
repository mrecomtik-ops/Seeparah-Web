import { describe, expect, it } from "vitest";
import { isEditableForRevision, matchesPaperSearch } from "@/lib/research";

describe("matchesPaperSearch — title/author/abstract/keyword search matching", () => {
  const paper = {
    title: "Reading Silence in Dickinson",
    author_name: "Amina Raza",
    abstract: "This paper examines how Emily Dickinson uses silence as a rhetorical device.",
    keywords: ["poetry", "Dickinson", "silence"],
  };

  it("matches a partial, case-different substring of the title", () => {
    expect(matchesPaperSearch(paper, "DICKINSON")).toBe(true);
    expect(matchesPaperSearch(paper, "silence in dick")).toBe(true);
  });

  it("matches the author name", () => {
    expect(matchesPaperSearch(paper, "raza")).toBe(true);
  });

  it("matches the abstract", () => {
    expect(matchesPaperSearch(paper, "rhetorical device")).toBe(true);
  });

  it("matches a keyword", () => {
    expect(matchesPaperSearch(paper, "silence")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesPaperSearch(paper, "quantum physics")).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesPaperSearch(paper, "  ")).toBe(true);
  });

  it("matches Urdu/Arabic text correctly — no per-script configuration needed", () => {
    expect(matchesPaperSearch({ ...paper, title: "خاموشی پر ایک مقالہ" }, "خاموشی")).toBe(true);
  });
});

describe("isEditableForRevision — which statuses let the author keep editing", () => {
  it("allows draft, submitted, and changes_requested — the original pre-review cycle", () => {
    expect(isEditableForRevision("draft")).toBe(true);
    expect(isEditableForRevision("submitted")).toBe(true);
    expect(isEditableForRevision("changes_requested")).toBe(true);
  });

  it("allows published — starting a revision must not require the live version to be taken down first", () => {
    expect(isEditableForRevision("published")).toBe(true);
  });

  it("refuses approved and rejected — unchanged, admin-action-pending terminal states", () => {
    expect(isEditableForRevision("approved")).toBe(false);
    expect(isEditableForRevision("rejected")).toBe(false);
  });
});
