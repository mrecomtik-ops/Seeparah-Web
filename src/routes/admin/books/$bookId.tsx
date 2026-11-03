import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getAccessToken, useResolvedAdminSession, can } from "@/lib/admin/use-admin-session";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";
import { adminUploadBookCover, adminAssignBookEditionCover } from "@/lib/admin/cover-upload.functions";
import {
  adminGetCatalogBook,
  adminSetBookLifecycle,
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
import { AdminBookOrganizer } from "@/components/admin/AdminBookOrganizer";
import { AdminBookPublishingChecklist } from "@/components/admin/AdminBookPublishingChecklist";
import { AdminBookContentPolicy } from "@/components/admin/AdminBookContentPolicy";
import { AdminBookAccessCategories } from "@/components/admin/AdminBookAccessCategories";
import { AdminBookDestructiveDialogs } from "@/components/admin/AdminBookDestructiveDialogs";
import { AdminBookMetadataDialog } from "@/components/admin/AdminBookMetadataDialog";
import { AdminBookRightsDialog } from "@/components/admin/AdminBookRightsDialog";
import { AdminBookSourceEditPanel } from "@/components/admin/AdminBookSourceEditPanel";
import { AdminBookHeaderActions } from "@/components/admin/AdminBookHeaderActions";
import { AdminBookReviewPreview } from "@/components/admin/AdminBookReviewPreview";
import { AdminBookReviewPanels } from "@/components/admin/AdminBookReviewPanels";
import { AdminTranslationJobsPanel } from "@/components/admin/AdminTranslationJobsPanel";
import { AdminVerifiedSourcedEdition } from "@/components/admin/AdminVerifiedSourcedEdition";
import { cropCoverToPortrait } from "@/lib/admin/cover-crop";
import { lockStagedCoverReview, stagedCoverAssignment, type StagedEditionCover } from "@/lib/admin/staged-cover";

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
  const [coverPreviewFailed, setCoverPreviewFailed] = useState(false);
  const [coverAttribution, setCoverAttribution] = useState("");
  const [coverTargetLanguage, setCoverTargetLanguage] = useState("");
  const [stagedEditionCover, setStagedEditionCover] = useState<StagedEditionCover | null>(null);
  const [coverSharedArtwork, setCoverSharedArtwork] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [selectedCoverPreview, setSelectedCoverPreview] = useState("");
  const [cropToPortrait, setCropToPortrait] = useState(false);
  const [cropFocusX, setCropFocusX] = useState(50);
  const [cropFocusY, setCropFocusY] = useState(50);
  useEffect(() => {
    if (!selectedCoverFile) {
      setSelectedCoverPreview("");
      return;
    }
    const url = URL.createObjectURL(selectedCoverFile);
    setSelectedCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedCoverFile]);
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

  const detailBook = detailQuery.data?.book;

  useEffect(() => {
    if (!detailBook) return;
    setContentPolicyDraft({
      classification: detailBook.content_classification === "religious" ? "religious" : "general",
      typographyProfile: detailBook.typography_profile ?? "standard",
      authenticityNotes: detailBook.authenticity_notes ?? "",
    });
  }, [detailBook]);

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

  const { book, jobs, gate, editions, rightsSignals, structureNodes } = detailQuery.data;
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
            | "scripture_greek"
            | "scripture_pali"
            | "scripture_tibetan"
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
    setCoverPreviewFailed(false);
    setCoverAttribution("");
    setCoverTargetLanguage(book.source_language);
    setStagedEditionCover(null);
    setSelectedCoverFile(null);
    setCropToPortrait(false);
    setCropFocusX(50);
    setCropFocusY(50);
    setCoverSharedArtwork(false);
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

  async function stageCoverFile(file: File) {
    if (!coverAttribution.trim() || coverAttribution.trim().length < 3) {
      toast.error("Provide the artwork attribution or source before uploading.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
      toast.error("Choose a PNG, JPEG or WebP image no larger than 3 MB.");
      return;
    }
    setCoverUploading(true);
    try {
      const uploadFile = cropToPortrait
        ? await cropCoverToPortrait(file, cropFocusX, cropFocusY)
        : file;
      if (uploadFile.size > 3 * 1024 * 1024) {
        throw new Error("The selected portrait cover exceeds the 3 MB upload limit.");
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the selected cover file."));
        reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
        reader.readAsDataURL(uploadFile);
      });
      const uploaded = await adminUploadBookCover({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: coverTargetLanguage,
          fileBase64: base64,
          mimeType: uploadFile.type as "image/png" | "image/jpeg" | "image/webp",
          attribution: coverAttribution.trim(),
          sharedArtwork: coverSharedArtwork,
        },
      });
      setStagedEditionCover(lockStagedCoverReview(uploaded, coverAttribution, coverSharedArtwork));
      setSelectedCoverFile(null);
      toast.success("Staged for the selected source edition. Review the image and assign it explicitly.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cover upload failed.");
    } finally {
      setCoverUploading(false);
    }
  }

  async function assignStagedEditionCover() {
    const staged = stagedEditionCover;
    if (!staged || staged.language !== coverTargetLanguage) return;
    await withBusy(async () => {
      await adminAssignBookEditionCover({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          ...stagedCoverAssignment(staged, coverTargetLanguage),
        },
      });
      setStagedEditionCover(null);
      toast.success(`Assigned cover to the verified ${staged.language} edition only.`);
      await queryClient.invalidateQueries({ queryKey: ["public-book-editions", bookId] });
    });
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
        <AdminBookHeaderActions
          status={book.status}
          role={session.role}
          onPreview={openPreview}
          onEdit={openEdit}
          onArchive={() => setDeleteOpen(true)}
          onPermanentDelete={openPermDelete}
        />
      </div>

      <AdminBookReviewPanels
        book={book}
        bookId={bookId}
        rightsSignals={rightsSignals}
        rightsRiskReviewed={rightsRiskReviewed}
        readerV2SchemaAvailable={readerV2SchemaAvailable}
        canReview={canReview}
        busy={busy}
        notes={notes}
        openRightsEdit={openRightsEdit}
        withBusy={withBusy}
      />

      <AdminBookOrganizer
        bookId={bookId}
        bookStatus={book.status}
        structureNodes={structureNodes}
        canReview={canReview}
        busy={busy}
        withBusy={withBusy}
      />

      {canReview && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for this decision (shown to the author, recorded in the audit log)…"
          className="mt-4 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      <AdminBookPublishingChecklist
        bookId={bookId}
        book={book}
        gate={gate}
        jobs={jobs}
        busy={busy}
        withBusy={withBusy}
        canPublish={canPublish}
        canManageTranslations={canManageTranslations}
        editionMetadataComplete={editionMetadataComplete}
        rightsRiskReviewed={rightsRiskReviewed}
      />

      <AdminBookContentPolicy
        book={book}
        role={session.role}
        canPublish={canPublish}
        canReview={canReview}
        contentPolicyDraft={contentPolicyDraft}
        setContentPolicyDraft={setContentPolicyDraft}
        contentPolicyBusy={contentPolicyBusy}
        saveContentPolicy={saveContentPolicy}
        referenceManifestLanguage={referenceManifestLanguage}
        setReferenceManifestLanguage={setReferenceManifestLanguage}
        referenceManifestText={referenceManifestText}
        setReferenceManifestText={setReferenceManifestText}
        referenceManifestBusy={referenceManifestBusy}
        importSacredReferenceManifest={importSacredReferenceManifest}
      />

      <AdminBookAccessCategories
        book={book}
        bookId={bookId}
        editions={editions}
        canPublish={canPublish}
        busy={busy}
        withBusy={withBusy}
        categoriesBusy={categoriesBusy}
        masterCategories={masterCategories}
        toggleCategory={toggleCategory}
      />

      <AdminTranslationJobsPanel
        jobs={jobs}
        canManageTranslations={canManageTranslations}
        busy={busy}
        withBusy={withBusy}
      />

      <AdminVerifiedSourcedEdition
        book={book}
        editions={editions}
        canManageTranslations={canManageTranslations}
        sourcedEditionOpen={sourcedEditionOpen}
        setSourcedEditionOpen={setSourcedEditionOpen}
        sourcedEditionDraft={sourcedEditionDraft}
        setSourcedEditionDraft={setSourcedEditionDraft}
        sourcedEditionBusy={sourcedEditionBusy}
        importSourcedEdition={importSourcedEdition}
      />

      {canReview && (
        <AdminBookSourceEditPanel
          totalChunks={book.total_chunks}
          allLanguages={allLanguages}
          editorLanguage={editorLanguage}
          onEditorLanguageChange={setEditorLanguage}
          editorChunkIndex={editorChunkIndex}
          onEditorChunkIndexChange={setEditorChunkIndex}
          editorLoading={editorLoading}
          editorContent={editorContent}
          editorPending={editorPending}
          editorDraft={editorDraft}
          onEditorDraftChange={setEditorDraft}
          busy={busy}
          onLoadChunk={loadChunkForEdit}
          onStageEdit={stageEdit}
          onPublishEdit={publishEdit}
          onDiscardEdit={discardEdit}
        />
      )}

      {previewOpen && (
        <AdminBookReviewPreview
          title={book.title}
          sourceLanguage={book.source_language}
          totalChunks={book.total_chunks}
          previewChunkIndex={previewChunkIndex}
          previewContent={previewContent}
          previewLoading={previewLoading}
          onClose={() => setPreviewOpen(false)}
          onLoadChunk={loadPreviewChunk}
        />
      )}

      {rightsEditOpen && (
        <AdminBookRightsDialog
          rightsDraft={rightsDraft}
          setRightsDraft={setRightsDraft}
          busy={busy}
          onClose={() => setRightsEditOpen(false)}
          onSave={saveRightsEdit}
        />
      )}

      <AdminBookMetadataDialog
        editOpen={editOpen}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        book={book}
        editions={editions}
        busy={busy}
        canPublish={canPublish}
        coverPreviewFailed={coverPreviewFailed}
        setCoverPreviewFailed={setCoverPreviewFailed}
        coverAttribution={coverAttribution}
        setCoverAttribution={setCoverAttribution}
        coverTargetLanguage={coverTargetLanguage}
        setCoverTargetLanguage={setCoverTargetLanguage}
        stagedEditionCover={stagedEditionCover}
        setStagedEditionCover={setStagedEditionCover}
        coverSharedArtwork={coverSharedArtwork}
        setCoverSharedArtwork={setCoverSharedArtwork}
        coverUploading={coverUploading}
        selectedCoverFile={selectedCoverFile}
        setSelectedCoverFile={setSelectedCoverFile}
        selectedCoverPreview={selectedCoverPreview}
        cropToPortrait={cropToPortrait}
        setCropToPortrait={setCropToPortrait}
        cropFocusX={cropFocusX}
        setCropFocusX={setCropFocusX}
        cropFocusY={cropFocusY}
        setCropFocusY={setCropFocusY}
        readerV2SchemaAvailable={readerV2SchemaAvailable}
        stageCoverFile={stageCoverFile}
        assignStagedEditionCover={assignStagedEditionCover}
        setEditOpen={setEditOpen}
        saveEdit={saveEdit}
      />

      <AdminBookDestructiveDialogs
        title={book.title}
        deleteOpen={deleteOpen}
        permDeleteOpen={permDeleteOpen}
        busy={busy}
        permDeleteImpact={permDeleteImpact}
        permDeleteConfirmText={permDeleteConfirmText}
        onChangeConfirmText={setPermDeleteConfirmText}
        onCloseArchive={() => setDeleteOpen(false)}
        onClosePermanent={() => setPermDeleteOpen(false)}
        onConfirmArchive={confirmDelete}
        onConfirmPermanent={confirmPermDelete}
      />
    </div>
  );
}

