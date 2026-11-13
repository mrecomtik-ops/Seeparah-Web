/**
 * Lossless Gutenberg import QA. No content is generated or changed.
 *
 * The source bytes are archived separately (SHA-256 in books/job metadata).
 * Compare EVERY source character (including punctuation, case, ligatures
 * and diacritics) against stored reader chunks in its original order.
 * Ignore only layout whitespace intentionally reflowed by the reader.
 * Lossy dehyphenation or silent punctuation changes must fail closed.
 * This test is a necessary, not sufficient, condition for a complete edition:
 * an upstream Gutenberg file could itself be incomplete.
 */
import { createHash } from "node:crypto";

export type ReaderChunkForAudit = { chunk_index: number; content: string };
export type StructureNodeForAudit = {
  nodeType: string;
  title: string;
  nodeKey: string;
  parentNodeKey: string | null;
  ordinal: number;
  startChunkIndex: number;
  endChunkIndex: number;
};
export type ParsedSourceForAudit = {
  chunks: string[];
  structure: StructureNodeForAudit[];
};

function canonical(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, "");
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export type IntegrityAudit = {
  ok: boolean;
  errors: string[];
  sourceBodySha256: string;
  canonicalSha256: string;
  canonicalCharacters: number;
  chunkCount: number;
  chapterCount: number;
  partCount: number;
};

export function auditGutenbergSource(
  extractedBody: string,
  parsed: ParsedSourceForAudit,
): IntegrityAudit {
  const errors: string[] = [];
  const rawCanonical = canonical(extractedBody);
  const chunks = parsed.chunks;
  const joined = chunks.join("\n\n");
  const parsedCanonical = canonical(joined);
  if (!rawCanonical || rawCanonical.length < 12000) {
    errors.push("Source lacks enough intact content for unattended long-form publication");
  }
  if (!chunks.length || chunks.some((x) => !x.trim())) {
    errors.push("Empty or missing reader chunk");
  }
  if (rawCanonical !== parsedCanonical) {
    errors.push("Reader content differs from full source at character level");
  }
  const keys = new Set<string>();
  const ordered = [...parsed.structure].sort((a, b) => a.ordinal - b.ordinal);
  for (const node of ordered) {
    if (!node.nodeKey || keys.has(node.nodeKey)) errors.push("Duplicate or empty structure key");
    keys.add(node.nodeKey);
    if (!node.title.trim() ||
        !Number.isInteger(node.startChunkIndex) ||
        !Number.isInteger(node.endChunkIndex) ||
        node.startChunkIndex < 0 || node.endChunkIndex < node.startChunkIndex ||
        node.endChunkIndex >= chunks.length) {
      errors.push("Invalid source-backed structure range");
    }
    if (node.nodeType === "part" &&
        (/^(?:partly|parting|part of)\s/iu.test(node.title) && node.title.length > 75 ||
         /^volume\s+1\s+contains\s/iu.test(node.title))) {
      errors.push("Narrative prose or publisher advert falsely classified as a part");
    }
  }
  if (ordered.some((n, i) => i > 0 && n.ordinal <= ordered[i - 1]!.ordinal)) {
    errors.push("Repeated or unordered structure ordinals");
  }
  for (const n of ordered) {
    if (n.parentNodeKey && !keys.has(n.parentNodeKey)) {
      errors.push("Missing chapter/part parent structure node");
    }
  }
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    sourceBodySha256: digest(extractedBody),
    canonicalSha256: digest(rawCanonical),
    canonicalCharacters: rawCanonical.length,
    chunkCount: chunks.length,
    chapterCount: parsed.structure.filter((n) => n.nodeType === "chapter").length,
    partCount: parsed.structure.filter((n) => n.nodeType === "part").length,
  };
}

/** Confirm actual DB rows, not just the in-memory parser output. */
export function auditGutenbergStoredChunks(
  extractedBody: string,
  expected: ParsedSourceForAudit,
  stored: ReaderChunkForAudit[],
): { ok: boolean; errors: string[]; canonicalSha256: string } {
  const errors: string[] = [];
  if (expected.chunks.length === 0 || stored.length !== expected.chunks.length) {
    errors.push("Stored reader chunk count differs from source parser");
  }
  for (let i = 0; i < stored.length; i++) {
    if (stored[i]!.chunk_index !== i) {
      errors.push("Reader chunks have a missing, duplicate, or reordered index");
      break;
    }
  }
  const source = canonical(extractedBody);
  const rendered = canonical(stored.map((c) => c.content).join("\n\n"));
  if (source !== rendered) {
    errors.push("Stored reader has omitted, reordered, or changed source characters");
  }
  if (rendered !== canonical(expected.chunks.join("\n\n"))) {
    errors.push("Stored reader differs from parser output");
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], canonicalSha256: digest(rendered) };
}
