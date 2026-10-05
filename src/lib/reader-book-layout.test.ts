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
});