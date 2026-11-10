import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Highlighter, List, PenLine, Settings2 } from "lucide-react";
import { ShelfButtons } from "@/components/ShelfButtons";

/** Pure reader chrome: position, source selection, accessibility actions.
 * All source navigation, highlight writes and preference mutations are in
 * BookReaderV3's guarded controllers, never in this component. */
export function BookReaderTopbar({
  title, pageLabel, language, availableLanguages, bookId, canReturnToReading, progress,
  onLanguageChange, onBackToReading, onContents, onHighlight, onBeforeHighlight, onOpenSettings,
  inkEnabled, onToggleInk,
}: {
  title: string;
  pageLabel: string;
  language: string;
  availableLanguages: string[];
  bookId: string;
  canReturnToReading: boolean;
  progress: number;
  onLanguageChange: (language: string) => void;
  onBackToReading: () => void;
  onContents: () => void;
  onHighlight: () => void | Promise<void>;
  onBeforeHighlight: () => void;
  onOpenSettings: () => void;
  inkEnabled:boolean;
  onToggleInk:()=>void;
}) {
  const displayBookTitle=title;
  return (
      <header className="reader-v3-topbar">
        <Link to="/library" className="reader-v3-icon-label" aria-label="Back to library">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Library</span>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate font-display text-sm font-semibold">{displayBookTitle}</div>
          <div className="text-[11px] text-muted-foreground">{pageLabel}</div>
        </div>
        <div className="reader-v3-topbar-actions flex items-center gap-1.5">
          <select
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
            aria-label="Reading language"
            className="reader-v3-language"
          >
            {availableLanguages.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          {canReturnToReading ? (
            <button
              onClick={onBackToReading}
              className="reader-v3-icon-label"
              aria-label="Back to reading position"
            >
              <ChevronRight className="h-4 w-4" />
              <span className="hidden sm:inline">Back to reading</span>
            </button>
          ) : (
            <button onClick={onContents} className="reader-v3-icon" aria-label="Contents">
              <List className="h-4 w-4" />
            </button>
          )}
          <div className="hidden sm:block">
            <ShelfButtons bookId={bookId} />
          </div>
          <button
            onPointerDown={onBeforeHighlight}
            onMouseDown={(event) => {
              // Preserve desktop selection focus until the click handler saves it.
              if (window.getSelection()?.toString().trim()) event.preventDefault();
            }}
            onClick={onHighlight}
            className="reader-v3-icon"
            aria-label="Highlight selection"
          >
            <Highlighter className="h-4 w-4" />
          </button>
          <button type="button" onClick={onToggleInk}
            className="reader-v3-icon"
            aria-label={inkEnabled?"Finish freehand drawing":"Draw or write by hand"}
            aria-pressed={inkEnabled}
            title={inkEnabled?"Finish freehand drawing":"Handwriting and drawing tools"}
          >
            <PenLine className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="reader-v3-icon"
            aria-label="Reader settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
        <div className="reader-v3-progress-track" aria-label={pageLabel}>
          <div style={{ width: String(progress) + "%" }} />
        </div>
      </header>
  );
}
