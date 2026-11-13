import { describe, expect, it } from "vitest";
import { parseManuscript } from "@/lib/manuscript";
import {
  auditGutenbergSource,
  auditGutenbergStoredChunks,
} from "@/lib/admin/gutenberg-integrity-gate";

const body = [
  "VOLUME I",
  "CHAPTER I.",
  "A true opening paragraph with no missing words. ".repeat(400),
  "CHAPTER II.",
  "The continuation of the actual source text. ".repeat(400),
  "CHAPTER III.",
  "The original final chapter and its ending. ".repeat(400),
].join("\n\n");

describe("Gutenberg lossless source-to-reader integrity gate", () => {
  const parsed = parseManuscript(body);
  const stored = parsed.chunks.map((content, chunk_index) => ({ chunk_index, content }));

  it("accepts content whose characters, original order and chunk storage are intact", () => {
    const first = auditGutenbergSource(body, parsed);
    expect(first.ok).toBe(true);
    expect(first.chapterCount).toBe(3);
    expect(auditGutenbergStoredChunks(body, parsed, stored).ok).toBe(true);
  });

  it("blocks a missing opening or final chapter even if the middle is present", () => {
    const lostStart = { ...parsed, chunks: parsed.chunks.slice(1) };
    const lostEnd = { ...parsed, chunks: parsed.chunks.slice(0, -1) };
    expect(auditGutenbergSource(body, lostStart).ok).toBe(false);
    expect(auditGutenbergSource(body, lostEnd).ok).toBe(false);
  });

  it("blocks missing stored chunks and reordered reader passages", () => {
    expect(auditGutenbergStoredChunks(body, parsed, stored.slice(1)).ok).toBe(false);
    expect(auditGutenbergStoredChunks(body, parsed, [...stored].reverse()).ok).toBe(false);
    const swapped = [...stored];
    swapped[0] = { ...swapped[0]!, content: "Wrong body, but the same source ID." };
    expect(auditGutenbergStoredChunks(body, parsed, swapped).ok).toBe(false);
  });

  it("detects misleading PART headings, dangling parents, and invalid ranges", () => {
    const bad = {
      ...parsed,
      structure: [...parsed.structure, {
        nodeKey: "false-part-88",
        nodeType: "part",
        parentNodeKey: "missing-parent",
        ordinal: 999,
        title: "Partly moved by remorse and at the same time engaged in a longer conversation.",
        startChunkIndex: 1234,
        endChunkIndex: 9999,
      }],
    };
    expect(auditGutenbergSource(body, bad).errors).toContain("Invalid source-backed structure range");
    expect(auditGutenbergSource(body, bad).errors).toContain("Missing chapter/part parent structure node");
  });

  it("preserves hyphenated Gutenberg hard wraps exactly in the source-backed importer", () => {
    const raw = [
      "CONTENTS", "CHAPTER I.", ("A line ends with a deliberate hyphen-\nated word.\n").repeat(500),
      "CHAPTER II.", ("Long-line printings and punctuation, preserved exactly.\n").repeat(500),
    ].join("\n\n");
    const reflowed = parseManuscript(raw);
    const faithful = parseManuscript(raw,{preserveLineation:true});
    expect(auditGutenbergSource(raw,reflowed).ok).toBe(false);
    expect(auditGutenbergSource(raw,faithful).ok).toBe(true);
    const saved = faithful.chunks.map((content,chunk_index)=>({chunk_index,content}));
    expect(auditGutenbergStoredChunks(raw,faithful,saved).ok).toBe(true);
  });
  it("allows Gutenberg hard-wrap whitespace changes without accepting missing letters", () => {
    const reflowed = body.replace("A true opening paragraph", "A true opening\nparagraph");
    const rep = parseManuscript(reflowed);
    expect(auditGutenbergSource(reflowed, rep).ok).toBe(true);
    const altered = { ...rep, chunks: rep.chunks.map((chunk) => chunk.replace("opening", "closing")) };
    expect(auditGutenbergSource(reflowed, altered).ok).toBe(false);
    const punctuationLoss = { ...rep, chunks: rep.chunks.map((chunk) => chunk.replace("CHAPTER I.", "CHAPTER I")) };
    expect(auditGutenbergSource(reflowed, punctuationLoss).ok).toBe(false);
    const caseChange = { ...rep, chunks: rep.chunks.map((chunk) => chunk.replace("opening", "Opening")) };
    expect(auditGutenbergSource(reflowed, caseChange).ok).toBe(false);
  });
});
