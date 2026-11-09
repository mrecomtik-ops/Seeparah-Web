import { ChevronLeft, ChevronRight, Highlighter } from "lucide-react";

/** Book navigation never owns a source position or authorizes persistence.
 * It calls the reader's existing position-preserving navigation callbacks. */
export function BookReaderBottomBar({
  atBeginning, atEnd, pageLabel, onPrevious, onNext, onFinish, onOpenHighlights, highlightCount = 0,
}: {
  atBeginning: boolean;
  atEnd: boolean;
  pageLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
  onOpenHighlights?: () => void;
  highlightCount?: number;
}) {
  return (
      <footer className="reader-v3-bottombar">
        <button
          onClick={onPrevious}
          disabled={atBeginning}
          className="reader-v3-nav-button"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <div className="flex min-w-0 items-center justify-center gap-2">
          <span className="hidden truncate text-xs font-medium text-muted-foreground sm:inline">{pageLabel}</span>
          {onOpenHighlights && (
            <button
              type="button"
              onClick={onOpenHighlights}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground hover:bg-secondary"
              aria-label={`View saved highlights (${highlightCount})`}
            >
              <Highlighter className="h-4 w-4" aria-hidden="true" />
              <span className="tabular-nums">{highlightCount}</span>
            </button>
          )}
          <span className="sr-only sm:hidden">{pageLabel}</span>
        </div>
        <button
          onClick={atEnd ? onFinish : onNext}
          className="reader-v3-nav-button reader-v3-next"
        >
          {atEnd ? "Finish" : "Next"}
          <ChevronRight className="h-4 w-4" />
        </button>
      </footer>
  );
}
