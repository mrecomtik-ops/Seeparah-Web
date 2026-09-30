import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Eye, Loader2, Pencil, Trash2 } from "lucide-react";
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
  adminReplaceSacredReferenceManifest,
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
import type { BookDeletionImpact, SacredReferenceManifestNode } from "@/lib/admin/catalog.server";
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewChunkIndex, setPreviewChunkIndex] = useState(0);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

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
  const [referenceManifestBusy, setReferenceManifestBusy] = useState(false);
  const [referenceManifestLanguage, setReferenceManifestLanguage] = useState("");
  const [referenceManifestText, setReferenceManifestText] = useState("");
  const [sourcedEditionDraft, setSourcedEditionDraft] = useState({
    language: "",
    provenanceType: "human_translation" as
      "human_translation" | "licensed_translation" | "public_domain_translation",
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
  const masterCategories =
    (masterCategoriesQuery.data?.["categories"] as string[] | undefined) ?? [];

  const detailQuery = useQuery({
    queryKey: ["admin-book", bookId],
    queryFn: async () =>
      adminGetCatalogBook({ data: { accessToken: await getAccessToken(), bookId } }),
  });

  useEffect(() => {
    const loaded = detailQuery.data?.book;
    if (!loaded) return;
    setContentPolicyDraft({
      classification: loaded.content_classification === "religious" ? "religious" : "general",
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

    const isReligiousUpgrade =
      book.content_classification !== "religious" &&
      contentPolicyDraft.classification === "religious";

    if (isReligiousUpgrade) {
      const hasAiEdition = editions.some((edition) => edition.provenance_type === "ai_assisted");
      const hasActiveAiJob = jobs.some((job) =>
        ["pending", "processing", "awaiting_review", "published"].includes(job.status),
      );
      if (hasAiEdition || hasActiveAiJob) {
        toast.error(
          "Resolve existing AI-assisted translated editions and active/published translation jobs before changing this book to Religious.",
        );
        return;
      }
    }

    if (isReligiousDowngrade) {
      if (session.role !== "owner") {
        toast.error("Only the owner can change a Religious book back to General.");
        return;
      }
      downgradeReason = window.prompt(
        "Religious protection is being removed. The book must already be unpublished. Enter the reason (at least 20 characters). Existing verified sourced editions must be resolved first, and translation permission will reset to No.",
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

  async function importSacredReferenceManifest() {
    let nodes: SacredReferenceManifestNode[];
    try {
      const parsed = JSON.parse(referenceManifestText) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Reference manifest must be a non-empty JSON array.");
      }
      nodes = parsed as SacredReferenceManifestNode[];
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reference manifest is not valid JSON.");
      return;
    }

    setReferenceManifestBusy(true);
    try {
      const language = referenceManifestLanguage || book.source_language;
      const result = await adminReplaceSacredReferenceManifest({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language,
          nodes,
        },
      });
      toast.success(
        `Imported ${result.count} canonical references for ${result.language}; structure review reset to pending.`,
      );
      setReferenceManifestText("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Canonical reference import failed.");
    } finally {
      setReferenceManifestBusy(false);
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
                editionYear: editDraft.editionYear.trim() ? Number(editDraft.editionYear) : null,
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
      toast.success(
        "Rights & provenance saved — approve the rights review when the evidence is verified.",
      );
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

  async function loadPreviewChunk(index: number) {
    const safeIndex = Math.min(Math.max(index, 0), Math.max(0, book.total_chunks - 1));
    setPreviewLoading(true);
    try {
      const chunk = await adminGetChunkForEdit({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: book.source_language,
          chunkIndex: safeIndex,
        },
      });
      if (!chunk) {
        toast.error("That page could not be loaded.");
        return;
      }
      setPreviewChunkIndex(safeIndex);
      setPreviewContent(chunk.pending_content ?? chunk.content);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't preview this page");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function openPreview() {
    setPreviewOpen(true);
    await loadPreviewChunk(0);
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
            {canReview && (
              <button
                onClick={() => void openPreview()}
                className="inline-flex items-center gap-1.5 min-h-10 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Eye className="h-3.5 w-3.5" /> Preview book
              </button>
            )}
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
                    <p className="mt-1 leading-relaxed text-muted-foreground">{signal.snippet}</p>
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
              Approval requires a substantive rights basis and a real http(s) evidence URL for this
              exact edition. Placeholder or unresolved text such as “hh”, “test”, “unknown”,
              “PENDING”, or “do not approve” is rejected.
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
                <Row
                  label="Edition year"
                  value={book.edition_year ? String(book.edition_year) : "—"}
                />
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
                    book.estimated_reading_minutes ? `${book.estimated_reading_minutes} min` : "—"
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