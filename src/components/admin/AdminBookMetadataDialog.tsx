import type { Dispatch, SetStateAction } from "react";
import { GENRES } from "@/lib/data";
import type { StagedEditionCover } from "@/lib/admin/staged-cover";

type MetadataDraft = {
  title: string; author: string; description: string; genre: string; coverUrl: string;
  editionTitle: string; editionYear: string; publisher: string; isbn: string;
  sourceScanId: string; originalPublicationYear: string;
};
type MetadataBook = {
  source_edition_id: string | null; source_scan_id: string | null;
  edition_title: string | null; source_language: string; available_languages: string[];
};
type MetadataEdition = { language: string; source_edition_id: string | null };

/** Pure editing surface. Writes still run through guarded parent actions.
 * No source text, edition provenance or rights logic is owned here. */
export function AdminBookMetadataDialog({
  editOpen, editDraft, setEditDraft, book, editions, busy, canPublish,
  coverPreviewFailed, setCoverPreviewFailed, coverAttribution, setCoverAttribution,
  coverTargetLanguage, setCoverTargetLanguage, stagedEditionCover, setStagedEditionCover,
  coverSharedArtwork, setCoverSharedArtwork, coverUploading, selectedCoverFile,
  setSelectedCoverFile, selectedCoverPreview, cropToPortrait, setCropToPortrait,
  cropFocusX, setCropFocusX, cropFocusY, setCropFocusY, readerV2SchemaAvailable,
  stageCoverFile, assignStagedEditionCover, setEditOpen, saveEdit,
}: {
  editOpen: boolean;
  editDraft: MetadataDraft;
  setEditDraft: Dispatch<SetStateAction<MetadataDraft>>;
  book: MetadataBook;
  editions: MetadataEdition[];
  busy: boolean;
  canPublish: boolean;
  coverPreviewFailed: boolean;
  setCoverPreviewFailed: Dispatch<SetStateAction<boolean>>;
  coverAttribution: string;
  setCoverAttribution: Dispatch<SetStateAction<string>>;
  coverTargetLanguage: string;
  setCoverTargetLanguage: Dispatch<SetStateAction<string>>;
  stagedEditionCover: StagedEditionCover | null;
  setStagedEditionCover: Dispatch<SetStateAction<StagedEditionCover | null>>;
  coverSharedArtwork: boolean;
  setCoverSharedArtwork: Dispatch<SetStateAction<boolean>>;
  coverUploading: boolean;
  selectedCoverFile: File | null;
  setSelectedCoverFile: Dispatch<SetStateAction<File | null>>;
  selectedCoverPreview: string;
  cropToPortrait: boolean;
  setCropToPortrait: Dispatch<SetStateAction<boolean>>;
  cropFocusX: number;
  setCropFocusX: Dispatch<SetStateAction<number>>;
  cropFocusY: number;
  setCropFocusY: Dispatch<SetStateAction<number>>;
  readerV2SchemaAvailable: boolean;
  stageCoverFile: (file: File) => Promise<void>;
  assignStagedEditionCover: () => Promise<void>;
  setEditOpen: Dispatch<SetStateAction<boolean>>;
  saveEdit: () => Promise<void>;
}) {
  return (
    <>
      {editOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="metadata-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 id="metadata-dialog-title" className="font-display text-lg font-semibold text-foreground">Edit metadata</h2>
            <div className="mt-3 space-y-2.5">
              <input
                value={editDraft.title}
                onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Title"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={editDraft.author}
                onChange={(e) => setEditDraft((d) => ({ ...d, author: e.target.value }))}
                placeholder="Author byline"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <textarea
                value={editDraft.description}
                onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Description"
                rows={4}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <select
                value={editDraft.genre}
                onChange={(e) => setEditDraft((d) => ({ ...d, genre: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">No genre</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <div className="rounded-xl border border-border bg-secondary/30 p-3">
                <label htmlFor="admin-book-cover-url" className="block text-xs font-semibold text-foreground">
                  Cover artwork for this exact edition
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Check the title, source edition and language against the artwork before saving. Do not reuse a translation cover for a different original edition.
                </p>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  Source edition: <span className="font-semibold text-foreground">{book.source_edition_id || book.source_scan_id || "Not recorded"}</span>
                  {book.edition_title ? " · " + book.edition_title : ""}
                </p>
                <input
                  id="admin-book-cover-url"
                  value={editDraft.coverUrl}
                  onChange={(e) => {
                    setCoverPreviewFailed(false);
                    setEditDraft((d) => ({ ...d, coverUrl: e.target.value }));
                  }}
                  placeholder="https://… or /book-covers/…"
                  className="mt-3 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="mt-3 grid gap-3 rounded-lg border border-border bg-card p-3">
                  <label className="block text-xs font-semibold text-foreground">
                    Target verified source edition
                    <select
                      value={coverTargetLanguage}
                      onChange={(event) => {
                        setCoverTargetLanguage(event.target.value);
                        setStagedEditionCover(null);
                        setSelectedCoverFile(null);
                      }}
                      className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
                    >
                      {[...new Set([book.source_language, ...book.available_languages])].map((language) => {
                        const edition = editions.find((item) => item.language === language);
                        return (
                          <option key={language} value={language} disabled={!edition}>
                            {language} · {edition?.source_edition_id || "No verified edition record"}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    A cover assigned here belongs only to the selected original or published translation.
                    Source edition and language are confirmed again on the server.
                  </p>
                  <label className="block text-xs font-semibold text-foreground">
                    Artwork creator, publisher or licensed source (required)
                    <input
                      value={coverAttribution}
                      onChange={(event) => setCoverAttribution(event.target.value)}
                      placeholder="e.g., artwork created for this edition"
                      maxLength={500}
                      className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={coverSharedArtwork}
                      onChange={(event) => setCoverSharedArtwork(event.target.checked)}
                      className="h-4 w-4"
                    />
                    Shared collection artwork (not specific to one translation)
                  </label>
                  <label className="block text-xs font-semibold text-foreground">
                    Upload JPG, PNG or WebP (maximum 3 MB; 2:3 portrait recommended)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Upload cover for this source edition"
                      disabled={coverUploading || coverAttribution.trim().length < 3 || !coverTargetLanguage}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          setSelectedCoverFile(file);
                          setStagedEditionCover(null);
                        }
                        event.target.value = "";
                      }}
                      className="mt-2 block w-full cursor-pointer rounded-lg border border-border bg-background p-2 text-xs font-normal text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:font-semibold file:text-primary-foreground disabled:opacity-50"
                    />
                  </label>
                  {selectedCoverFile && (
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-sm font-semibold text-foreground">
                        Review before staging · {coverTargetLanguage}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Original image remains unchanged unless you explicitly enable cropping.
                      </p>
                      {selectedCoverPreview && (
                        <img src={selectedCoverPreview} alt="Portrait preview before staging"
                          width={150} height={225}
                          style={{
                            objectFit: cropToPortrait ? "cover" : "contain",
                            objectPosition: cropFocusX + "% " + cropFocusY + "%",
                          }}
                          className="mt-3 aspect-[2/3] h-[225px] w-[150px] rounded-lg border border-border bg-secondary" />
                      )}
                      <label className="mt-3 flex min-h-11 items-center gap-2 text-xs font-semibold text-foreground">
                        <input type="checkbox" checked={cropToPortrait}
                          onChange={(event) => setCropToPortrait(event.target.checked)} />
                        Crop to 2:3 portrait (removes edges only by your choice)
                      </label>
                      {cropToPortrait && (
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-foreground">
                            Horizontal focus · {cropFocusX}%
                            <input aria-label="Horizontal crop focus" type="range" min="0" max="100"
                              value={cropFocusX} onChange={(event) => setCropFocusX(Number(event.target.value))}
                              className="mt-2 block w-full" />
                          </label>
                          <label className="text-xs font-semibold text-foreground">
                            Vertical focus · {cropFocusY}%
                            <input aria-label="Vertical crop focus" type="range" min="0" max="100"
                              value={cropFocusY} onChange={(event) => setCropFocusY(Number(event.target.value))}
                              className="mt-2 block w-full" />
                          </label>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={coverUploading || !coverAttribution.trim() || !coverTargetLanguage}
                          onClick={() => void stageCoverFile(selectedCoverFile)}
                          className="min-h-11 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                          Stage reviewed cover
                        </button>
                        <button type="button" onClick={() => setSelectedCoverFile(null)}
                          className="min-h-11 rounded-lg border border-border px-4 py-2 text-xs font-semibold">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {coverUploading && <p role="status" className="text-xs text-primary">Uploading and validating cover…</p>}
                  {stagedEditionCover && (
                    <div className="rounded-xl border border-primary/25 bg-background p-3">
                      <img src={stagedEditionCover.url}
                        alt={`Staged cover for ${stagedEditionCover.language} source edition`}
                        width={120} height={180} className="aspect-[2/3] w-24 rounded-lg object-contain" />
                      <p className="mt-2 text-xs font-semibold text-foreground">
                        {stagedEditionCover.language} · {stagedEditionCover.sourceEditionId}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        This staged source and its attribution are locked until assignment. Other languages and books remain unchanged.
                      </p>
                      <button type="button"
                        disabled={busy || coverUploading || !canPublish || stagedEditionCover.language !== coverTargetLanguage}
                        onClick={() => void assignStagedEditionCover()}
                        className="mt-3 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                        Assign to this verified edition
                      </button>
                      {stagedEditionCover.language !== coverTargetLanguage && (
                        <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                          Select {stagedEditionCover.language} before assigning this reviewed image.
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Uploads are staged in Supabase Storage with the book's edition identifier and attribution.
                    No edition cover goes live until you click Assign to this verified edition. The separate book-level URL field is for generic collection artwork only.
                  </p>
                </div>
                {editDraft.coverUrl.trim() ? (
                  <div className="mt-3 flex items-start gap-3">
                    {!coverPreviewFailed && (
                      <img
                        key={editDraft.coverUrl.trim()}
                        src={editDraft.coverUrl.trim()}
                        alt={"Proposed cover for " + editDraft.title}
                        width={96}
                        height={144}
                        loading="lazy"
                        onError={() => setCoverPreviewFailed(true)}
                        className="aspect-[2/3] w-24 shrink-0 rounded-md border border-border bg-card object-contain"
                      />
                    )}
                    <p className={"text-xs leading-relaxed " + (coverPreviewFailed ? "text-destructive" : "text-muted-foreground")} role="status">
                      {coverPreviewFailed
                        ? "Cover preview could not load. Check the file URL before saving."
                        : "Preview only — artwork will not be assigned until you save metadata."}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No cover is assigned. Readers will see the edition fallback artwork.
                  </p>
                )}
              </div>
              {readerV2SchemaAvailable && (
                <div className="rounded-xl border border-border bg-secondary/30 p-3">
                  <p className="mb-2 text-xs font-semibold text-foreground">
                    Exact edition & discovery metadata
                  </p>
                  <div className="space-y-2">
                    <input
                      value={editDraft.editionTitle}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, editionTitle: e.target.value }))
                      }
                      placeholder="Edition title (e.g. Revised edition)"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={1}
                        max={3000}
                        value={editDraft.editionYear}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, editionYear: e.target.value }))
                        }
                        placeholder="Edition year"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min={-5000}
                        max={3000}
                        value={editDraft.originalPublicationYear}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            originalPublicationYear: e.target.value,
                          }))
                        }
                        placeholder="Original year (negative = BCE)"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <input
                      value={editDraft.publisher}
                      onChange={(e) => setEditDraft((d) => ({ ...d, publisher: e.target.value }))}
                      placeholder="Publisher"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={editDraft.isbn}
                        onChange={(e) => setEditDraft((d) => ({ ...d, isbn: e.target.value }))}
                        placeholder="ISBN"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                      <input
                        value={editDraft.sourceScanId}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, sourceScanId: e.target.value }))
                        }
                        placeholder="Source scan / edition ID"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Rights, access, and pricing fields aren't edited here — this stays admin-published
              immediately, no re-review required (you are the reviewer).
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditOpen(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveEdit()}
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
