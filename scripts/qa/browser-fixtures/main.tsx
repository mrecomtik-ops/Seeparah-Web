import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AdminBookHeaderActions } from "@/components/admin/AdminBookHeaderActions";
import { AdminBookDestructiveDialogs } from "@/components/admin/AdminBookDestructiveDialogs";
import { AdminBookMetadataDialog } from "@/components/admin/AdminBookMetadataDialog";
import { ShelfButtons } from "@/components/ShelfButtons";
import { roleHasCapability, type AdminRole } from "@/lib/admin/permissions";
import { cropCoverToPortrait } from "@/lib/admin/cover-crop";
import { stagedCoverAssignment, type StagedEditionCover } from "@/lib/admin/staged-cover";
import { qaState, switchUser, type ShelfRow } from "./mock-state";

declare global {
  interface Window {
    __qa: {
      snapshot: () => { userId: string; online: boolean; server: ShelfRow[]; cached: ShelfRow[]; events: string[] };
      switchUser: (id: string) => void;
      network: (on: boolean) => void;
      replaceServer: (rows: ShelfRow[]) => void;
      refresh: () => void;
    };
  }
}
const TITLE = "QA Fixture Book (not a real book)";
const initialEdit = {
  title: TITLE, author: "QA Fixture", description: "Synthetic fixture, no publication",
  genre: "", coverUrl: "", editionTitle: "", editionYear: "",
  publisher: "", isbn: "", sourceScanId: "", originalPublicationYear: "",
};
const editions = [
  { language: "English", source_edition_id: "source-en-qa" },
  { language: "Urdu", source_edition_id: "source-ur-qa" },
];
function Fixture() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<AdminRole | null>("owner");
  const [status, setStatus] = useState("archived");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(initialEdit);
  const [coverAttribution, setCoverAttribution] = useState("Verified QA fixture artwork");
  const [coverTargetLanguage, setCoverTargetLanguage] = useState("English");
  const [stagedEditionCover, setStagedEditionCover] = useState<StagedEditionCover | null>(null);
  const [coverSharedArtwork, setCoverSharedArtwork] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [selectedCoverPreview, setSelectedCoverPreview] = useState("");
  const [cropToPortrait, setCropToPortrait] = useState(false);
  const [cropFocusX, setCropFocusX] = useState(50);
  const [cropFocusY, setCropFocusY] = useState(50);
  const [coverPreviewFailed, setCoverPreviewFailed] = useState(false);

  useEffect(() => {
    if (!selectedCoverFile) { setSelectedCoverPreview(""); return; }
    const url = URL.createObjectURL(selectedCoverFile);
    setSelectedCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedCoverFile]);

  useEffect(() => {
    window.__qa = {
      snapshot: () => ({
        userId: qaState.userId, online: qaState.online,
        server: [...qaState.server], cached: [...qaState.cached],
        events: [...qaState.events],
      }),
      switchUser: (user: string) => { switchUser(user); },
      network: (on: boolean) => {
        qaState.online = on;
        void queryClient.invalidateQueries({ queryKey: ["shelves", qaState.userId] });
      },
      replaceServer: (rows: ShelfRow[]) => {
        qaState.server = [...rows];
        void queryClient.invalidateQueries({ queryKey: ["shelves", qaState.userId] });
      },
      refresh: () => { void queryClient.invalidateQueries({ queryKey: ["shelves", qaState.userId] }); },
    };
  }, [queryClient]);

  const impact = {
    bookId: "00000000-0000-4000-8000-000000000001",
    title: TITLE, status,
    chunkCount: 1, editionCount: 2, translationJobCount: 0,
    progressCount: 0, highlightCount: 0, shelfCount: 0,
    subscriptionCount: 0, translationRequestCount: 0,
    translationReportCount: 0, relatedSupportTicketCount: 0,
  };
  async function stageCoverFile(file: File) {
    setCoverUploading(true);
    try {
      const uploadFile = cropToPortrait ? await cropCoverToPortrait(file, cropFocusX, cropFocusY) : file;
      const bitmap = await createImageBitmap(uploadFile);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      const edition = editions.find(x => x.language === coverTargetLanguage);
      if (!edition) throw new Error("Unknown edition");
      qaState.events.push("stage:" + coverTargetLanguage + ":" + width + "x" + height);
      setStagedEditionCover({
        language: coverTargetLanguage, sourceEditionId: edition.source_edition_id,
        path: "editorial/qa/" + coverTargetLanguage + "/sample.jpg",
        url: URL.createObjectURL(uploadFile),
        attribution: coverAttribution, sharedArtwork: coverSharedArtwork,
      });
      setSelectedCoverFile(null);
    } catch (e) {
      qaState.events.push("stage-error:" + String(e));
    } finally {
      setCoverUploading(false);
    }
  }
  async function assignStagedEditionCover() {
    if (!stagedEditionCover || !roleHasCapability(role, "catalog.publish")) return;
    const reviewed = stagedCoverAssignment(stagedEditionCover, coverTargetLanguage);
    const edition = editions.find(x => x.language === reviewed.language);
    if (!edition || edition.source_edition_id !== stagedEditionCover.sourceEditionId) throw new Error("Mismatch");
    qaState.events.push("assign:" + reviewed.language + ":" + reviewed.attribution);
    setStagedEditionCover(null);
  }
  return (
    <main style={{ padding: 16 }}>
      <h1>Isolated browser component QA — no production account, writes, or authentication</h1>
      <div>
        <button data-testid="role-owner" onClick={() => setRole("owner")}>Owner</button>
        <button data-testid="role-administrator" onClick={() => setRole("administrator")}>Administrator</button>
        <button data-testid="role-editor" onClick={() => setRole("editor")}>Editor</button>
        <button data-testid="role-support" onClick={() => setRole("support")}>Support</button>
        <button data-testid="status-archived" onClick={() => setStatus("archived")}>Archived</button>
        <button data-testid="status-published" onClick={() => setStatus("published")}>Published</button>
      </div>
      <h2>Admin book actions</h2>
      <AdminBookHeaderActions
        status={status} role={role}
        onPreview={async () => { qaState.events.push("preview"); }}
        onEdit={() => { setEditOpen(true); }}
        onArchive={() => { setArchiveOpen(true); }}
        onPermanentDelete={async () => { setConfirm(""); setPermOpen(true); }}
      />
      <AdminBookDestructiveDialogs
        title={TITLE}
        deleteOpen={archiveOpen}
        permDeleteOpen={permOpen}
        busy={false}
        permDeleteImpact={impact}
        permDeleteConfirmText={confirm}
        onChangeConfirmText={setConfirm}
        onCloseArchive={() => setArchiveOpen(false)}
        onClosePermanent={() => setPermOpen(false)}
        onConfirmArchive={async () => {
          qaState.events.push("would-archive"); setStatus("archived"); setArchiveOpen(false);
        }}
        onConfirmPermanent={async () => {
          qaState.events.push("would-delete:" + role);
          setPermOpen(false);
        }}
      />
      <AdminBookMetadataDialog
        editOpen={editOpen} editDraft={editDraft} setEditDraft={setEditDraft}
        book={{
          source_edition_id: "source-en-qa", source_scan_id: null,
          edition_title: "Synthetic QA fixture",
          source_language: "English", available_languages: ["English", "Urdu"],
        }}
        editions={editions}
        busy={false} canPublish={roleHasCapability(role, "catalog.publish")}
        coverPreviewFailed={coverPreviewFailed} setCoverPreviewFailed={setCoverPreviewFailed}
        coverAttribution={coverAttribution} setCoverAttribution={setCoverAttribution}
        coverTargetLanguage={coverTargetLanguage} setCoverTargetLanguage={setCoverTargetLanguage}
        stagedEditionCover={stagedEditionCover} setStagedEditionCover={setStagedEditionCover}
        coverSharedArtwork={coverSharedArtwork} setCoverSharedArtwork={setCoverSharedArtwork}
        coverUploading={coverUploading} selectedCoverFile={selectedCoverFile}
        setSelectedCoverFile={setSelectedCoverFile}
        selectedCoverPreview={selectedCoverPreview}
        cropToPortrait={cropToPortrait} setCropToPortrait={setCropToPortrait}
        cropFocusX={cropFocusX} setCropFocusX={setCropFocusX}
        cropFocusY={cropFocusY} setCropFocusY={setCropFocusY}
        readerV2SchemaAvailable={true}
        stageCoverFile={stageCoverFile}
        assignStagedEditionCover={assignStagedEditionCover}
        setEditOpen={setEditOpen}
        saveEdit={async () => { qaState.events.push("would-save-metadata"); setEditOpen(false); }}
      />
      <h2>Real shelf algorithms through in-memory Supabase transport</h2>
      <ShelfButtons bookId="book-1" showLabels />
    </main>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0 } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><Fixture /></QueryClientProvider>,
);
