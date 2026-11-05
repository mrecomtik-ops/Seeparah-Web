import type { Highlight } from "./data";

/** Source-only DOM anchors: never include reference buttons or annotations. */
export type SacredHighlightSelection = {
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
};

function sourceRootOf(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>("[data-sacred-source-text]") ?? null;
}

function textOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function captureSacredHighlightSelection(
  selection: Selection | null,
  readerRoot: HTMLElement | null,
): SacredHighlightSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !readerRoot)
    return null;

  const range = selection.getRangeAt(0);
  const startRoot = sourceRootOf(range.startContainer);
  const endRoot = sourceRootOf(range.endContainer);
  if (!startRoot || startRoot !== endRoot || !readerRoot.contains(startRoot))
    return null;

  const sourceArticle = startRoot.closest<HTMLElement>("[data-sacred-visible-chunk]");
  const chunkIndex = Number(sourceArticle?.dataset["sacredVisibleChunk"]);
  if (!sourceArticle || !Number.isInteger(chunkIndex) || chunkIndex < 0) return null;

  try {
    const startOffset = textOffset(startRoot, range.startContainer, range.startOffset);
    const endOffset = textOffset(startRoot, range.endContainer, range.endOffset);
    const text = range.toString().replace(/\s+/gu, " ").trim();
    if (!text || endOffset <= startOffset) return null;
    return { chunkIndex, startOffset, endOffset, text };
  } catch {
    return null;
  }
}

/** A pure non-mutating DOM Range, preserving the published React source tree. */
export function sacredTextRange(root: HTMLElement, start: number, end: number): Range | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let startBoundary: { node: Text; offset: number } | null = null;
  let endBoundary: { node: Text; offset: number } | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const next = cursor + node.length;
    if (!startBoundary && start >= cursor && start < next)
      startBoundary = { node, offset: start - cursor };
    if (startBoundary && end <= next) {
      endBoundary = { node, offset: Math.max(0, end - cursor) };
      break;
    }
    cursor = next;
    node = walker.nextNode() as Text | null;
  }
  if (!startBoundary || !endBoundary) return null;
  const range = document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  return range;
}

function highlightTextMatches(text: string, phrase: string): boolean {
  return text.replace(/\s+/gu, " ").trim() === phrase;
}

function findSavedOffset(root: HTMLElement, highlight: Highlight): [number, number] | null {
  const source = root.textContent ?? "";
  const phrase = highlight.highlight_text.trim();
  if (!phrase) return null;
  if (highlight.start_offset != null && highlight.end_offset != null) {
    const start = highlight.start_offset;
    const end = highlight.end_offset;
    if (start >= 0 && end <= source.length &&
        highlightTextMatches(source.slice(start, end), phrase)) return [start, end];
  }

  // Re-flowing from Book to Study may add headings or change segment wrappers.
  // Re-anchor by the actual quoted visible text, not by a guessed verse number.
  const exact = source.indexOf(phrase);
  if (exact >= 0) return [exact, exact + phrase.length];

  let normalized = "";
  const sourceOffsets: number[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (/\s/u.test(char)) {
      if (normalized.endsWith(" ")) continue;
      normalized += " ";
      sourceOffsets.push(i);
    } else {
      normalized += char;
      sourceOffsets.push(i);
    }
  }
  const at = normalized.indexOf(phrase);
  if (at < 0 || at + phrase.length > sourceOffsets.length) return null;
  return [sourceOffsets[at]!, sourceOffsets[at + phrase.length - 1]! + 1];
}

/**
 * Saved marks are browser CSS Highlights, not mutations to canonical scripture
 * text or React-managed markup. This remains valid across reflows and modes.
 */
export function sacredSavedHighlightRanges(
  readerRoot: HTMLElement | null,
  highlights: Highlight[],
): Range[] {
  if (!readerRoot || highlights.length === 0) return [];
  const roots = Array.from(readerRoot.querySelectorAll<HTMLElement>("[data-sacred-source-text]"));
  const results: Range[] = [];
  for (const highlight of highlights) {
    for (const root of roots) {
      const article = root.closest<HTMLElement>("[data-sacred-visible-chunk]");
      if (Number(article?.dataset["sacredVisibleChunk"]) !== highlight.chunk_index) continue;
      const offsets = findSavedOffset(root, highlight);
      if (!offsets) continue;
      const range = sacredTextRange(root, offsets[0], offsets[1]);
      if (range) { results.push(range); break; }
    }
  }
  return results;
}
