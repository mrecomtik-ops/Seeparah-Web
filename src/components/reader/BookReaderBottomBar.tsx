import { ChevronLeft, ChevronRight } from "lucide-react";

/** Book navigation never owns a source position or authorizes persistence.
 * It calls the reader's existing position-preserving navigation callbacks. */
export function BookReaderBottomBar({
  atBeginning, atEnd, pageLabel, onPrevious, onNext, onFinish,
}: {
  atBeginning: boolean;
  atEnd: boolean;
  pageLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
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
        <div className="text-xs font-medium text-muted-foreground">{pageLabel}</div>
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
