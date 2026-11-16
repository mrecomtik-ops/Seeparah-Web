import { describe, expect, it } from "vitest";
import {
  buildReaderChapters,
  chapterTextFromBlocks,
  findReaderChapterByChunk,
} from "@/lib/reader-book-layout";
import type { ReaderNavigationItem } from "@/lib/reader-structure";

const navigation: ReaderNavigationItem[] = [
  { index: 3, title: "STORY OF THE DOOR", kind: "chapter", depth: 0, readerStart: true },
  { index: 10, title: "SEARCH FOR MR. HYDE", kind: "chapter", depth: 0 },
  { index: 23, title: "DR. JEKYLL WAS QUITE AT EASE", kind: "chapter", depth: 0 },
];

describe("reader book layout", () => {
  it("ignores printed contents before the real first chapter", () => {
    const chapters = buildReaderChapters(
      [
        {
          chunkIndex: 0,
          content: "The Strange Case Of Dr. Jekyll And Mr. Hyde\n\nContents\n\nSTORY OF THE DOOR",
        },
        {
          chunkIndex: 3,
          content:
            "HENRY JEKYLL'S FULL STATEMENT OF THE CASE\n\nSTORY OF THE DOOR\n\nFirst real paragraph.",
        },
        {
          chunkIndex: 10,
          content: "End of chapter one.\n\nSEARCH FOR MR. HYDE\n\nChapter two begins here.",
        },
        {
          chunkIndex: 23,
          content: "End of chapter two.\n\nDR. JEKYLL WAS QUITE AT EASE\n\nChapter three begins.",
        },
      ],
      navigation,
    );

    expect(chapters).toHaveLength(3);
    expect(chapters[0]?.title).toBe("STORY OF THE DOOR");
    expect(chapterTextFromBlocks(chapters[0]!)).toBe(
      "First real paragraph.\n\nEnd of chapter one.",
    );
    expect(chapterTextFromBlocks(chapters[0]!)).not.toContain(
      "HENRY JEKYLL'S FULL STATEMENT OF THE CASE",
    );
  });

  it("splits chapters inside database chunks instead of at chunk boundaries", () => {
    const chapters = buildReaderChapters(
      [
        {
          chunkIndex: 3,
          content: "STORY OF THE DOOR\n\nOne.\n\nTwo.",
        },
        {
          chunkIndex: 10,
          content: "Last paragraph of Story.\n\nSEARCH FOR MR. HYDE\n\nFirst Hyde paragraph.",
        },
        {
          chunkIndex: 23,
          content: "Last Hyde paragraph.\n\nDR. JEKYLL WAS QUITE AT EASE\n\nNext chapter.",
        },
      ],
      navigation,
    );

    expect(chapterTextFromBlocks(chapters[0]!)).toContain("Last paragraph of Story.");
    expect(chapterTextFromBlocks(chapters[1]!)).toBe(
      "First Hyde paragraph.\n\nLast Hyde paragraph.",
    );
    expect(chapters[1]?.blocks.some((block) => block.sourceChunkIndex === 10)).toBe(true);
    expect(chapters[1]?.blocks.some((block) => block.sourceChunkIndex === 23)).toBe(true);
  });

  it("keeps chapter numbering and chunk-to-chapter progress mapping stable", () => {
    const chapters = buildReaderChapters(
      [
        { chunkIndex: 3, content: "STORY OF THE DOOR\n\nA." },
        { chunkIndex: 10, content: "SEARCH FOR MR. HYDE\n\nB." },
        { chunkIndex: 23, content: "DR. JEKYLL WAS QUITE AT EASE\n\nC." },
      ],
      navigation,
    );

    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2, 3]);
    expect(findReaderChapterByChunk(chapters, 0)).toBe(0);
    expect(findReaderChapterByChunk(chapters, 17)).toBe(1);
    expect(findReaderChapterByChunk(chapters, 25)).toBe(2);
  });

  it("recognizes source-verified chapter labels that have an adjacent all-caps subtitle", () => {
    const parsed = buildReaderChapters(
      [
        {
          chunkIndex: 0,
          content: "THE WORKS OF E. P. ROE\n\nVOLUME THREE\n\nA KNIGHT OF THE NINETEENTH CENTURY\n\nPrefatory matter.",
        },
        {
          chunkIndex: 5,
          content: "CHAPTER I\n\nBAD TRAINING FOR A KNIGHT\n\nThe first original chapter starts here.",
        },
        {
          chunkIndex: 9,
          content: "CHAPTER II\n\nBOTH APOLOGIZE\n\nThe second original chapter begins.",
        },
      ],
      [
        { index: 0, title: "VOLUME THREE", kind: "part", depth: 0 },
        { index: 5, title: "CHAPTER I", kind: "chapter", depth: 1 },
        { index: 9, title: "CHAPTER II", kind: "chapter", depth: 1 },
      ],
    );
    expect(parsed.map((x) => x.title)).toEqual(["VOLUME THREE", "CHAPTER I", "CHAPTER II"]);
    expect(parsed.map((x) => x.startChunkIndex)).toEqual([0, 5, 9]);
    expect(chapterTextFromBlocks(parsed[1]!)).toContain("The first original chapter starts here.");
    expect(chapterTextFromBlocks(parsed[2]!)).toContain("The second original chapter begins.");
  });

  it("does not conflate Roman numeral chapter labels I and II", () => {
    const parsed = buildReaderChapters(
      [
        { chunkIndex: 3, content: "CHAPTER II\n\nA LONG SUBTITLE\n\nOnly chapter II text." },
      ],
      [
        { index: 2, title: "CHAPTER I", kind: "chapter", depth: 1 },
        { index: 3, title: "CHAPTER II", kind: "chapter", depth: 1 },
      ],
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title).toBe("CHAPTER II");
    expect(chapterTextFromBlocks(parsed[0]!)).toContain("Only chapter II text.");
  });

  it("opens source-backed chapters where a chapter label and subtitle share one paragraph", () => {
    const chapters = buildReaderChapters([
      { chunkIndex: 0, content: "BOOK THE FIRST\n_SOWING_\n\nCHAPTER I\nTHE ONE THING NEEDFUL\n\nFirst chapter original text." },
      { chunkIndex: 1, content: "Last chapter-one paragraph.\n\nCHAPTER II\nMURDERING THE INNOCENTS\n\nSecond chapter original text." },
      { chunkIndex: 2, content: "Last chapter-two paragraph.\n\nCHAPTER III\nA LOOPHOLE\n\nThird chapter original text." },
    ], [
      {index:0,title:"BOOK THE FIRST",kind:"part",depth:0},
      {index:0,title:"CHAPTER I",kind:"chapter",depth:1},
      {index:1,title:"CHAPTER II",kind:"chapter",depth:1},
      {index:2,title:"CHAPTER III",kind:"chapter",depth:1},
    ]);
    expect(chapters.map(c => c.title)).toEqual(["BOOK THE FIRST","CHAPTER I","CHAPTER II","CHAPTER III"]);
    expect(chapterTextFromBlocks(chapters[1]!)).toContain("First chapter original text.");
    expect(chapterTextFromBlocks(chapters[2]!)).toContain("Second chapter original text.");
    expect(chapterTextFromBlocks(chapters[3]!)).toContain("Third chapter original text.");
    expect(chapterTextFromBlocks(chapters[1]!)).toContain("CHAPTER I");
    expect(chapterTextFromBlocks(chapters[2]!)).toContain("CHAPTER II");
  });

  it("matches period-punctuated original chapter headings to source TOC without confusing I with II", () => {
    const chapters = buildReaderChapters([
      { chunkIndex: 0, content: "Printed list of chapters\n\nCHAPTER I: INTRODUCTION\nCHAPTER II: ADVENTURES" },
      { chunkIndex: 3, content: "CHAPTER I.\n\nTHE PROFESSOR AND THE CAPTAIN.\n\nOriginal paragraph one." },
      { chunkIndex: 9, content: "Last paragraph of one.\n\nCHAPTER II.\n\nA SQUALL IN THE GERMAN OCEAN.\n\nOriginal paragraph two." },
      { chunkIndex: 12, content: "Last paragraph of two." },
    ], [
      {index:3,title:"CHAPTER I",kind:"chapter",depth:1},
      {index:9,title:"CHAPTER II",kind:"chapter",depth:1},
    ]);
    expect(chapters.map(c => c.title)).toEqual(["CHAPTER I","CHAPTER II"]);
    expect(chapterTextFromBlocks(chapters[0]!)).toContain("Original paragraph one.");
    expect(chapterTextFromBlocks(chapters[0]!)).toContain("Last paragraph of one.");
    expect(chapterTextFromBlocks(chapters[1]!)).toContain("Original paragraph two.");
    expect(chapterTextFromBlocks(chapters[1]!)).not.toContain("Printed list of chapters");
  });

  it("never drops complete source blocks when an unclassified chapter label is embedded in a paragraph", () => {
    const chapters = buildReaderChapters([
      { chunkIndex: 2, content: "CHAPTER I\nTHE ORIGINAL TITLE\n\nFirst body paragraph." },
      { chunkIndex: 4, content: "Closing sentence.\n\nCHAPTER II\nANOTHER TITLE\n\nSecond body paragraph." },
    ], [
      {index:2,title:"CHAPTER I",kind:"chapter",depth:1},
      {index:4,title:"CHAPTER II",kind:"chapter",depth:1},
    ]);
    expect(chapters).toHaveLength(2);
    expect(chapterTextFromBlocks(chapters[0]!)).toContain("THE ORIGINAL TITLE");
    expect(chapterTextFromBlocks(chapters[0]!)).toContain("Closing sentence.");
    expect(chapterTextFromBlocks(chapters[1]!)).toContain("ANOTHER TITLE");
  });

});