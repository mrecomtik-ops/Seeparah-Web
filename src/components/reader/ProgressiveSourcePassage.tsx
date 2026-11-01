import { useState, type CSSProperties, type ReactNode } from "react";
import { renderSacredInline } from "@/lib/sacred-inline-markup";

/** Large source units are genuine imported single chunks. Don't split or
 * rewrite their canonical numbering, diacritics, metadata, or source spans.
 * This is a presentation-only reveal, never a replacement for the source.
 */
export const LARGE_SOURCE_LIMIT = 10_000;
const PREVIEW_TARGET = 6_000;

/** Choose a prefix boundary without splitting a surrogate pair. Preserve
 * every byte of the selected source substring, including final newlines.
 */
export function sourcePreviewEnd(content: string, target = PREVIEW_TARGET): number {
  if (content.length <= target) return content.length;
  const newline = content.lastIndexOf("\n", target);
  let end = newline >= Math.floor(target * 0.6) ? newline + 1 : target;
  const last = content.charCodeAt(end - 1);
  const next = content.charCodeAt(end);
  if (last >= 0xd800 && last <= 0xdbff &&
      next >= 0xdc00 && next <= 0xdfff) end -= 1;
  return end;
}

/** Render a brief, exact source prefix initially on very large imported
 * chunks. The entire unmodified original is rendered only on an explicit
 * reader action. This avoids a 100k-character document reflow on first view,
 * without inventing pages or silently omitting verses.
 */
export function ProgressiveSourcePassage({
  content, children, style, label,
}: {
  content: string;
  children: ReactNode;
  style?: CSSProperties | undefined;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (content.length <= LARGE_SOURCE_LIMIT) return <>{children}</>;

  const end = sourcePreviewEnd(content);
  return (
    <div className="min-w-0" data-large-source-length={content.length}>
      {expanded ? children : (
        <p className="whitespace-pre-wrap break-words text-foreground" style={style}>
          {renderSacredInline(content.slice(0, end))}
        </p>
      )}
      <div className="mt-4 rounded-lg border border-border/70 bg-secondary/30 px-3 py-3 text-sm">
        <p className="text-xs leading-relaxed text-muted-foreground" role="status">
          {expanded
            ? "The complete source passage is displayed without changing its text."
            : `Showing the beginning of ${label} (${end.toLocaleString()} of ${content.length.toLocaleString()} original characters). The complete source is available below without altered spelling, numbering, or diacritics.`}
        </p>
        <button type="button" aria-expanded={expanded}
          onClick={() => setExpanded((previous) => !previous)}
          className="mt-2 min-h-11 rounded-lg border border-primary/40 bg-card px-4 py-2 text-sm font-semibold text-primary hover:bg-secondary">
          {expanded ? "Collapse to beginning" : "Read complete source passage"}
        </button>
      </div>
    </div>
  );
}
