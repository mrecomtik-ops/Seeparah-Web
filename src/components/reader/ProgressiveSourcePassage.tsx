import { useState, type CSSProperties, type ReactNode } from "react";
import { renderSacredInline } from "@/lib/sacred-inline-markup";

/** Large source units are genuine imported single chunks. Don't split or
 * rewrite their canonical numbering, diacritics, metadata, or source spans.
 * This is a presentation-only reveal, never a replacement for the source.
 */
export { sourcePreviewEnd, LARGE_SOURCE_LIMIT } from "@/lib/source-preview";
import { sourcePreviewEnd, LARGE_SOURCE_LIMIT } from "@/lib/source-preview";

/** The server may supply only a verbatim prefix for a very long Dīgha
 * unit. Never pretend that prefix is the complete source: fetch the original
 * published chunk only when a reader explicitly requests it.
 */
export function ProgressiveSourcePassage({
  content, children, style, label, fullContentLength, loadFullContent, renderFullContent,
}: {
  content: string;
  children: ReactNode;
  style?: CSSProperties | undefined;
  label: string;
  /** Actual source length before any transport-only prefix bounding. */
  fullContentLength?: number | undefined;
  loadFullContent?: (() => Promise<string | null>) | undefined;
  renderFullContent?: ((source: string) => ReactNode) | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullText, setFullText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const remotePrefix = fullContentLength !== undefined && fullContentLength > content.length;
  const originalLength = fullContentLength ?? content.length;
  if (originalLength <= LARGE_SOURCE_LIMIT) return <>{children}</>;

  const end = remotePrefix ? content.length : sourcePreviewEnd(content);
  const reveal = async () => {
    if (expanded) { setExpanded(false); return; }
    if (!remotePrefix) { setExpanded(true); return; }
    if (fullText !== null) { setExpanded(true); return; }
    if (!loadFullContent || !renderFullContent) { setError(true); return; }
    setLoading(true);
    setError(false);
    try {
      const actual = await loadFullContent();
      // Fail closed if the edition changed while a request was in flight.
      if (actual === null || actual.length !== originalLength ||
          !actual.startsWith(content)) throw new Error("Published source changed");
      setFullText(actual);
      setExpanded(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-w-0" data-large-source-length={originalLength}>
      {expanded
        ? remotePrefix && fullText !== null && renderFullContent
          ? renderFullContent(fullText)
          : children
        : (
          <p className="whitespace-pre-wrap break-words text-foreground" style={style}>
            {renderSacredInline(content.slice(0, end))}
          </p>
        )}
      <div lang="en" className="mt-4 rounded-lg border border-border/70 bg-secondary/30 px-3 py-3 text-sm">
        <p className="text-xs leading-relaxed text-muted-foreground" role="status">
          {expanded
            ? "The complete source passage is displayed without changing its text."
            : `Showing the beginning of ${label} (${end.toLocaleString()} of ${originalLength.toLocaleString()} original characters). The complete source is available below without altered spelling, numbering, or diacritics.`}
        </p>
        {error && <p role="alert" className="mt-2 text-xs text-destructive">
          The full published passage could not be verified. Please retry.
        </p>}
        <button type="button" aria-expanded={expanded} disabled={loading}
          onClick={() => void reveal()}
          className="mt-2 min-h-11 rounded-lg border border-primary/40 bg-card px-4 py-2 text-sm font-semibold text-primary hover:bg-secondary disabled:opacity-60">
          {loading ? "Loading complete passage…" :
            expanded ? "Collapse to beginning" : "Read complete source passage"}
        </button>
      </div>
    </div>
  );
}
