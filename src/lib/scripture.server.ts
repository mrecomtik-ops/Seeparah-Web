import type {
  SacredReaderSection,
  ScriptureReferenceEntry,
  ScriptureReferenceIndex,
  ScriptureReferencePathPart,
} from "@/lib/scripture";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readPath(value: unknown): ScriptureReferencePathPart[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const kind = typeof row["kind"] === "string" ? row["kind"].trim() : "";
      const label = typeof row["label"] === "string" ? row["label"].trim() : "";
      const partValue = typeof row["value"] === "string" ? row["value"].trim() : "";
      if (!kind || !label || !partValue) return null;
      return { kind, label, value: partValue };
    })
    .filter((item): item is ScriptureReferencePathPart => Boolean(item));
}

function fallbackReference(node: {
  node_type: string;
  title: string | null;
  node_key: string;
}): string | null {
  if (!["book", "chapter", "canto", "section", "poem", "stanza"].includes(node.node_type)) {
    return null;
  }
  return node.title?.trim() || node.node_key;
}

export async function getSacredTextReferenceIndex(params: {
  bookId: string;
  language: string;
}): Promise<ScriptureReferenceIndex> {
  const db = await admin();

  const { data: book, error: bookError } = await db
    .from("books")
    .select("id,status,content_classification,source_version,source_language,available_languages")
    .eq("id", params.bookId)
    .maybeSingle();

  if (bookError) throw new Error(bookError.message);
  if (!book || book.status !== "published" || book.content_classification !== "religious") {
    return {
      bookId: params.bookId,
      language: params.language,
      sourceVersion: 1,
      references: [],
    };
  }

  const allowedLanguages = new Set([book.source_language, ...(book.available_languages ?? [])]);
  if (!allowedLanguages.has(params.language)) {
    return {
      bookId: params.bookId,
      language: params.language,
      sourceVersion: book.source_version ?? 1,
      references: [],
    };
  }

  type ReferenceNode = {
    node_key: string;
    node_type: string;
    title: string | null;
    ordinal: number;
    depth: number;
    start_chunk_index: number;
    end_chunk_index: number;
    metadata: unknown;
  };

  let nodes: ReferenceNode[] | null = null;
  if (typeof db.rpc === "function") {
    try {
      const { data, error } = await db.rpc("get_sacred_reference_nodes_json", {
        p_book_id: params.bookId,
        p_language: params.language,
        p_source_version: book.source_version ?? 1,
      });
      if (!error && Array.isArray(data)) {
        nodes = data
          .filter((item) => Boolean(item && typeof item === "object" && !Array.isArray(item)))
          .map((item) => {
            const row = item as Record<string, unknown>;
            return {
              node_key: String(row["node_key"] ?? ""),
              node_type: String(row["node_type"] ?? ""),
              title: typeof row["title"] === "string" ? row["title"] : null,
              ordinal: Number(row["ordinal"] ?? 0),
              depth: Number(row["depth"] ?? 0),
              start_chunk_index: Number(row["start_chunk_index"] ?? 0),
              end_chunk_index: Number(row["end_chunk_index"] ?? 0),
              metadata: row["metadata"],
            };
          });
      }
    } catch {
      nodes = null;
    }
  }

  if (!nodes) {
    const { data, error } = await db
      .from("book_structure_nodes")
      .select("node_key,node_type,title,ordinal,depth,start_chunk_index,end_chunk_index,metadata")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .eq("source_version", book.source_version ?? 1)
      .order("ordinal", { ascending: true });
    if (error) throw new Error(error.message);
    nodes = (data ?? []) as ReferenceNode[];
  }

  const references: ScriptureReferenceEntry[] = [];
  for (const node of nodes) {
    const metadata = asRecord(node.metadata);
    const explicitRef =
      metadata && typeof metadata["canonical_ref"] === "string"
        ? metadata["canonical_ref"].trim()
        : "";
    const canonicalRef = explicitRef || fallbackReference(node);
    if (!canonicalRef) continue;

    const explicitLabel =
      metadata && typeof metadata["reference_label"] === "string"
        ? metadata["reference_label"].trim()
        : "";
    const explicitKind =
      metadata && typeof metadata["reference_kind"] === "string"
        ? metadata["reference_kind"].trim()
        : "";

    references.push({
      nodeKey: node.node_key,
      canonicalRef,
      label: explicitLabel || node.title?.trim() || canonicalRef,
      kind: explicitKind || node.node_type,
      title: node.title,
      startChunkIndex: node.start_chunk_index,
      endChunkIndex: node.end_chunk_index,
      depth: node.depth,
      ordinal: node.ordinal,
      path: readPath(metadata?.["reference_path"]),
    });
  }

  return {
    bookId: params.bookId,
    language: params.language,
    sourceVersion: book.source_version ?? 1,
    references,
  };
}

