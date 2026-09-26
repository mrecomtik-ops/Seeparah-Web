import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import { GENRES, LANGUAGES } from "@/lib/data";
import { getAccessToken, useResolvedAdminSession, can } from "@/lib/admin/use-admin-session";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";
import {
  adminGetCatalogBook,
  adminReviewBookRights,
  adminReviewBookEdition,
  adminAcknowledgeBookRightsSignals,
  adminReviewBookReaderQuality,
  adminPublishCatalogBook,
  adminSetBookLifecycle,
  adminReviewAndPublishTranslationEdition,
  adminProcessTranslationJobBatch,
  adminQueueTranslationJob,
  adminSetEditionAccessType,
  adminSetBookContentPolicy,
  adminImportVerifiedSourcedEdition,
  adminUpdateBookMetadata,
  adminUpdateBookRightsProvenance,
  adminGetBookDeletionImpact,
  adminDeleteBookPermanently,
  adminGetChunkForEdit,
  adminStageChunkContentEdit,
  adminPublishChunkContentEdit,
  adminDiscardChunkContentEdit,
  adminSetBookCategories,
} from "@/lib/admin/catalog.functions";
import type { BookDeletionImpact } from "@/lib/admin/catalog.server";
import { friendlyTranslationError } from "@/lib/translation-error";


export const Route = createFileRoute("/admin/books/$bookId")({
  component: AdminBookDetail,
});

