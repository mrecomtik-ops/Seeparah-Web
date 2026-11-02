import { toast } from "sonner";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminUpdateBookStructureNode, adminMoveBookStructureNode } from "@/lib/admin/catalog.functions";

const ORGANIZER_NODE_TYPES = [
  "front_matter", "part", "book", "volume", "chapter", "story",
  "section", "act", "scene", "poem", "canto", "footnote", "endnote",
  "back_matter",
] as const;

type OrganizerNodeType = (typeof ORGANIZER_NODE_TYPES)[number];

export interface OrganizerNode {
  node_key: string;
  node_type: string;
  title: string | null;
  depth: number | null;
  start_chunk_index: number;
  end_chunk_index: number;
  metadata: unknown;
}

function organizerMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Structure editing remains guarded by the existing server capabilities. */
export function AdminBookOrganizer({
  bookId, bookStatus, structureNodes, canReview, busy, withBusy,
}: {
  bookId: string;
  bookStatus: string;
  structureNodes: OrganizerNode[];
  canReview: boolean;
  busy: boolean;
  withBusy: (fn: () => Promise<void>) => Promise<void>;
}) {
  return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">Book Organizer</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Editorial structure sits above storage chunks. Source titles and text stay untouched;
              use display titles, node types, TOC visibility, reader start and sibling order to
              organize how this edition is presented.
            </p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
            {structureNodes.length} nodes
          </span>
        </div>

        {bookStatus === "published" && canReview && (
          <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            This published edition is view-only. Unpublish it before changing structure; any
            organizer edit resets Structure review to pending.
          </div>
        )}

        {structureNodes.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No semantic structure is stored for this edition yet. Import or generate a reviewed
            structure map before approving Structure review.
          </p>
        ) : (
          <div className="mt-4 max-h-[42rem] space-y-2 overflow-y-auto pr-1">
            {structureNodes.map((node) => {
              const metadata = organizerMeta(node.metadata);
              const displayTitle =
                typeof metadata["display_title"] === "string"
                  ? (metadata["display_title"] as string)
                  : "";
              const tocVisible = metadata["toc_visible"] !== false;
              const readerStart = metadata["reader_start"] === true;
              const editable = canReview && bookStatus !== "published";
              return (
                <div
                  key={node.node_key}
                  className="rounded-xl border border-border bg-background p-3"
                  style={{ marginLeft: `${Math.min(node.depth ?? 0, 4) * 12}px` }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {displayTitle || node.title || "(Untitled structural node)"}
                      </p>
                      {displayTitle && displayTitle !== node.title && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          Source title: {node.title || "—"}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {node.node_key} · chunks {node.start_chunk_index + 1}–
                        {node.end_chunk_index + 1}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={node.node_type}
                        disabled={!editable || busy}
                        onChange={(event) =>
                          void withBusy(async () => {
                            await adminUpdateBookStructureNode({
                              data: {
                                accessToken: await getAccessToken(),
                                bookId,
                                nodeKey: node.node_key,
                                nodeType: event.target.value as OrganizerNodeType,
                              },
                            });
                            toast.success("Structure type updated");
                          })
                        }
                        className="rounded-lg border border-border bg-card px-2 py-1 text-xs disabled:opacity-60"
                      >
                        {ORGANIZER_NODE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>

                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={tocVisible}
                          disabled={!editable || busy}
                          onChange={(event) =>
                            void withBusy(async () => {
                              await adminUpdateBookStructureNode({
                                data: {
                                  accessToken: await getAccessToken(),
                                  bookId,
                                  nodeKey: node.node_key,
                                  tocVisible: event.target.checked,
                                },
                              });
                            })
                          }
                        />
                        TOC
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <input
                          type="radio"
                          name="reader-start-node"
                          checked={readerStart}
                          disabled={!editable || busy}
                          onChange={() =>
                            void withBusy(async () => {
                              await adminUpdateBookStructureNode({
                                data: {
                                  accessToken: await getAccessToken(),
                                  bookId,
                                  nodeKey: node.node_key,
                                  readerStart: true,
                                },
                              });
                              toast.success("Reader start updated");
                            })
                          }
                        />
                        Start
                      </label>
                    </div>
                  </div>

                  {editable && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const next = window.prompt(
                            "Reader display title. Leave blank to use the exact source title.",
                            displayTitle || node.title || "",
                          );
                          if (next === null) return;
                          void withBusy(async () => {
                            await adminUpdateBookStructureNode({
                              data: {
                                accessToken: await getAccessToken(),
                                bookId,
                                nodeKey: node.node_key,
                                displayTitle: next.trim() || null,
                              },
                            });
                            toast.success("Display title updated");
                          });
                        }}
                        className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                      >
                        Display title
                      </button>
                      {(["up", "down"] as const).map((direction) => (
                        <button
                          key={direction}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void withBusy(async () => {
                              await adminMoveBookStructureNode({
                                data: {
                                  accessToken: await getAccessToken(),
                                  bookId,
                                  nodeKey: node.node_key,
                                  direction,
                                },
                              });
                            })
                          }
                          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                        >
                          Move {direction}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
  );
}