const SACRED_SECTION_NODE_TYPES = [
  "chapter",
  "book",
  "section",
  "canto",
  "poem",
  "part",
  "volume",
  "story",
] as const;

function sacredReferenceMetadata(value: unknown): {
  canonicalRef: string;
  label: string;
  kind: string;
} {
  const metadata = asRecord(value);
  const canonicalRef =
    metadata && typeof metadata["canonical_ref"] === "string"
      ? metadata["canonical_ref"].trim()
      : "";
  const label =
    metadata && typeof metadata["reference_label"] === "string"
      ? metadata["reference_label"].trim()
      : "";
  const kind =
    metadata && typeof metadata["reference_kind"] === "string"
      ? metadata["reference_kind"].trim()
      : "";
  return { canonicalRef, label, kind };
}

export async function getSacredReaderSection(params: {
  bookId: string;
  language: string;
  chunkIndex: number;
  /** Optional bounded 32-chunk window. Default retains the existing full-section API. */
  windowSize?: 32;
}): Promise<SacredReaderSection | null> {
  const db = await admin();

  const { data: book, error: bookError } = await db
    .from("books")
    .select(
      "id,status,content_classification,source_version,source_language,available_languages,total_chunks,typography_profile",
    )
    .eq("id", params.bookId)
    .maybeSingle();

  if (bookError) throw new Error(bookError.message);
  if (!book || book.status !== "published" || book.content_classification !== "religious") {
    return null;
  }

  const allowedLanguages = new Set([book.source_language, ...(book.available_languages ?? [])]);
  if (!allowedLanguages.has(params.language)) return null;

  const sourceVersion = book.source_version ?? 1;
  const targetChunk = Math.max(0, Math.min(Number(book.total_chunks ?? 1) - 1, params.chunkIndex));

  let typographyProfile = book.typography_profile ?? "standard";
  if (params.language !== book.source_language) {
    const { data: edition, error: editionError } = await db
      .from("book_editions")
      .select("access_type,typography_profile")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .maybeSingle();
    if (editionError) throw new Error(editionError.message);
    if (!edition) return null;
    typographyProfile = edition.typography_profile ?? "standard";
  }

  const { data: containingNodes, error: nodeError } = await db
    .from("book_structure_nodes")
    .select("node_key,node_type,title,ordinal,depth,start_chunk_index,end_chunk_index,metadata")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("source_version", sourceVersion)
    .in("node_type", [...SACRED_SECTION_NODE_TYPES])
    .lte("start_chunk_index", targetChunk)
    .gte("end_chunk_index", targetChunk)
    .order("depth", { ascending: false })
    .order("ordinal", { ascending: true })
    .limit(1);

  if (nodeError) throw new Error(nodeError.message);

  const section = containingNodes?.[0] ?? null;
  const startChunkIndex = section ? Number(section.start_chunk_index) : targetChunk;
  const endChunkIndex = section ? Number(section.end_chunk_index) : targetChunk;
  const sectionKind = section?.node_type ?? "section";
  const sectionOrdinal = section ? Number(section.ordinal) : 0;
  const sectionTitle =
    section?.title?.trim() || sacredReferenceMetadata(section?.metadata).label || "Reading";
  const windowStartChunkIndex = params.windowSize
    ? startChunkIndex + Math.floor(Math.max(0, targetChunk - startChunkIndex) / params.windowSize) * params.windowSize
    : startChunkIndex;
  const windowEndChunkIndex = params.windowSize
    ? Math.min(endChunkIndex, windowStartChunkIndex + params.windowSize - 1)
    : endChunkIndex;

  const [chunkResult, leafResult, previousResult, nextResult] = await Promise.all([
    db
      .from("book_chunks")
      .select("chunk_index,content")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .eq("source_version", sourceVersion)
      .eq("status", "published")
      .gte("chunk_index", windowStartChunkIndex)
      .lte("chunk_index", windowEndChunkIndex)
      .order("chunk_index", { ascending: true }),
    db
      .from("book_structure_nodes")
      .select("node_key,node_type,start_chunk_index,end_chunk_index,metadata")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .eq("source_version", sourceVersion)
      .gte("start_chunk_index", startChunkIndex)
      .lte("start_chunk_index", endChunkIndex)
      .order("start_chunk_index", { ascending: true }),
    section
      ? db
          .from("book_structure_nodes")
          .select("start_chunk_index")
          .eq("book_id", params.bookId)
          .eq("language", params.language)
          .eq("source_version", sourceVersion)
          .eq("node_type", sectionKind)
          .lt("ordinal", sectionOrdinal)
          .order("ordinal", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    section
      ? db
          .from("book_structure_nodes")
          .select("start_chunk_index")
          .eq("book_id", params.bookId)
          .eq("language", params.language)
          .eq("source_version", sourceVersion)
          .eq("node_type", sectionKind)
          .gt("ordinal", sectionOrdinal)
          .order("ordinal", { ascending: true })
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (chunkResult.error) throw new Error(chunkResult.error.message);
  if (leafResult.error) throw new Error(leafResult.error.message);
  if (previousResult.error) throw new Error(previousResult.error.message);
  if (nextResult.error) throw new Error(nextResult.error.message);

  const refByChunk = new Map<number, { canonicalRef: string; label: string; kind: string }>();
  for (const node of leafResult.data ?? []) {
    const start = Number(node.start_chunk_index);
    const end = Number(node.end_chunk_index);
    if (start !== end) continue;
    const metadata = sacredReferenceMetadata(node.metadata);
    if (!metadata.canonicalRef) continue;
    const existing = refByChunk.get(start);
    // Prefer the deepest/leaf-style reference. Imports use paragraph nodes
    // for ayah/verse leaves, while chapter nodes span multiple chunks.
    if (!existing || node.node_type === "paragraph") {
      refByChunk.set(start, {
        canonicalRef: metadata.canonicalRef,
        label: metadata.label || metadata.canonicalRef,
        kind: metadata.kind || node.node_type,
      });
    }
  }

  const refs = [...refByChunk.values()].map((value) => value.canonicalRef);
  const annotationByRef = new Map<
    string,
    Array<{
      type: "footnote" | "commentary" | "subcommentary" | "editorial_note";
      ordinal: number;
      content: string;
    }>
  >();

  if (refs.length > 0) {
    const { data: annotations, error: annotationError } = await db
      .from("sacred_annotations")
      .select("canonical_ref,annotation_type,ordinal,content")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .eq("source_version", sourceVersion)
      .in("canonical_ref", refs)
      .order("ordinal", { ascending: true });
    if (annotationError) throw new Error(annotationError.message);

    for (const row of annotations ?? []) {
      const canonicalRef = String(row.canonical_ref);
      const type = row.annotation_type as
        "footnote" | "commentary" | "subcommentary" | "editorial_note";
      const list = annotationByRef.get(canonicalRef) ?? [];
      list.push({
        type,
        ordinal: Number(row.ordinal),
        content: String(row.content ?? ""),
      });
      annotationByRef.set(canonicalRef, list);
    }
  }

  return {
    bookId: params.bookId,
    language: params.language,
    sourceVersion,
    title: sectionTitle,
    kind: sectionKind,
    startChunkIndex,
    endChunkIndex,
    previousChunkIndex:
      previousResult.data && previousResult.data.length > 0
        ? Number(previousResult.data[0]!.start_chunk_index)
        : null,
    nextChunkIndex:
      nextResult.data && nextResult.data.length > 0
        ? Number(nextResult.data[0]!.start_chunk_index)
        : null,
    typographyProfile,
    windowStartChunkIndex,
    referenceOptions: [...refByChunk.entries()]
      .sort(([left], [right]) => left - right)
      .map(([chunkIndex, ref]) => ({ chunkIndex, label: ref.label })),
    sourceSegments: (() => {
      const raw = asRecord(section?.metadata)?.["segments"];
      if (!Array.isArray(raw) || raw.length > 5000) return undefined;
      const segments: Array<[string, number, number]> = [];
      for (const item of raw) {
        if (
          !Array.isArray(item) ||
          item.length !== 3 ||
          typeof item[0] !== "string" ||
          !/^dn[0-9]+:[0-9.]+$/.test(item[0]) ||
          !Number.isSafeInteger(item[1]) ||
          !Number.isSafeInteger(item[2]) ||
          item[1] < 0 ||
          item[2] < item[1]
        )
          return undefined;
        segments.push([item[0], item[1], item[2]]);
      }
      return segments;
    })(),
    chunks: (chunkResult.data ?? []).map((row) => {
      const chunkIndex = Number(row.chunk_index);
      const ref = refByChunk.get(chunkIndex) ?? {
        canonicalRef: String(chunkIndex + 1),
        label: String(chunkIndex + 1),
        kind: "section",
      };
      return {
        chunkIndex,
        canonicalRef: ref.canonicalRef,
        label: ref.label,
        kind: ref.kind,
        content: String(row.content ?? ""),
        annotations: annotationByRef.get(ref.canonicalRef) ?? [],
      };
    }),
  };
}