function AdminBookDetail() {
  const { bookId } = Route.useParams();
  const navigate = useNavigate();
  const session = useResolvedAdminSession();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: "",
    author: "",
    description: "",
    genre: "",
    coverUrl: "",
    editionTitle: "",
    editionYear: "",
    publisher: "",
    isbn: "",
    sourceScanId: "",
    originalPublicationYear: "",
  });
  const [rightsEditOpen, setRightsEditOpen] = useState(false);
  const [rightsDraft, setRightsDraft] = useState({
    rightsBasis: "",
    rightsEvidenceUrl: "",
    sourceUrl: "",
    attribution: "",
    translationPermission: false,
    permittedTerritories: "",
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [permDeleteImpact, setPermDeleteImpact] = useState<BookDeletionImpact | null>(null);
  const [permDeleteConfirmText, setPermDeleteConfirmText] = useState("");

  const [editorLanguage, setEditorLanguage] = useState("");
  const [editorChunkIndex, setEditorChunkIndex] = useState(0);
  const [editorContent, setEditorContent] = useState<string | null>(null);
  const [editorPending, setEditorPending] = useState<{
    content: string;
    by: string | null;
    at: string | null;
  } | null>(null);
  const [editorDraft, setEditorDraft] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);

  const [categoriesBusy, setCategoriesBusy] = useState(false);
  const [contentPolicyBusy, setContentPolicyBusy] = useState(false);
  const [contentPolicyDraft, setContentPolicyDraft] = useState({
    classification: "general" as "general" | "religious",
    typographyProfile: "standard",
    authenticityNotes: "",
  });
  const [sourcedEditionOpen, setSourcedEditionOpen] = useState(false);
  const [sourcedEditionBusy, setSourcedEditionBusy] = useState(false);
  const [sourcedEditionDraft, setSourcedEditionDraft] = useState({
    language: "",
    provenanceType: "human_translation" as
      | "human_translation"
      | "licensed_translation"
      | "public_domain_translation",
    typographyProfile: "facsimile_preserving",
    editionTitle: "",
    translator: "",
    sourceUrl: "",
    sourceEditionId: "",
    rightsBasis: "",
    rightsEvidenceUrl: "",
    authenticityNotes: "",
    manuscriptText: "",
  });
  const masterCategoriesQuery = useQuery({
    queryKey: ["public-content-settings"],
    queryFn: () => getPublicContentSettings(),
  });
  const masterCategories = (masterCategoriesQuery.data?.["categories"] as string[] | undefined) ?? [];

  const detailQuery = useQuery({
    queryKey: ["admin-book", bookId],
    queryFn: async () =>
      adminGetCatalogBook({ data: { accessToken: await getAccessToken(), bookId } }),
  });

  useEffect(() => {
    const loaded = detailQuery.data?.book;
    if (!loaded) return;
    setContentPolicyDraft({
      classification:
        loaded.content_classification === "religious" ? "religious" : "general",
      typographyProfile: loaded.typography_profile ?? "standard",
      authenticityNotes: loaded.authenticity_notes ?? "",
    });
  }, [
    detailQuery.data?.book?.id,
    detailQuery.data?.book?.content_classification,
    detailQuery.data?.book?.typography_profile,
    detailQuery.data?.book?.authenticity_notes,
  ]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-book", bookId] });
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That action failed");
    } finally {
      setBusy(false);
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <p className="text-sm text-destructive">Couldn't load this book.</p>;
  }

  const { book, jobs, gate, editions, rightsSignals } = detailQuery.data;
  const canReview = can(session, "catalog.review");
  const canPublish = can(session, "catalog.publish");
  const canManageTranslations = can(session, "translation.jobs.manage");
  const canDeletePermanently = can(session, "catalog.delete_permanent");
  const readerV2SchemaAvailable = book.structure_review_status !== undefined;
  const rightsRiskReviewed =
    rightsSignals.length === 0 || Boolean(book.rights_risk_acknowledged_at);
  const editionMetadataComplete =
    Boolean(book.edition_title?.trim()) &&
    Boolean(book.edition_year) &&
    Boolean(book.publisher?.trim()) &&
    Boolean(book.isbn?.trim() || book.source_scan_id?.trim()) &&
    book.original_publication_year != null &&
    Boolean(book.word_count && book.word_count > 0) &&
    Boolean(book.estimated_reading_minutes && book.estimated_reading_minutes > 0);

  const allLanguages = [
    ...new Set([
      book.source_language,
      ...book.available_languages,
      ...jobs.map((job) => job.language),
    ]),
  ];

  async function saveContentPolicy() {
    let downgradeReason: string | null = null;
    const isReligiousDowngrade =
      book.content_classification === "religious" &&
      contentPolicyDraft.classification === "general";

    if (isReligiousDowngrade) {
      if (session.role !== "owner") {
        toast.error("Only the owner can change a Religious book back to General.");
        return;
      }
      downgradeReason = window.prompt(
        "Religious protection is being removed. Enter the reason (at least 20 characters). Existing verified sourced editions must be resolved first.",
      );
      if (downgradeReason === null) return;
      if (downgradeReason.trim().length < 20) {
        toast.error("Enter a substantive reason of at least 20 characters.");
        return;
      }
      if (
        !window.confirm(
          "Confirm downgrade from Religious to General? This re-enables the normal AI translation policy only after the server and database safeguards accept the change.",
        )
      ) {
        return;
      }
    }

    setContentPolicyBusy(true);
    try {
      await adminSetBookContentPolicy({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          classification: contentPolicyDraft.classification,
          typographyProfile: contentPolicyDraft.typographyProfile as
            | "standard"
            | "scripture_arabic"
            | "scripture_urdu"
            | "scripture_hebrew"
            | "scripture_indic"
            | "facsimile_preserving",
          authenticityNotes: contentPolicyDraft.authenticityNotes.trim() || null,
          downgradeReason,
        },
      });
      toast.success(
        contentPolicyDraft.classification === "religious"
          ? "Religious policy saved — original and verified editions stay free; AI translation is disabled."
          : "General book policy saved.",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save content policy");
    } finally {
      setContentPolicyBusy(false);
    }
  }

  async function importSourcedEdition() {
    if (!sourcedEditionDraft.language) {
      toast.error("Choose the sourced edition language.");
      return;
    }
    if (
      !sourcedEditionDraft.sourceUrl.trim() ||
      !sourcedEditionDraft.rightsEvidenceUrl.trim() ||
      !sourcedEditionDraft.rightsBasis.trim() ||
      !sourcedEditionDraft.manuscriptText.trim()
    ) {
      toast.error("Source URL, rights basis/evidence, and sourced text are required.");
      return;
    }

    const sectionCount = sourcedEditionDraft.manuscriptText
      .replace(/\r\n/g, "\n")
      .split(/\n\s*===SEEPARAH_SECTION===\s*\n/giu)
      .map((section) => section.trim())
      .filter(Boolean).length;

    if (sectionCount !== book.total_chunks) {
      toast.error(
        `This sourced edition has ${sectionCount} section(s); align it to exactly ${book.total_chunks} with ===SEEPARAH_SECTION=== dividers first.`,
      );
      return;
    }

    if (
      !window.confirm(
        `Import and immediately publish the verified ${sourcedEditionDraft.language} sourced edition for free? Confirm only after checking the exact source, rights evidence, text, diacritics/marks, section alignment, and typography requirements.`,
      )
    ) {
      return;
    }

    setSourcedEditionBusy(true);
    try {
      const result = await adminImportVerifiedSourcedEdition({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: sourcedEditionDraft.language,
          provenanceType: sourcedEditionDraft.provenanceType,
          typographyProfile: sourcedEditionDraft.typographyProfile as
            | "standard"
            | "scripture_arabic"
            | "scripture_urdu"
            | "scripture_hebrew"
            | "scripture_indic"
            | "facsimile_preserving",
          editionTitle: sourcedEditionDraft.editionTitle.trim() || null,
          translator: sourcedEditionDraft.translator.trim() || null,
          sourceUrl: sourcedEditionDraft.sourceUrl.trim(),
          sourceEditionId: sourcedEditionDraft.sourceEditionId.trim() || null,
          rightsBasis: sourcedEditionDraft.rightsBasis.trim(),
          rightsEvidenceUrl: sourcedEditionDraft.rightsEvidenceUrl.trim(),
          authenticityNotes: sourcedEditionDraft.authenticityNotes.trim() || null,
          manuscriptText: sourcedEditionDraft.manuscriptText,
        },
      });
      toast.success(
        `${result.language} verified sourced edition published free (${result.sectionCount} sections)`,
      );
      setSourcedEditionOpen(false);
      setSourcedEditionDraft({
        language: "",
        provenanceType: "human_translation",
        typographyProfile: "facsimile_preserving",
        editionTitle: "",
        translator: "",
        sourceUrl: "",
        sourceEditionId: "",
        rightsBasis: "",
        rightsEvidenceUrl: "",
        authenticityNotes: "",
        manuscriptText: "",
      });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sourced edition import failed");
    } finally {
      setSourcedEditionBusy(false);
    }
  }

  function openEdit() {
    setEditDraft({
      title: book.title,
      author: book.author,
      description: book.description,
      genre: book.genre ?? "",
      coverUrl: book.cover_url ?? "",
      editionTitle: book.edition_title ?? "",
      editionYear: book.edition_year ? String(book.edition_year) : "",
      publisher: book.publisher ?? "",
      isbn: book.isbn ?? "",
      sourceScanId: book.source_scan_id ?? "",
      originalPublicationYear: book.original_publication_year
        ? String(book.original_publication_year)
        : "",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editDraft.title.trim() || !editDraft.description.trim()) {
      toast.error("Title and description can't be empty.");
      return;
    }
    await withBusy(async () => {
      await adminUpdateBookMetadata({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          title: editDraft.title.trim(),
          author: editDraft.author.trim(),
          description: editDraft.description.trim(),
          genre: editDraft.genre.trim() || null,
          coverUrl: editDraft.coverUrl.trim() || null,
          ...(readerV2SchemaAvailable
            ? {
                editionTitle: editDraft.editionTitle.trim() || null,
                editionYear: editDraft.editionYear.trim()
                  ? Number(editDraft.editionYear)
                  : null,
                publisher: editDraft.publisher.trim() || null,
                isbn: editDraft.isbn.trim() || null,
                sourceScanId: editDraft.sourceScanId.trim() || null,
                originalPublicationYear: editDraft.originalPublicationYear.trim()
                  ? Number(editDraft.originalPublicationYear)
                  : null,
              }
            : {}),
        },
      });
      toast.success("Saved");
      setEditOpen(false);
    });
  }

  function openRightsEdit() {
    setRightsDraft({
      rightsBasis: book.rights_basis ?? "",
      rightsEvidenceUrl: book.rights_evidence_url ?? "",
      sourceUrl: book.source_url ?? "",
      attribution: book.attribution ?? "",
      translationPermission: Boolean(book.translation_permission),
      permittedTerritories: book.permitted_territories?.join(", ") ?? "",
    });
    setRightsEditOpen(true);
  }

  async function saveRightsEdit() {
    if (!rightsDraft.rightsBasis.trim()) {
      toast.error("Rights basis can't be empty.");
      return;
    }
    const permittedTerritories = rightsDraft.permittedTerritories
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    await withBusy(async () => {
      await adminUpdateBookRightsProvenance({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          rightsBasis: rightsDraft.rightsBasis.trim(),
          rightsEvidenceUrl: rightsDraft.rightsEvidenceUrl.trim() || null,
          sourceUrl: rightsDraft.sourceUrl.trim() || null,
          attribution: rightsDraft.attribution.trim() || null,
          translationPermission: rightsDraft.translationPermission,
          permittedTerritories,
        },
      });
      toast.success("Rights & provenance saved — approve the rights review when the evidence is verified.");
      setRightsEditOpen(false);
    });
  }

  async function confirmDelete() {
    await withBusy(async () => {
      await adminSetBookLifecycle({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          status: "archived",
          reason: "Deleted (reversible) from the admin book detail view",
        },
      });
      toast.success("Archived — reversible from here anytime.");
      setDeleteOpen(false);
    });
  }

  async function openPermDelete() {
    setPermDeleteConfirmText("");
    setPermDeleteImpact(null);
    setPermDeleteOpen(true);
    try {
      const impact = await adminGetBookDeletionImpact({
        data: { accessToken: await getAccessToken(), bookId },
      });
      setPermDeleteImpact(impact);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load deletion impact");
      setPermDeleteOpen(false);
    }
  }

  async function confirmPermDelete() {
    await withBusy(async () => {
      await adminDeleteBookPermanently({
        data: { accessToken: await getAccessToken(), bookId, confirmTitle: permDeleteConfirmText },
      });
      toast.success("Permanently deleted");
      setPermDeleteOpen(false);
      navigate({ to: "/admin/books" });
    });
  }

  async function loadChunkForEdit() {
    setEditorLoading(true);
    setEditorContent(null);
    setEditorPending(null);
    try {
      const chunk = await adminGetChunkForEdit({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: editorLanguage,
          chunkIndex: editorChunkIndex,
        },
      });
      if (!chunk) {
        toast.error("No page at that language/index.");
        return;
      }
      setEditorContent(chunk.content);
      setEditorDraft(chunk.pending_content ?? chunk.content);
      if (chunk.pending_content) {
        setEditorPending({
          content: chunk.pending_content,
          by: chunk.pending_content_by,
          at: chunk.pending_content_at,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load this page");
    } finally {
      setEditorLoading(false);
    }
  }

  async function stageEdit() {
    await withBusy(async () => {
      await adminStageChunkContentEdit({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: editorLanguage,
          chunkIndex: editorChunkIndex,
          newContent: editorDraft,
        },
      });
      toast.success("Staged — publish this edit once you're satisfied it reads correctly.");
    });
    await loadChunkForEdit();
  }

  async function publishEdit() {
    await withBusy(async () => {
      await adminPublishChunkContentEdit({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: editorLanguage,
          chunkIndex: editorChunkIndex,
        },
      });
      toast.success("Published — this page now shows the edited text to readers.");
    });
    await loadChunkForEdit();
  }

  async function discardEdit() {
    await withBusy(async () => {
      await adminDiscardChunkContentEdit({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: editorLanguage,
          chunkIndex: editorChunkIndex,
        },
      });
      toast.success("Pending edit discarded");
    });
    await loadChunkForEdit();
  }

  async function toggleCategory(category: string, current: string[]) {
    setCategoriesBusy(true);
    try {
      const next = current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category];
      await adminSetBookCategories({
        data: { accessToken: await getAccessToken(), bookId, categories: next },
      });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update categories");
    } finally {
      setCategoriesBusy(false);
    }
  }

  return (
    <div className="min-w-0 overflow-x-hidden">
      <Link
        to="/admin/books"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Catalog
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">{book.title}</h1>
          <p className="text-sm text-muted-foreground">
            by {book.author} · {book.source_language} · status: {book.status}
          </p>
        </div>
        {canPublish && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            {book.status !== "archived" && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 min-h-10 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
            {canDeletePermanently && (
              <button
                onClick={() => void openPermDelete()}
                className="inline-flex items-center gap-1.5 min-h-10 rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground hover:opacity-90"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete permanently
              </button>
            )}
          </div>
        )}
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 card-shadow">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-foreground">
              Rights & provenance
            </h2>
            {canReview && (
              <button
                type="button"
                disabled={busy || book.status === "published"}
                title={
                  book.status === "published"
                    ? "Unpublish the book before changing rights information."
                    : "Edit rights and provenance"
                }
                onClick={openRightsEdit}
                className="inline-flex items-center gap-1.5 min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit rights
              </button>
            )}
          </div>
          {book.status === "published" && canReview && (
            <p className="mt-2 text-xs text-muted-foreground">
              Unpublish this book before changing its rights record; any rights change must be
              reviewed again before republishing.
            </p>
          )}
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Rights status" value={book.rights_status} />
            <Row label="Rights basis" value={book.rights_basis ?? "—"} />
            <Row label="Rights evidence" value={book.rights_evidence_url ?? "—"} />
            <Row label="Attribution" value={book.attribution ?? "—"} />
            <Row label="Source URL" value={book.source_url ?? "—"} />
            <Row
              label="Translation permission"
              value={book.translation_permission ? "Yes" : "No"}
            />
            <Row
              label="Permitted territories"
              value={
                book.permitted_territories?.length
                  ? book.permitted_territories.join(", ")
                  : "Unrestricted"
              }
            />
          </dl>
          {rightsSignals.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                Edition text contains rights-review clues
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                These are automated text signals, not a legal conclusion. Compare them with the
                exact edition/source evidence before approving rights.
              </p>
              <ul className="mt-2 space-y-2">
                {rightsSignals.map((signal, i) => (
                  <li
                    key={`${signal.chunkIndex}:${signal.label}:${i}`}
                    className="rounded-lg bg-background/70 px-2.5 py-2 text-xs"
                  >
                    <span className="font-semibold text-foreground">
                      {signal.label} · section {signal.chunkIndex + 1}
                    </span>
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      {signal.snippet}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {book.rights_risk_acknowledged_at ? (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    ✓ Reviewed {new Date(book.rights_risk_acknowledged_at).toLocaleString()}
                  </span>
                ) : canReview ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      withBusy(async () => {
                        await adminAcknowledgeBookRightsSignals({
                          data: { accessToken: await getAccessToken(), bookId },
                        });
                        toast.success("Rights-risk clues acknowledged");
                      })
                    }
                    className="rounded-lg border border-amber-500/40 bg-background px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-200"
                  >
                    I reviewed these clues
                  </button>
                ) : null}
              </div>
            </div>
          )}
          {canReview && book.rights_status !== "approved" && (
            <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              Approval requires a substantive rights basis and a real http(s) evidence URL for
              this exact edition. Placeholder or unresolved text such as “hh”, “test”, “unknown”, “PENDING”, or “do not approve” is rejected.
            </p>
          )}
          {canReview && ["pending", "unverified", "rejected"].includes(book.rights_status) && (
            <div className="mt-4 flex gap-2">
              <button
                disabled={busy || !rightsRiskReviewed}
                title={
                  !rightsRiskReviewed
                    ? "Review and acknowledge the manuscript rights clues first."
                    : "Approve rights"
                }
                onClick={() =>
                  withBusy(async () => {
                    await adminReviewBookRights({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "approved",
                        notes,
                      },
                    });
                    toast.success("Rights approved");
                  })
                }
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                Approve rights
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    await adminReviewBookRights({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "rejected",
                        notes,
                      },
                    });
                    toast.success("Rights rejected");
                  })
                }
                className="min-h-10 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
              >
                Reject rights
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">
            Edition quality review
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Edition review status" value={book.edition_review_status} />
            <Row label="Total chunks" value={String(book.total_chunks)} />
            <Row label="Available languages" value={book.available_languages.join(", ")} />
            {readerV2SchemaAvailable && (
              <>
                <Row label="Edition" value={book.edition_title ?? "—"} />
                <Row label="Edition year" value={book.edition_year ? String(book.edition_year) : "—"} />
                <Row label="Publisher" value={book.publisher ?? "—"} />
                <Row label="ISBN / source ID" value={book.isbn ?? book.source_scan_id ?? "—"} />
                <Row
                  label="Original publication"
                  value={
                    book.original_publication_year
                      ? formatPublicationYear(book.original_publication_year)
                      : "—"
                  }
                />
                <Row
                  label="Word count"
                  value={book.word_count ? book.word_count.toLocaleString() : "—"}
                />
                <Row
                  label="Estimated reading time"
                  value={
                    book.estimated_reading_minutes
                      ? `${book.estimated_reading_minutes} min`
                      : "—"
                  }
                />
                <Row label="Structure review" value={book.structure_review_status ?? "—"} />
                <Row label="Text cleanup review" value={book.cleanup_review_status ?? "—"} />
              </>
            )}
            <Row label="Review notes" value={book.review_notes ?? "—"} />
          </dl>
          {canReview && book.edition_review_status !== "approved" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    await adminReviewBookEdition({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "approved",
                        notes,
                      },
                    });
                    toast.success("Edition approved");
                  })
                }
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                Approve edition
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    await adminReviewBookEdition({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "changes_requested",
                        notes,
                      },
                    });
                    toast.success("Changes requested");
                  })
                }
                className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
              >
                Request changes
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    await adminReviewBookEdition({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "rejected",
                        notes,
                      },
                    });
                    toast.success("Edition rejected");
                  })
                }
                className="min-h-10 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          )}

          {readerV2SchemaAvailable && canReview && (
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              {(["structure", "cleanup"] as const).map((target) => {
                const status =
                  target === "structure"
                    ? book.structure_review_status
                    : book.cleanup_review_status;
                const label = target === "structure" ? "Structure review" : "Text cleanup review";
                return (
                  <div key={target} className="rounded-xl border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{label}</span>
                      <span className="text-xs text-muted-foreground">{status ?? "pending"}</span>
                    </div>
                    {status !== "approved" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          disabled={busy}
                          onClick={() =>
                            withBusy(async () => {
                              await adminReviewBookReaderQuality({
                                data: {
                                  accessToken: await getAccessToken(),
                                  bookId,
                                  target,
                                  decision: "approved",
                                  notes,
                                },
                              });
                              toast.success(`${label} approved`);
                            })
                          }
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            withBusy(async () => {
                              await adminReviewBookReaderQuality({
                                data: {
                                  accessToken: await getAccessToken(),
                                  bookId,
                                  target,
                                  decision: "changes_requested",
                                  notes,
                                },
                              });
                              toast.success(`${label}: changes requested`);
                            })
                          }
                          className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                        >
                          Request changes
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            withBusy(async () => {
                              await adminReviewBookReaderQuality({
                                data: {
                                  accessToken: await getAccessToken(),
                                  bookId,
                                  target,
                                  decision: "rejected",
                                  notes,
                                },
                              });
                              toast.success(`${label} rejected`);
                            })
                          }
                          className="min-h-10 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {canReview && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for this decision (shown to the author, recorded in the audit log)…"
          className="mt-4 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">
          Publishing checklist
        </h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Rights review</span>
            <span className={book.rights_status === "approved" ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
              {book.rights_status === "approved" ? "✓ Approved" : "○ Approval required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Edition quality review</span>
            <span className={book.edition_review_status === "approved" ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
              {book.edition_review_status === "approved" ? "✓ Approved" : "○ Approval required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Structure review</span>
            <span className={book.structure_review_status === "approved" ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
              {book.structure_review_status === "approved" ? "✓ Approved" : "○ Approval required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Text cleanup review</span>
            <span className={book.cleanup_review_status === "approved" ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
              {book.cleanup_review_status === "approved" ? "✓ Approved" : "○ Approval required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Exact-edition metadata</span>
            <span className={editionMetadataComplete ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
              {editionMetadataComplete ? "✓ Complete" : "○ Complete metadata required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Rights-risk clues</span>
            <span className={rightsRiskReviewed ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
              {rightsRiskReviewed ? "✓ Reviewed / none detected" : "○ Review acknowledgment required"}
            </span>
          </div>
        </div>
        {gate.canPublish ? (
          <p className="mt-3 text-sm font-medium text-emerald-600">
            Ready to publish — all required checks are complete.
          </p>
        ) : (
          <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              Complete the required reviews above to unlock publishing.
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              {gate.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {gate.pendingTranslations.length > 0 && (
          <div className="mt-3 rounded-xl bg-secondary/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Standard-language editions still pending — this does <strong>not</strong> block
              publishing the original: {gate.pendingTranslations.join(", ")}.
            </p>
            {canManageTranslations && (
              <div className="mt-2 flex flex-wrap gap-2">
                {gate.pendingTranslations.map((lang) => {
                  const hasJob = jobs.some((j) => j.language === lang);
                  return hasJob ? null : (
                    <button
                      key={lang}
                      disabled={busy}
                      onClick={() =>
                        withBusy(async () => {
                          await adminQueueTranslationJob({
                            data: { accessToken: await getAccessToken(), bookId, language: lang },
                          });
                          toast.success(`${lang} translation queued`);
                        })
                      }
                      className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                    >
                      Start {lang} translation
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {canPublish && book.status !== "published" && (
            <button
              disabled={busy || !gate.canPublish}
              title={!gate.canPublish ? gate.reasons.join(" • ") : "Publish this book to the public catalog"}
              onClick={() =>
                withBusy(async () => {
                  await adminPublishCatalogBook({
                    data: { accessToken: await getAccessToken(), bookId },
                  });
                  toast.success("Published");
                })
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gate.canPublish ? "Publish book" : "Publish book — complete checklist first"}
            </button>
          )}
          {canPublish && book.status === "published" && (
            <button
              disabled={busy}
              onClick={() => {
                const r = window.prompt("Reason for unpublishing (required):");
                if (!r) return;
                void withBusy(async () => {
                  await adminSetBookLifecycle({
                    data: {
                      accessToken: await getAccessToken(),
                      bookId,
                      status: "unpublished",
                      reason: r,
                    },
                  });
                  toast.success("Unpublished");
                });
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              Unpublish
            </button>
          )}
          {canPublish && book.status !== "archived" && (
            <button
              disabled={busy}
              onClick={() => {
                const r = window.prompt("Reason for archiving (required):");
                if (!r) return;
                void withBusy(async () => {
                  await adminSetBookLifecycle({
                    data: {
                      accessToken: await getAccessToken(),
                      bookId,
                      status: "archived",
                      reason: r,
                    },
                  });
                  toast.success("Archived");
                });
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              Archive
            </button>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Content policy & typography
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Religious books are permanently free, never sent to the AI translation pipeline,
              and should use verified sourced editions. Typography and authenticity notes travel
              with the catalog record so the reader can preserve the edition's script conventions.
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
                  disabled={book.content_classification === "religious" && session.role !== "owner"}
                >
                  General book
                </option>
                <option value="religious">Religious — always free, sourced translations only</option>
              </select>
              {book.content_classification === "religious" && (
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  Religious → General is an owner-only protected action and requires an explicit
                  reason. Verified sourced Religious editions must be resolved first.
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
              <span className="text-xs font-medium text-muted-foreground">
                Authenticity notes
              </span>
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
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">Access</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every original-language edition is permanently free. General translated editions are
          monthly-plan content when monetization is active. Religious books and all of their
          verified sourced editions are permanently free.
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground">
            Original edition ({book.source_language})
          </span>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            Always free
          </span>
        </div>

        {editions.length > 0 && (
          <ul className="mt-2 space-y-2">
            {editions.map((ed) => (
              <li
                key={ed.language}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-foreground">{ed.language} translation</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ed.access_type === "paid" ? "bg-gold/20 text-gold-foreground" : "bg-accent text-accent-foreground"}`}
                  >
                    {ed.access_type === "paid" ? "Premium" : "Free"}
                  </span>
                  {book.content_classification === "religious" ? (
                    <span className="text-[11px] text-muted-foreground">Always free</span>
                  ) : canPublish ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        withBusy(async () => {
                          const next = ed.access_type === "paid" ? "free" : "paid";
                          await adminSetEditionAccessType({
                            data: {
                              accessToken: await getAccessToken(),
                              bookId,
                              language: ed.language,
                              accessType: next,
                            },
                          });
                          toast.success(
                            `${ed.language} edition set to ${next === "paid" ? "Premium" : "Free"}`,
                          );
                        })
                      }
                      className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                    >
                      Switch to {ed.access_type === "paid" ? "Free" : "Premium"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {editions.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            No published translated editions yet — access settings appear here once one is
            reviewed and published below.
          </p>
        )}
      </section>

      {canPublish && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">Categories</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A book may belong to more than one category. Only categories already in the master
            list (Admin Settings → categories) can be assigned here.
          </p>
          {masterCategories.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No categories defined yet — add some to the "categories" setting in Admin Settings
              first.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {masterCategories.map((c) => {
                const active = (book.categories ?? []).includes(c);
                return (
                  <button
                    key={c}
                    disabled={
                      categoriesBusy ||
                      (c === "Religious" &&
                        book.content_classification === "religious" &&
                        (book.categories ?? []).includes("Religious"))
                    }
                    title={
                      c === "Religious" && book.content_classification === "religious"
                        ? "Religious is protected here. Use Content policy & typography for an owner-only downgrade."
                        : undefined
                    }
                    onClick={() => toggleCategory(c, book.categories ?? [])}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background text-foreground hover:bg-secondary"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">
          Translation editions
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Approved jobs are processed automatically by the translation worker. “Process next batch”
          is a manual fallback. Before publishing an awaiting-review edition, inspect every translated
          section below in Edit page content.
        </p>
        <ul className="mt-3 space-y-2">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm"
            >
              <div className="min-w-0">
                <span>
                  {j.language} — {j.status} ({j.completed_sections}/{j.total_sections},{" "}
                  {j.human_reviewed ? "reviewed" : "not yet reviewed"})
                </span>
                {j.failed_sections > 0 && (
                  <p className="mt-1 text-xs font-semibold text-destructive">
                    {j.failed_sections} section{j.failed_sections === 1 ? "" : "s"} currently failed
                  </p>
                )}
                {j.last_error && (
                  <p className="mt-1 max-w-2xl break-words rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                    {friendlyTranslationError(j.last_error)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManageTranslations &&
                  ["pending", "processing"].includes(j.status) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        withBusy(async () => {
                          const result = await adminProcessTranslationJobBatch({
                            data: { accessToken: await getAccessToken(), jobId: j.id },
                          });
                          if (result.failed > 0) {
                            toast.error(
                              result.errors[0] ??
                                `${result.failed} translation section(s) failed`,
                              { duration: 9000 },
                            );
                          } else {
                            toast.success(
                              result.jobStatus === "awaiting_review"
                                ? `${j.language} translation is ready for review`
                                : `Processed ${result.processed} section(s); status: ${result.jobStatus}`,
                            );
                          }
                        })
                      }
                      className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                    >
                      Process next batch
                    </button>
                  )}
                {canManageTranslations && j.status === "awaiting_review" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      withBusy(async () => {
                        if (
                          !window.confirm(
                            `Publish the ${j.language} edition? Confirm only after reviewing every translated section in “Edit page content”.`,
                          )
                        ) {
                          return;
                        }
                        await adminReviewAndPublishTranslationEdition({
                          data: { accessToken: await getAccessToken(), jobId: j.id },
                        });
                        toast.success(`${j.language} edition published`);
                      })
                    }
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Review & publish
                  </button>
                )}
              </div>
            </li>
          ))}
          {jobs.length === 0 && (
            <p className="text-sm text-muted-foreground">No translation jobs yet.</p>
          )}
        </ul>
      </section>

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
                        | "human_translation"
                        | "licensed_translation"
                        | "public_domain_translation",
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

      {canReview && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">
            Edit page content
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Works on any language, original or translated. An edit is staged, not published
            immediately — readers keep seeing the current text until you explicitly publish it.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Language</span>
              <select
                value={editorLanguage}
                onChange={(e) => setEditorLanguage(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Choose…</option>
                {allLanguages.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Page (0–{book.total_chunks - 1})
              </span>
              <input
                type="number"
                min={0}
                max={book.total_chunks - 1}
                value={editorChunkIndex}
                onChange={(e) => setEditorChunkIndex(Number(e.target.value))}
                className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <button
              disabled={!editorLanguage || editorLoading}
              onClick={() => void loadChunkForEdit()}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              {editorLoading ? "Loading…" : "Load"}
            </button>
          </div>

          {editorContent !== null && (
            <div className="mt-4">
              {editorPending && (
                <p className="mb-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold-foreground">
                  Pending edit staged
                  {editorPending.at ? ` ${new Date(editorPending.at).toLocaleString()}` : ""} —
                  not yet visible to readers.
                </p>
              )}
              <textarea
                value={editorDraft}
                onChange={(e) => setEditorDraft(e.target.value)}
                rows={10}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  disabled={busy || editorDraft === editorContent}
                  onClick={() => void stageEdit()}
                  className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                >
                  Stage edit
                </button>
                {editorPending && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => void publishEdit()}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      Publish staged edit
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void discardEdit()}
                      className="min-h-10 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
                    >
                      Discard staged edit
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {rightsEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Edit rights & provenance
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Record only evidence you have actually verified for this exact edition. Saving does
              not approve the book; the rights review remains pending/unverified until you approve it
              separately.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Rights basis *</span>
                <textarea
                  value={rightsDraft.rightsBasis}
                  onChange={(e) =>
                    setRightsDraft((d) => ({ ...d, rightsBasis: e.target.value }))
                  }
                  rows={4}
                  placeholder="Explain what establishes permission for this exact edition…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Rights evidence URL
                </span>
                <input
                  value={rightsDraft.rightsEvidenceUrl}
                  onChange={(e) =>
                    setRightsDraft((d) => ({ ...d, rightsEvidenceUrl: e.target.value }))
                  }
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  A valid http(s) evidence URL is required before approval.
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Source URL</span>
                <input
                  value={rightsDraft.sourceUrl}
                  onChange={(e) => setRightsDraft((d) => ({ ...d, sourceUrl: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Attribution</span>
                <textarea
                  value={rightsDraft.attribution}
                  onChange={(e) =>
                    setRightsDraft((d) => ({ ...d, attribution: e.target.value }))
                  }
                  rows={2}
                  placeholder="Required credit or attribution, if any"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Permitted territories
                </span>
                <input
                  value={rightsDraft.permittedTerritories}
                  onChange={(e) =>
                    setRightsDraft((d) => ({ ...d, permittedTerritories: e.target.value }))
                  }
                  placeholder="Leave blank for unrestricted; otherwise comma-separated"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={rightsDraft.translationPermission}
                  onChange={(e) =>
                    setRightsDraft((d) => ({ ...d, translationPermission: e.target.checked }))
                  }
                />
                Translation permission is documented
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRightsEditOpen(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveRightsEdit()}
                disabled={busy || !rightsDraft.rightsBasis.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save rights information"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">Edit metadata</h2>
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
              <input
                value={editDraft.coverUrl}
                onChange={(e) => setEditDraft((d) => ({ ...d, coverUrl: e.target.value }))}
                placeholder="Cover image URL (optional)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
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
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, publisher: e.target.value }))
                      }
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

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Delete “{book.title}”?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This archives the book — it stops being published and disappears from the catalog,
              but nothing is erased. Chunks, translations, editions, reader highlights and
              progress, requests, and audit history all stay intact, and this can be reversed from
              here anytime. For irreversible deletion, use "Delete permanently" instead (owner/
              administrator only).
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDelete()}
                disabled={busy}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {busy ? "Archiving…" : "Delete (archive)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {permDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-destructive/40 bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-destructive">
              Permanently delete “{book.title}”?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This cannot be undone. Everything below is deleted along with the book:
            </p>
            {!permDeleteImpact ? (
              <div className="mt-3 flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border bg-background p-3 text-xs">
                <li>Pages (chunks): {permDeleteImpact.chunkCount}</li>
                <li>Translated editions: {permDeleteImpact.editionCount}</li>
                <li>Translation jobs: {permDeleteImpact.translationJobCount}</li>
                <li>Reading progress rows: {permDeleteImpact.progressCount}</li>
                <li>Reader highlights: {permDeleteImpact.highlightCount}</li>
                <li>Shelf entries: {permDeleteImpact.shelfCount}</li>
                <li>Subscriptions: {permDeleteImpact.subscriptionCount}</li>
                <li>Translation requests: {permDeleteImpact.translationRequestCount}</li>
                <li>Issue reports: {permDeleteImpact.translationReportCount}</li>
                <li>
                  Support tickets referencing it: {permDeleteImpact.relatedSupportTicketCount}{" "}
                  {permDeleteImpact.relatedSupportTicketCount > 0 ? "(kept, unlinked)" : ""}
                </li>
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Moderation and audit history for this book cannot be erased and is not affected by
              this action.
            </p>
            {permDeleteImpact && permDeleteImpact.status !== "archived" && permDeleteImpact.status !== "unpublished" && (
              <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                This book is still {permDeleteImpact.status} — take it down (Delete/archive) first,
                then permanently delete it as a separate step.
              </p>
            )}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-muted-foreground">
                Type the exact title to confirm: <strong>{book.title}</strong>
              </span>
              <input
                value={permDeleteConfirmText}
                onChange={(e) => setPermDeleteConfirmText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPermDeleteOpen(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                disabled={
                  busy ||
                  !permDeleteImpact ||
                  permDeleteConfirmText !== book.title ||
                  (permDeleteImpact.status !== "archived" && permDeleteImpact.status !== "unpublished")
                }
                onClick={() => void confirmPermDelete()}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatPublicationYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BCE` : String(year);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-foreground [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}
