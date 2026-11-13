import { describe, expect, it } from "vitest";
import {
  auditGutenbergSourceChapterMarkers,
  countSourceChapterHeadings,
} from "./gutenberg-fast-import.server";

const chapters = ["CHAPTER I.", "CHAPTER II.", "CHAPTER III.", "CHAPTER IV."];
const titles = chapters.map(title => ({ title }));
const narrative = "The original story continues here, and all of its text is retained. ".repeat(9);
function sourceWithContents() {
  return ["CONTENTS", chapters.join("\n"), "INTRODUCTION",
    "An opening preface is preserved in the source. ".repeat(8),
    ...chapters.map(heading => heading + "\n\n" + narrative),
  ].join("\n\n");
}

describe("Gutenberg physical chapter markers vs printed contents", () => {
  it("recognizes a verified duplicated printed contents list, not 8 actual chapters", () => {
    const source = sourceWithContents();
    expect(countSourceChapterHeadings(source)).toBe(8);
    expect(auditGutenbergSourceChapterMarkers(source, titles)).toEqual({
      rawChapterMarkers: 8,
      bodyChapterMarkers: 4,
      printedContentsEntries: 4,
    });
  });

  it("holds for review if a chapter is missing from the *body*, even when its title is in the contents", () => {
    const source = sourceWithContents().replace(
      "CHAPTER III.\n\n" + narrative,
      "ABSENT THIRD CHAPTER\n\n" + narrative,
    );
    expect(auditGutenbergSourceChapterMarkers(source, titles).bodyChapterMarkers).toBe(7);
    expect(auditGutenbergSourceChapterMarkers(source, titles).printedContentsEntries).toBe(0);
  });

  it("never suppresses actual chapters without an explicit printed contents list", () => {
    const source = sourceWithContents().replace(/^CONTENTS\n\n/, "INTRODUCTION\n\n");
    expect(auditGutenbergSourceChapterMarkers(source, titles).bodyChapterMarkers).toBe(8);
    expect(auditGutenbergSourceChapterMarkers(source, titles).printedContentsEntries).toBe(0);
  });

  it("does not hide a mismatch between printed contents and actual source chapter numbering", () => {
    const source = sourceWithContents().replace(
      "CHAPTER II.\nCHAPTER III.",
      "CHAPTER II.\nCHAPTER IX.",
    );
    expect(auditGutenbergSourceChapterMarkers(source, titles).bodyChapterMarkers).toBe(8);
  });

  it("still blocks when the parsed book misses a real chapter", () => {
    const source = sourceWithContents();
    const missingNavigation = titles.slice(1);
    expect(auditGutenbergSourceChapterMarkers(source, missingNavigation).bodyChapterMarkers)
      .toBeGreaterThan(missingNavigation.length);
  });
});
