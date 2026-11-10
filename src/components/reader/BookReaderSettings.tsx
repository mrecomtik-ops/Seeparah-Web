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
  requestableLanguages, requestLanguage, requestingTranslation, translationRequestStatus, theme,
  onClose, onLanguageChange, onFontSizeChange, onTypefaceChange,
  onLineSpacingChange, onTextMeasureChange, onRequestLanguageChange,
  onTranslationRequest, onThemeChange,
}: BookReaderSettingsProps) {
  return (
        <div className="reader-v3-settings-backdrop" onMouseDown={() => onClose()}>
          <div className="reader-v3-settings" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Reading settings</h2>
              <button
                onClick={() => onClose()}
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-primary"
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
                className="mt-2 w-full rounded-lg border bg-card px-3 py-2 text-sm normal-case text-foreground"
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
                        (typeface === item ? "bg-primary text-primary-foreground" : "bg-card")}>
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
                      (textMeasure === item ? "bg-primary text-primary-foreground" : "bg-card")}>
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
                    className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-sm text-foreground"
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
                    className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    {requestingTranslation ? "Sending…" : translationRequestStatus ? "Recorded" : "Request"}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Request a missing language edition. A request records reader interest only;
                  translation, rights clearance and publication require separate editorial approval.
                  Sign in to send a request.
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
                      (theme === item ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border")
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
