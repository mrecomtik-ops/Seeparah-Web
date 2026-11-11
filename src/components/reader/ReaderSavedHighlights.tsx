import { X, Highlighter, BookOpen, ArrowUpRight } from "lucide-react";
import type { Highlight } from "@/lib/data";
import type { ReaderChapter } from "@/lib/reader-book-layout";

export function ReaderSavedHighlights({
  highlights,
  language,
  chapters = [],
  onClose,
  onJump,
}: {
  highlights: Highlight[];
  language: string;
  chapters?: readonly Pick<ReaderChapter, "title" | "startChunkIndex">[];
  onClose: () => void;
  onJump: (highlight: Highlight) => void;
}) {
  const sorted = [...highlights].sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );
  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Saved highlights"
        className="flex h-full w-[min(25rem,100vw)] flex-col overflow-hidden border-s border-border bg-background text-foreground shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Highlighter className="h-5 w-5 text-primary" aria-hidden="true" />
              Saved highlights
            </h2>
            <p className="text-xs text-muted-foreground">
              {sorted.length} in {language} · Select a passage to return to it
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close saved highlights"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card hover:bg-secondary">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {sorted.length === 0 ? (
            <div role="status" className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <BookOpen className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true"/>
              <p className="mt-3 text-sm font-semibold">No highlights yet</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Select text in the book, then choose Highlight. Your saved passages will appear here.
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {sorted.map((highlight) => (
                <li key={highlight.id}>
                  <button
                    type="button"
                    onClick={() => onJump(highlight)}
                    className="group flex min-h-11 w-full items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-start hover:border-primary/50 hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={`Go to saved highlight: ${highlight.highlight_text.slice(0, 80)}`}
                  >
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-sm bg-[var(--gold)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                        {highlight.highlight_text}
                      </span>
                      {highlight.note && (
                        <span className="mt-2 block whitespace-pre-wrap break-words text-xs italic text-muted-foreground">
                          Note: {highlight.note}
                        </span>
                      )}
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {new Date(highlight.created_at).toLocaleDateString()} · {chapters.reduce<string>((title, chapter) =>
                          chapter.startChunkIndex <= highlight.chunk_index ? chapter.title : title,
                        "") || "Source section " + (highlight.chunk_index + 1)}
                      </span>
                    </span>
                    <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true"/>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
