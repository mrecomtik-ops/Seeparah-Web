import type {
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

  const { data, error } = await db
    .from("book_structure_nodes")
    .select(
      "node_key,node_type,title,ordinal,depth,start_chunk_index,end_chunk_index,metadata",
    )
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("source_version", book.source_version ?? 1)
    .order("ordinal", { ascending: true });

  if (error) throw new Error(error.message);

  const references: ScriptureReferenceEntry[] = [];
  for (const node of data ?? []) {
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
