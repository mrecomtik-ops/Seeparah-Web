import type { Dispatch, SetStateAction } from "react";

export type ContentPolicyDraft = {
  classification: "general" | "religious";
  typographyProfile: string;
  authenticityNotes: string;
};

export type ContentPolicyBook = {
  content_classification: string;
  status: string;
  source_url: string | null;
  source_edition_id: string | null;
  source_scan_id: string | null;
  source_language: string;
  available_languages: string[];
};

/** Source policy and reference controls remain under server-side rights
 * checks. This component only renders the form and invokes parent handlers. */
export function AdminBookContentPolicy({
  book, role, canPublish, canReview,
  contentPolicyDraft, setContentPolicyDraft, contentPolicyBusy, saveContentPolicy,
  referenceManifestLanguage, setReferenceManifestLanguage,
  referenceManifestText, setReferenceManifestText,
  referenceManifestBusy, importSacredReferenceManifest,
}: {
  book: ContentPolicyBook;
  role: string | null;
  canPublish: boolean;
  canReview: boolean;
  contentPolicyDraft: ContentPolicyDraft;
  setContentPolicyDraft: Dispatch<SetStateAction<ContentPolicyDraft>>;
  contentPolicyBusy: boolean;
  saveContentPolicy: () => Promise<void>;
  referenceManifestLanguage: string;
  setReferenceManifestLanguage: Dispatch<SetStateAction<string>>;
  referenceManifestText: string;
  setReferenceManifestText: Dispatch<SetStateAction<string>>;
  referenceManifestBusy: boolean;
  importSacredReferenceManifest: () => Promise<void>;
}) {
  return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Content policy & typography
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Religious books are permanently free, never sent to the AI translation pipeline, and
              use verified sourced editions only. A General book cannot be reclassified until any
              AI-assisted editions/jobs are resolved. Typography and authenticity notes travel with
              the catalog record so the reader can preserve the edition's script conventions.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              book.content_classification === "religious"
                ? "bg-accent text-accent-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {book.content_classification === "religious" ? "Religious" : "General"}
          </span>
        </div>

        {canPublish && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Classification</span>
              <select
                value={contentPolicyDraft.classification}
                onChange={(e) =>
                  setContentPolicyDraft((d) => ({
                    ...d,
                    classification: e.target.value as "general" | "religious",
                    typographyProfile:
                      e.target.value === "religious" && d.typographyProfile === "standard"
                        ? "facsimile_preserving"
                        : d.typographyProfile,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option
                  value="general"
                  disabled={
                    book.content_classification === "religious" &&
                    (role !== "owner" || book.status === "published")
                  }
                >
                  General book
                </option>
                <option value="religious">
                  Religious — always free, sourced translations only
                </option>
              </select>
              {book.content_classification === "religious" && (
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  Religious → General is an owner-only protected action. Unpublish the book first,
                  provide an explicit reason, and resolve any verified sourced Religious editions.
                  Translation permission is reset to No during the downgrade and must be reviewed
                  separately before any future AI translation can be approved.
                </span>
              )}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Typography profile</span>
              <select
                value={contentPolicyDraft.typographyProfile}
                onChange={(e) =>
                  setContentPolicyDraft((d) => ({ ...d, typographyProfile: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="standard">Standard reader</option>
                <option value="facsimile_preserving">Preserve source/facsimile styling</option>
                <option value="scripture_arabic">Arabic scripture / Naskh-style stack</option>
                <option value="scripture_urdu">Urdu scripture / Nastaliq-style stack</option>
                <option value="scripture_hebrew">Hebrew scripture-style stack</option>
                <option value="scripture_indic">Indic scripture-style stack</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Authenticity notes</span>
              <textarea
                rows={3}
                value={contentPolicyDraft.authenticityNotes}
                onChange={(e) =>
                  setContentPolicyDraft((d) => ({ ...d, authenticityNotes: e.target.value }))
                }
                placeholder="Record source edition, script, diacritics, verse numbering, line-break or layout requirements…"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="md:col-span-2">
              <button
                disabled={contentPolicyBusy}
                onClick={() => void saveContentPolicy()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {contentPolicyBusy ? "Saving…" : "Save content policy"}
              </button>
            </div>
          </div>
        )}

        {book.content_classification === "religious" && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">
              Authentic source & canonical reference map
            </h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              A Religious book cannot be published until it has a valid reader-visible source URL,
              an exact source edition identifier, and a reviewed canonical reference map. Keep the
              sacred text itself untouched; import chapter/verse, Surah/Ayah, Chapter/Shloka, Ang,
              hymn, canto or other authentic reference metadata separately here.
            </p>
            <div className="mt-3 rounded-xl border border-border bg-background p-3 text-xs">
              <p>
                <strong>Public source URL:</strong>{" "}
                {book.source_url || "Missing — edit Rights & provenance"}
              </p>
              <p className="mt-1">
                <strong>Source edition ID:</strong>{" "}
                {book.source_edition_id || book.source_scan_id || "Missing — edit book metadata"}
              </p>
            </div>

            {canReview && (
              <div className="mt-4 grid gap-3">
                <label className="block max-w-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    Reference-map language
                  </span>
                  <select
                    value={referenceManifestLanguage || book.source_language}
                    onChange={(e) => setReferenceManifestLanguage(e.target.value)}
                    disabled={book.status === "published"}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
                  >
                    {[
                      book.source_language,
                      ...book.available_languages.filter((l) => l !== book.source_language),
                    ].map((language) => (
                      <option key={language} value={language}>
                        {language}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">
                    Canonical reference manifest (JSON)
                  </span>
                  <textarea
                    rows={9}
                    value={referenceManifestText}
                    onChange={(e) => setReferenceManifestText(e.target.value)}
                    disabled={book.status === "published"}
                    placeholder={
                      '[{"nodeKey":"ref-1","nodeType":"section","title":"…","ordinal":0,"depth":0,"startChunkIndex":0,"endChunkIndex":0,"canonicalRef":"…","referenceLabel":"…","referenceKind":"verse","referencePath":[{"kind":"chapter","label":"Chapter","value":"1"},{"kind":"verse","label":"Verse","value":"1"}]}]'
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed disabled:opacity-60"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={
                      referenceManifestBusy ||
                      book.status === "published" ||
                      !referenceManifestText.trim()
                    }
                    onClick={() => void importSacredReferenceManifest()}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {referenceManifestBusy ? "Importing…" : "Import reviewed reference map"}
                  </button>
                  {book.status === "published" && (
                    <span className="text-xs text-muted-foreground">
                      Unpublish first before replacing canonical references.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
  );
}
