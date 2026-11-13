import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { ShelfButtons } from "@/components/ShelfButtons";
import type { Book } from "@/lib/data";
import type { ReaderTheme, ReaderFontFamily, ReaderContentWidth } from "@/lib/prefs";

export interface BookReaderSettingsProps {
  book: Pick<Book, "id" | "available_languages">;
  language: string;
  fontSizeDraft: number;
  typeface: ReaderFontFamily;
  lineSpacing: number;
  textMeasure: ReaderContentWidth;
  requestableLanguages: readonly string[];
  requestLanguage: string;
  requestingTranslation: boolean;
  translationRequestStatus: string | null;
  signedIn?: boolean;
  theme: ReaderTheme;
  onClose: () => void;
  onLanguageChange: (language: string) => void;
  onFontSizeChange: (size: number) => void;
  onTypefaceChange: (family: ReaderFontFamily) => void;
  onLineSpacingChange: (spacing: number) => void;
  onTextMeasureChange: (measure: ReaderContentWidth) => void;
  onRequestLanguageChange: (language: string) => void;
  onTranslationRequest: () => void;
  onThemeChange: (theme: ReaderTheme) => void;
}

/** Presentation only: all position-preserving state and source operations remain
 * in BookReaderV3. Settings have no independent persisted or privileged state. */
export function BookReaderSettings({
  book, language, fontSizeDraft, typeface, lineSpacing, textMeasure,
  requestableLanguages, requestLanguage, requestingTranslation, translationRequestStatus, signedIn = false, theme,
  onClose, onLanguageChange, onFontSizeChange, onTypefaceChange,
  onLineSpacingChange, onTextMeasureChange, onRequestLanguageChange,
  onTranslationRequest, onThemeChange,
}: BookReaderSettingsProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    // Give keyboard and screen-reader users a reliable starting point.
    closeRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  function keepFocusInDialog(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
        <div className="reader-v3-settings-backdrop" onClick={(event) => {
          if (event.currentTarget === event.target) onClose();
        }}>
          <div
            ref={dialogRef}
            className="reader-v3-settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            onKeyDown={keepFocusInDialog}
          >
            <div className="flex items-center justify-between">
              <h2 id={headingId} className="font-display text-lg font-semibold">Reading settings</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => onClose()}
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-primary transition-colors hover:bg-secondary active:bg-accent"
              >
                Done
              </button>
            </div>
            <div className="mt-4 sm:hidden">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Book actions
              </div>
              <ShelfButtons bookId={book.id} />
            </div>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Language
              <select
                value={language}
                onChange={(event) => onLanguageChange(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border bg-card px-3 py-2 text-sm normal-case text-foreground transition-colors hover:border-primary/60"
              >
                {book.available_languages.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Text size</span>
                <span>{fontSizeDraft}px</span>
              </div>
              <input
                type="range"
                min={16}
                max={20}
                step={1}
                value={fontSizeDraft}
                onChange={(event) => onFontSizeChange(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </div>
            <fieldset className="mt-5">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Typeface</legend>
              {language === "English" ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["literary", "serif", "sans"] as const).map((item) => (
                    <button key={item} type="button" onClick={() => onTypefaceChange(item)}
                      aria-pressed={typeface === item}
                      className={"min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold capitalize " +
                        (typeface === item ? "bg-primary text-primary-foreground hover:brightness-95" : "bg-card hover:border-primary/60 hover:bg-secondary")}>
                      {item}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  The verified {language} source uses a script-appropriate font to preserve legibility.
                </p>
              )}
            </fieldset>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Line spacing
              <select aria-label="Line spacing" value={lineSpacing}
                onChange={(event) => onLineSpacingChange(Number(event.target.value))}
                className="mt-2 min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm normal-case text-foreground">
                <option value={1.4}>Compact</option>
                <option value={1.5}>Comfortable</option>
                <option value={1.65}>Relaxed</option>
                <option value={1.8}>Spacious</option>
              </select>
            </label>
            <fieldset className="mt-5">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Page margins</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["narrow", "medium", "wide"] as const).map((item) => (
                  <button type="button" key={item}
                    onClick={() => onTextMeasureChange(item)}
                    aria-pressed={textMeasure === item}
                    className={"min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold " +
                      (textMeasure === item ? "bg-primary text-primary-foreground hover:brightness-95" : "bg-card hover:border-primary/60 hover:bg-secondary")}>
                    {item === "narrow" ? "Roomy" : item === "wide" ? "Compact" : "Standard"}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Text size enlarges the whole paper without increasing its page count.
              On small screens, drag to pan the magnified page. Changing typeface,
              margins or line spacing may still repaginate while preserving your reading position.
            </p>
            {requestableLanguages.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Request translation
                </div>
                <div className="mt-2 flex gap-2">
                  <select
                    value={requestLanguage}
                    onChange={(event) => onRequestLanguageChange(event.target.value)}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/60"
                  >
                    <option value="">Choose language…</option>
                    {requestableLanguages.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void onTranslationRequest()}
                    disabled={!requestLanguage || requestingTranslation || !!translationRequestStatus}
                    className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                  >
                    {requestingTranslation ? "Sending…" : translationRequestStatus ? "Recorded" : "Request"}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Request a missing language edition. A request records reader interest only;
                  translation, rights clearance and publication require separate editorial approval.
                  {!signedIn && " Sign in to send a request."}
                </p>
                {translationRequestStatus && (
                  <p className="mt-2 text-xs font-semibold text-foreground" role="status">
                    Your {requestLanguage} request: {translationRequestStatus.replaceAll("_", " ")}.
                    {translationRequestStatus === "declined" || translationRequestStatus === "revoked"
                      ? " Contact support for clarification." : ""}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Theme
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["light", "sepia", "dark"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={theme === item}
                    aria-label={item + " reading theme"}
                    onClick={() => onThemeChange(item)}
                    className={
                      "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 py-2 text-sm font-semibold capitalize " +
                      (theme === item ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border hover:border-primary/60 hover:bg-secondary")
                    }
                  >
                    <span aria-hidden="true" className={
                      "h-4 w-4 rounded-full border border-black/20 " +
                      (item === "light" ? "bg-[#fffdf7]" : item === "sepia" ? "bg-[#e9d8b8]" : "bg-[#20352e]")
                    } />
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

  );
}
