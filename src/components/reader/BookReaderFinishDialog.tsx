import { Link } from "@tanstack/react-router";

/** A separate finish overlay, without publishing, deletion, or source writes. */
export function BookReaderFinishDialog({ title, onClose }: { title: string; onClose: () => void }) {
  return (
        <div className="reader-v3-settings-backdrop" onMouseDown={() => onClose()}>
          <div
            className="reader-v3-finish-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-finish-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="text-3xl" aria-hidden="true">
              ❧
            </div>
            <h2 id="reader-finish-title" className="mt-3 font-display text-2xl font-semibold">
              Finished
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{title}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => onClose()}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
              >
                Keep reading
              </button>
              <Link
                to="/library"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Back to library
              </Link>
            </div>
          </div>
        </div>

  );
}
