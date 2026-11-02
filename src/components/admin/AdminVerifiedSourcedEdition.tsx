import type { Dispatch, SetStateAction } from "react";
import { LANGUAGES } from "@/lib/data";

type ProvenanceType = "human_translation" | "licensed_translation" | "public_domain_translation";
type SourcedDraft = {
  language: string;
  provenanceType: ProvenanceType;
  typographyProfile: string;
  editionTitle: string;
  translator: string;
  sourceUrl: string;
  sourceEditionId: string;
  rightsBasis: string;
  rightsEvidenceUrl: string;
  authenticityNotes: string;
  manuscriptText: string;
};

/** Verified source-only religious importer. Never generates AI scripture.
 * All authorization, rights and source lineation validation remain on server.
 */
export function AdminVerifiedSourcedEdition({
  book, editions, canManageTranslations, sourcedEditionOpen, setSourcedEditionOpen,
  sourcedEditionDraft, setSourcedEditionDraft, sourcedEditionBusy, importSourcedEdition,
}: {
  book: { content_classification: string; source_language: string; total_chunks: number };
  editions: Array<{ language: string }>;
  canManageTranslations: boolean;
  sourcedEditionOpen: boolean;
  setSourcedEditionOpen: Dispatch<SetStateAction<boolean>>;
  sourcedEditionDraft: SourcedDraft;
  setSourcedEditionDraft: Dispatch<SetStateAction<SourcedDraft>>;
  sourcedEditionBusy: boolean;
  importSourcedEdition: () => Promise<void>;
}) {
  return (
    <>
      {book.content_classification === "religious" && canManageTranslations && (
        <section className="mt-6 rounded-2xl border border-accent/60 bg-card p-5 card-shadow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">
                Verified sourced Religious translation
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Religious books never use Seeparah AI translation. Add an existing human, licensed,
                or public-domain translation only after verifying the exact edition and its rights.
                It publishes free and preserves the supplied lineation and small textual marks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSourcedEditionOpen((value) => !value)}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              {sourcedEditionOpen ? "Close importer" : "Add sourced translation"}
            </button>
          </div>

          {sourcedEditionOpen && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Language *</span>
                <select
                  value={sourcedEditionDraft.language}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({ ...d, language: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Choose language…</option>
                  {LANGUAGES.filter(
                    (language) =>
                      language !== book.source_language &&
                      !editions.some((edition) => edition.language === language),
                  ).map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Provenance *</span>
                <select
                  value={sourcedEditionDraft.provenanceType}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({
                      ...d,
                      provenanceType: e.target.value as
                        "human_translation" | "licensed_translation" | "public_domain_translation",
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="human_translation">Verified human translation</option>
                  <option value="licensed_translation">Licensed translation</option>
                  <option value="public_domain_translation">Public-domain translation</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Edition title</span>
                <input
                  value={sourcedEditionDraft.editionTitle}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({ ...d, editionTitle: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Exact published edition title"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Translator / editor
                </span>
                <input
                  value={sourcedEditionDraft.translator}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({ ...d, translator: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="As credited by the source edition"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Source URL *</span>
                <input
                  value={sourcedEditionDraft.sourceUrl}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({ ...d, sourceUrl: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="https://… exact sourced edition"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Source edition ID</span>
                <input
                  value={sourcedEditionDraft.sourceEditionId}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({ ...d, sourceEditionId: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Archive/edition/catalogue identifier"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Typography profile *
                </span>
                <select
                  value={sourcedEditionDraft.typographyProfile}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({
                      ...d,
                      typographyProfile: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="facsimile_preserving">Preserve source/facsimile styling</option>
                  <option value="scripture_arabic">Arabic scripture / Naskh-style stack</option>
                  <option value="scripture_urdu">Urdu scripture / Nastaliq-style stack</option>
                  <option value="scripture_hebrew">Hebrew scripture-style stack</option>
                  <option value="scripture_indic">Indic scripture-style stack</option>
                  <option value="standard">Standard reader</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Rights evidence URL *
                </span>
                <input
                  value={sourcedEditionDraft.rightsEvidenceUrl}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({
                      ...d,
                      rightsEvidenceUrl: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="https://… evidence for this exact translation"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Rights basis for this exact translation *
                </span>
                <textarea
                  rows={3}
                  value={sourcedEditionDraft.rightsBasis}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({ ...d, rightsBasis: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Explain why Seeparah may reproduce this exact translated edition…"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Authenticity / text-preservation notes
                </span>
                <textarea
                  rows={3}
                  value={sourcedEditionDraft.authenticityNotes}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({
                      ...d,
                      authenticityNotes: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Script, diacritics, cantillation/recitation marks, verse numbering, lineation, headings, punctuation, special glyphs…"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Verified sourced text *
                </span>
                <textarea
                  rows={12}
                  value={sourcedEditionDraft.manuscriptText}
                  onChange={(e) =>
                    setSourcedEditionDraft((d) => ({ ...d, manuscriptText: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm"
                  placeholder={`Paste the verified text. Separate the ${book.total_chunks} aligned reading sections with a line containing exactly:\n\n===SEEPARAH_SECTION===\n\nInternal line breaks and textual marks are preserved.`}
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Required alignment: exactly {book.total_chunks} reading sections. This keeps
                  cross-language page positions stable without altering the sourced text inside each
                  section.
                </span>
              </label>

              <div className="md:col-span-2">
                <button
                  disabled={sourcedEditionBusy}
                  onClick={() => void importSourcedEdition()}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {sourcedEditionBusy ? "Importing…" : "Verify & publish free sourced edition"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
