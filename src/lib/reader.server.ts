// Server-only. The reader's actual access-control boundary: full chunk
// content is only ever returned here, after checking subscription status
// server-side. The client never receives premium content it isn't entitled
// to, regardless of what the UI renders.
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface ReaderChunkResult {
  content: string | null;
  locked: boolean;
  /** Edition-specific typography profile. Religious sourced translations
   * may intentionally use a different script stack from the original. */
  typographyProfile?: string;
  reason?:
    "sign_in_required" | "subscription_required" | "translation_access_required" | "not_available";
}

/**
 * Seeparah is free during launch: no checkout, no premium locks. This flag
 * lets that be reversed later purely via admin content settings (see
 * src/lib/admin/settings.server.ts) rather than a code change — but it
 * returns null when the setting cannot be verified. Paid translated content
 * treats that unknown state as locked, while source-language editions,
 * Religious content, and explicitly free translations remain available.
 */
async function isMonetizationEnabled(): Promise<boolean | null> {
  try {
    const db = await admin();
    const { data, error } = await db
      .from("content_settings")
      .select("value")
      .eq("key", "monetization_enabled")
      .maybeSingle();
    if (error || !data || typeof data.value !== "boolean") return null;
    return data.value;
  } catch {
    return null;
  }
}

interface ReaderAccessBookState {
  status: string;
  accessType: string;
  sourceLanguage: string;
  contentClassification?: "general" | "religious" | null;
}

interface ReaderAccessInput {
  book: ReaderAccessBookState;
  language: string;
  chunkIndex: number;
  userId: string | null;
  isOwner: boolean;
  /** true/false = verified setting; null = settings state could not be verified. */
  monetizationEnabled: boolean | null;
  hasActiveSubscription: boolean;
  /** undefined = this (book, language) edition has no book_editions row at
   * all yet — not published, not a premium lock, a "request it" case.
   * 'free' | 'paid' = the edition's own admin-set access, independent of
   * the original's books.access_type. Ignored entirely when language ===
   * the book's own source language (that case uses book.accessType
   * instead — see below). */
  editionAccessType: "free" | "paid" | undefined;
}

/**
 * Pure decision function for the reader's access gate, so every branch is
 * directly unit-testable without a database. `getReaderChunk` below is the
 * only caller and is responsible for supplying honest inputs. The catalog
 * gate (book.status === 'published') is checked FIRST and has no bypass for
 * ordinary readers — this is what stops a draft/in_review/rejected/
 * unpublished/archived book's text from being readable by anyone who has
 * (or guesses, or enumerates) its id, independent of whatever the
 * `books`/`book_chunks` RLS policies happen to allow at the REST layer.
 * Mirrors (and must stay in sync with) the DB function
 * `public.book_chunk_readable` added in migration 0011 — the unbypassable
 * second layer against a direct REST/SQL read skipping this function.
 */
export function resolveReaderAccess(
  input: ReaderAccessInput,
): { locked: true; reason: NonNullable<ReaderChunkResult["reason"]> } | { locked: false } {
  const { book } = input;

  // The owning author may always open their own book (any status) — this is
  // the only bypass of the catalog gate, and it never bypasses the
  // premium/edition-existence gates below.
  if (book.status !== "published" && !input.isOwner) {
    return { locked: true, reason: "not_available" };
  }

  const isSourceLanguage = input.language === book.sourceLanguage;

  // A translated edition that has never been published (no book_editions
  // row) has no preview page to show. Surface the request flow immediately,
  // including at chunk 0 and for the owning author, instead of returning an
  // unlocked-but-empty page.
  if (!isSourceLanguage && input.editionAccessType === undefined) {
    return {
      locked: true,
      reason: "translation_access_required",
    };
  }

  // Every book's original/source-language edition is permanently free.
  if (isSourceLanguage) {
    return { locked: false };
  }

  // Religious books and every verified/imported translation of them are
  // permanently free. Seeparah never puts Religious content behind a plan.
  if (book.contentClassification === "religious") {
    return { locked: false };
  }

  // General translated editions keep an opening-page preview.
  if (input.isOwner || input.chunkIndex === 0) {
    return { locked: false };
  }

  const effectiveAccessType = input.editionAccessType;
  // A paid translated edition is free only when monetization is positively
  // verified OFF. If settings cannot be read, fail closed instead of
  // treating the database/configuration error as a free-access signal.
  const requiresSubscription =
    effectiveAccessType === "paid" && input.monetizationEnabled !== false;
  if (requiresSubscription) {
    if (!input.userId) return { locked: true, reason: "sign_in_required" };
    if (!input.hasActiveSubscription) return { locked: true, reason: "subscription_required" };
  }

  return { locked: false };
}

export interface ReaderNavigationItem {
  index: number;
  title: string;
  kind:
    | "part"
    | "book"
    | "chapter"
    | "act"
    | "scene"
    | "section"
    | "poem"
    | "canto"
    | "front_matter"
    | "back_matter"
    | "reading";
  depth: number;
  readerStart?: boolean;
}

export async function getReaderNavigation(params: {
  bookId: string;
  language: string;
  userId: string | null;
}): Promise<ReaderNavigationItem[]> {
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select(
      "id, status, access_type, author_id, source_language, source_version, content_classification",
    )
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) return [];

  const isOwner = params.userId != null && book.author_id === params.userId;
  if (book.status !== "published" && !isOwner) return [];

  // Navigation must obey the exact same content gate as the reader. A TOC
  // is still content: returning chapter/story titles for an unavailable or
  // premium edition would leak information even if the page body remained
  // locked. Evaluate access against a post-preview chunk and, when locked,
  // expose only navigation derivable from the free opening chunk.
  const monetizationEnabled = await isMonetizationEnabled();
  let hasActiveSubscription = false;
  if (params.userId && monetizationEnabled) {
    const { data: subs } = await db
      .from("user_subscriptions")
      .select("status, expires_at")
      .eq("user_id", params.userId)
      .eq("status", "active");
    hasActiveSubscription = (subs ?? []).some(
      (s) => !s.expires_at || new Date(s.expires_at) > new Date(),
    );
  }

  const isSourceLanguage = params.language === book.source_language;
  let editionAccessType: "free" | "paid" | undefined;
  if (!isSourceLanguage) {
    const { data: edition } = await db
      .from("book_editions")
      .select("access_type")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .maybeSingle();
    editionAccessType = (edition?.access_type as "free" | "paid" | undefined) ?? undefined;
  }

  const fullAccess = !resolveReaderAccess({
    book: {
      status: book.status,
      accessType: book.access_type,
      sourceLanguage: book.source_language,
      contentClassification: book.content_classification as "general" | "religious" | null,
    },
    language: params.language,
    chunkIndex: 1,
    userId: params.userId,
    isOwner,
    monetizationEnabled,
    hasActiveSubscription,
    editionAccessType,
  }).locked;

  // Reader V2 semantic structure (migration 0017). During rollout the table
  // may not exist yet; legacy books keep working through the fallback below.
  // Only full-access readers receive the complete semantic hierarchy.
  if (fullAccess) {
    try {
      const { data: nodes, error: nodesError } = await db
        .from("book_structure_nodes")
        .select("node_type, title, depth, start_chunk_index, ordinal, metadata")
        .eq("book_id", params.bookId)
        .eq("language", params.language)
        .eq("source_version", book.source_version ?? 1)
        .not("title", "is", null)
        .order("ordinal", { ascending: true });

      if (!nodesError && nodes && nodes.length > 0) {
        const allowed = new Set([
          "part",
          "book",
          "volume",
          "chapter",
          "story",
          "section",
          "act",
          "scene",
          "poem",
          "canto",
          "front_matter",
          "back_matter",
        ]);
        return nodes
          .filter((node) => {
            if (!node.title || !allowed.has(node.node_type)) return false;
            const metadata =
              node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata)
                ? (node.metadata as Record<string, unknown>)
                : {};
            return metadata["toc_visible"] !== false;
          })
          .map((node) => {
            const type = node.node_type as string;
            const metadata =
              node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata)
                ? (node.metadata as Record<string, unknown>)
                : {};
            const kind: ReaderNavigationItem["kind"] =
              type === "volume" || type === "part"
                ? "part"
                : type === "book"
                  ? "book"
                  : type === "act"
                    ? "act"
                    : type === "scene"
                      ? "scene"
                      : type === "poem"
                        ? "poem"
                        : type === "canto"
                          ? "canto"
                          : type === "front_matter"
                            ? "front_matter"
                            : type === "back_matter"
                              ? "back_matter"
                              : type === "chapter" || type === "story"
                                ? "chapter"
                                : "section";
            const displayTitle =
              typeof metadata["display_title"] === "string" &&
              metadata["display_title"].trim().length > 0
                ? metadata["display_title"].trim()
                : (node.title as string);
            return {
              index: node.start_chunk_index,
              title: displayTitle,
              kind,
              depth: Math.max(0, Math.min(3, Number(node.depth ?? 0))),
              readerStart: metadata["reader_start"] === true,
            };
          });
      }
    } catch {
      // Migration not applied yet, or an older deployment: fall through.
    }
  }

  let query = db
    .from("book_chunks")
    .select("chunk_index, content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("status", "published")
    .eq("source_version", book.source_version ?? 1)
    .order("chunk_index", { ascending: true });
  if (!fullAccess) query = query.eq("chunk_index", 0);

  const { data: rows, error: rowsError } = await query;
  if (rowsError || !rows) return [];

  const { buildFallbackNavigation } = await import("@/lib/reader-structure");
  return buildFallbackNavigation(
    rows.map((row) => ({
      chunk_index: Number(row.chunk_index),
      content: String(row.content ?? ""),
    })),
  );
}

export interface ReaderSearchResult {
  index: number;
  snippet: string;
}

export async function searchReaderBook(params: {
  bookId: string;
  language: string;
  query: string;
  userId: string | null;
}): Promise<ReaderSearchResult[]> {
  const needle = params.query.trim().toLocaleLowerCase();
  if (needle.length < 2) return [];

  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select(
      "id, status, access_type, author_id, source_language, source_version, content_classification",
    )
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) return [];

  const isOwner = params.userId != null && book.author_id === params.userId;
  if (book.status !== "published" && !isOwner) return [];

  const monetizationEnabled = await isMonetizationEnabled();
  let hasActiveSubscription = false;
  if (params.userId && monetizationEnabled) {
    const { data: subs } = await db
      .from("user_subscriptions")
      .select("status, expires_at")
      .eq("user_id", params.userId)
      .eq("status", "active");
    hasActiveSubscription = (subs ?? []).some(
      (s) => !s.expires_at || new Date(s.expires_at) > new Date(),
    );
  }

  const isSourceLanguage = params.language === book.source_language;
  let editionAccessType: "free" | "paid" | undefined;
  if (!isSourceLanguage) {
    const { data: edition } = await db
      .from("book_editions")
      .select("access_type")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .maybeSingle();
    editionAccessType = (edition?.access_type as "free" | "paid" | undefined) ?? undefined;
  }

  // Search must obey the same content gate as reading. If page 1+ is locked,
  // search only the free opening chunk so snippets cannot leak gated text.
  const fullAccess = !resolveReaderAccess({
    book: {
      status: book.status,
      accessType: book.access_type,
      sourceLanguage: book.source_language,
      contentClassification: book.content_classification as "general" | "religious" | null,
    },
    language: params.language,
    chunkIndex: 1,
    userId: params.userId,
    isOwner,
    monetizationEnabled,
    hasActiveSubscription,
    editionAccessType,
  }).locked;

  // Push the match filter into Postgres instead of loading an entire
  // novel into the server process for every search. Escape SQL LIKE
  // wildcards so reader input is treated as literal text.
  const literalPattern = params.query.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
  const pattern = `%${literalPattern}%`;

  let query = db
    .from("book_chunks")
    .select("chunk_index, content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("status", "published")
    .eq("source_version", book.source_version ?? 1)
    .ilike("content", pattern)
    .order("chunk_index", { ascending: true })
    .limit(50);
  if (!fullAccess) query = query.eq("chunk_index", 0);

  const { data: rows, error } = await query;
  if (error || !rows) return [];

  const results: ReaderSearchResult[] = [];
  for (const row of rows) {
    const text = String(row.content ?? "");
    const lower = text.toLocaleLowerCase();
    const matchAt = lower.indexOf(needle);
    if (matchAt < 0) continue;
    const start = Math.max(0, matchAt - 90);
    const end = Math.min(text.length, matchAt + params.query.length + 140);
    const raw = text.slice(start, end).replace(/\s+/g, " ").trim();
    results.push({
      index: Number(row.chunk_index),
      snippet: `${start > 0 ? "…" : ""}${raw}${end < text.length ? "…" : ""}`,
    });
  }
  return results;
}

export interface ReaderBookContentResult {
  chunks: Array<{ chunkIndex: number; content: string }>;
  locked: boolean;
  typographyProfile?: string;
  reason?: ReaderChunkResult["reason"];
}

export async function getReaderBookContent(params: {
  bookId: string;
  language: string;
  userId: string | null;
}): Promise<ReaderBookContentResult> {
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select(
      "id, status, access_type, author_id, source_language, source_version, content_classification, typography_profile",
    )
    .eq("id", params.bookId)
    .single();

  if (bookError || !book) {
    return { chunks: [], locked: false, reason: "not_available" };
  }

  const isOwner = params.userId != null && book.author_id === params.userId;
  const monetizationEnabled = await isMonetizationEnabled();
  let hasActiveSubscription = false;
  if (params.userId && monetizationEnabled) {
    const { data: subs } = await db
      .from("user_subscriptions")
      .select("status, expires_at")
      .eq("user_id", params.userId)
      .eq("status", "active");
    hasActiveSubscription = (subs ?? []).some(
      (s) => !s.expires_at || new Date(s.expires_at) > new Date(),
    );
  }

  const isSourceLanguage = params.language === book.source_language;
  let editionAccessType: "free" | "paid" | undefined;
  let editionTypographyProfile: string | undefined;
  if (!isSourceLanguage) {
    const { data: edition } = await db
      .from("book_editions")
      .select("access_type, typography_profile")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .maybeSingle();
    editionAccessType = (edition?.access_type as "free" | "paid" | undefined) ?? undefined;
    editionTypographyProfile = edition?.typography_profile ?? undefined;
  }

  const fullAccess = resolveReaderAccess({
    book: {
      status: book.status,
      accessType: book.access_type,
      sourceLanguage: book.source_language,
      contentClassification: book.content_classification as "general" | "religious" | null,
    },
    language: params.language,
    chunkIndex: 1,
    userId: params.userId,
    isOwner,
    monetizationEnabled,
    hasActiveSubscription,
    editionAccessType,
  });

  const maxChunk = fullAccess.locked ? 0 : null;
  let query = db
    .from("book_chunks")
    .select("chunk_index, content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("status", "published")
    .eq("source_version", book.source_version ?? 1)
    .order("chunk_index", { ascending: true });
  if (maxChunk !== null) query = query.eq("chunk_index", maxChunk);

  const { data: rows, error } = await query;
  if (error) {
    return { chunks: [], locked: true, reason: "not_available" };
  }

  return {
    chunks: (rows ?? []).map((row) => ({
      chunkIndex: Number(row.chunk_index),
      content: String(row.content ?? ""),
    })),
    locked: fullAccess.locked,
    reason: fullAccess.locked ? fullAccess.reason : undefined,
    typographyProfile: isSourceLanguage
      ? (book.typography_profile ?? "standard")
      : (editionTypographyProfile ?? "standard"),
  };
}

export interface ReaderBookPayloadResult {
  content: ReaderBookContentResult;
  navigation: ReaderNavigationItem[];
}

const readerBookPayloadCache = new Map<
  string,
  { expiresAt: number; value: ReaderBookPayloadResult }
>();
const READER_PAYLOAD_CACHE_TTL_MS = 5 * 60 * 1000;
const READER_PAYLOAD_CACHE_MAX_ENTRIES = 48;

export async function getReaderBookPayload(params: {
  bookId: string;
  language: string;
  userId: string | null;
}): Promise<ReaderBookPayloadResult> {
  const cacheKey = params.userId == null ? `${params.bookId}:${params.language}` : null;
  const now = Date.now();

  if (cacheKey) {
    const cached = readerBookPayloadCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;
    if (cached) readerBookPayloadCache.delete(cacheKey);

    // Fast path for the launch catalogue: a published source-language edition
    // is always free, so a guest request does not need the subscription,
    // content-settings, or translated-edition checks. Fetch the book gate once,
    // then retrieve text + semantic structure concurrently.
    const db = await admin();
    const { data: book, error: bookError } = await db
      .from("books")
      .select("id, status, source_language, source_version, typography_profile")
      .eq("id", params.bookId)
      .single();

    if (
      !bookError &&
      book &&
      book.status === "published" &&
      params.language === book.source_language
    ) {
      const version = book.source_version ?? 1;
      const [chunkResult, nodeResult] = await Promise.all([
        db
          .from("book_chunks")
          .select("chunk_index, content")
          .eq("book_id", params.bookId)
          .eq("language", params.language)
          .eq("status", "published")
          .eq("source_version", version)
          .order("chunk_index", { ascending: true }),
        db
          .from("book_structure_nodes")
          .select("node_type, title, depth, start_chunk_index, ordinal, metadata")
          .eq("book_id", params.bookId)
          .eq("language", params.language)
          .eq("source_version", version)
          .not("title", "is", null)
          .order("ordinal", { ascending: true }),
      ]);

      if (!chunkResult.error) {
        const chunks = (chunkResult.data ?? []).map((row) => ({
          chunkIndex: Number(row.chunk_index),
          content: String(row.content ?? ""),
        }));

        let navigation: ReaderNavigationItem[] = [];
        const nodes = nodeResult.error ? [] : (nodeResult.data ?? []);
        if (nodes.length > 0) {
          const allowed = new Set([
            "part",
            "book",
            "volume",
            "chapter",
            "story",
            "section",
            "act",
            "scene",
            "poem",
            "canto",
            "front_matter",
            "back_matter",
          ]);
          navigation = nodes
            .filter((node) => {
              if (!node.title || !allowed.has(node.node_type)) return false;
              const metadata =
                node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata)
                  ? (node.metadata as Record<string, unknown>)
                  : {};
              return metadata["toc_visible"] !== false;
            })
            .map((node) => {
              const metadata =
                node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata)
                  ? (node.metadata as Record<string, unknown>)
                  : {};
              const type = node.node_type as string;
              const kind: ReaderNavigationItem["kind"] =
                type === "volume" || type === "part"
                  ? "part"
                  : type === "book"
                    ? "book"
                    : type === "act"
                      ? "act"
                      : type === "scene"
                        ? "scene"
                        : type === "poem"
                          ? "poem"
                          : type === "canto"
                            ? "canto"
                            : type === "front_matter"
                              ? "front_matter"
                              : type === "back_matter"
                                ? "back_matter"
                                : type === "chapter" || type === "story"
                                  ? "chapter"
                                  : "section";
              const displayTitle =
                typeof metadata["display_title"] === "string" &&
                metadata["display_title"].trim().length > 0
                  ? metadata["display_title"].trim()
                  : String(node.title);
              return {
                index: Number(node.start_chunk_index),
                title: displayTitle,
                kind,
                depth: Math.max(0, Math.min(3, Number(node.depth ?? 0))),
                readerStart: metadata["reader_start"] === true,
              };
            });
        }

        if (navigation.length === 0) {
          const { buildFallbackNavigation } = await import("@/lib/reader-structure");
          navigation = buildFallbackNavigation(
            chunks.map((row) => ({
              chunk_index: row.chunkIndex,
              content: row.content,
            })),
          );
        }

        const value: ReaderBookPayloadResult = {
          content: {
            chunks,
            locked: false,
            typographyProfile: book.typography_profile ?? "standard",
          },
          navigation,
        };

        if (readerBookPayloadCache.size >= READER_PAYLOAD_CACHE_MAX_ENTRIES) {
          const oldest = readerBookPayloadCache.keys().next().value as string | undefined;
          if (oldest) readerBookPayloadCache.delete(oldest);
        }
        readerBookPayloadCache.set(cacheKey, {
          expiresAt: now + READER_PAYLOAD_CACHE_TTL_MS,
          value,
        });
        return value;
      }
    }
  }

  const [content, navigation] = await Promise.all([
    getReaderBookContent(params),
    getReaderNavigation(params),
  ]);
  const value = { content, navigation };

  // Only cache guest payloads that are fully readable. This keeps the cache
  // independent of account/subscription state while eliminating duplicate
  // Supabase work for the public-domain launch catalogue on warm workers.
  if (cacheKey && !content.locked) {
    if (readerBookPayloadCache.size >= READER_PAYLOAD_CACHE_MAX_ENTRIES) {
      const oldest = readerBookPayloadCache.keys().next().value as string | undefined;
      if (oldest) readerBookPayloadCache.delete(oldest);
    }
    readerBookPayloadCache.set(cacheKey, {
      expiresAt: now + READER_PAYLOAD_CACHE_TTL_MS,
      value,
    });
  }

  return value;
}

export async function getReaderChunk(params: {
  bookId: string;
  language: string;
  chunkIndex: number;
  userId: string | null;
}): Promise<ReaderChunkResult> {
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select(
      "id, status, access_type, author_id, source_language, source_version, content_classification, typography_profile",
    )
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) return { content: null, locked: false, reason: "not_available" };

  const isOwner = params.userId != null && book.author_id === params.userId;
  const monetizationEnabled = await isMonetizationEnabled();

  // Account-wide: "one subscription unlocks all Premium books and
  // translations" — deliberately NOT filtered by book_id. See migration
  // 0011's has_active_plan_subscription() for the same, mirrored check at
  // the database layer.
  let hasActiveSubscription = false;
  if (params.userId && monetizationEnabled) {
    const { data: subs } = await db
      .from("user_subscriptions")
      .select("status, expires_at")
      .eq("user_id", params.userId)
      .eq("status", "active");
    hasActiveSubscription = (subs ?? []).some(
      (s) => !s.expires_at || new Date(s.expires_at) > new Date(),
    );
  }

  const isSourceLanguage = params.language === book.source_language;
  let editionAccessType: "free" | "paid" | undefined;
  let editionTypographyProfile: string | undefined;
  if (isSourceLanguage) {
    editionAccessType = undefined; // unused — resolveReaderAccess uses book.accessType instead
  } else {
    const { data: edition } = await db
      .from("book_editions")
      .select("access_type, typography_profile")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .maybeSingle();
    editionAccessType = (edition?.access_type as "free" | "paid" | undefined) ?? undefined;
    editionTypographyProfile = edition?.typography_profile ?? undefined;
  }

  const access = resolveReaderAccess({
    book: {
      status: book.status,
      accessType: book.access_type,
      sourceLanguage: book.source_language,
      contentClassification: book.content_classification as "general" | "religious" | null,
    },
    language: params.language,
    chunkIndex: params.chunkIndex,
    userId: params.userId,
    isOwner,
    monetizationEnabled,
    hasActiveSubscription,
    editionAccessType,
  });
  if (access.locked) return { content: null, locked: true, reason: access.reason };

  const { data: chunk, error: chunkError } = await db
    .from("book_chunks")
    .select("content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex)
    .eq("status", "published")
    .eq("source_version", book.source_version ?? 1)
    .maybeSingle();

  // Production requires the applied schema migrations. On any database
  // query error, fail closed rather than dropping publication/version
  // filters and risking stale or unpublished content exposure.
  if (chunkError) {
    return { content: null, locked: true, reason: "not_available" };
  }

  return {
    content: chunk?.content ?? null,
    locked: false,
    typographyProfile: isSourceLanguage
      ? (book.typography_profile ?? "standard")
      : (editionTypographyProfile ?? "standard"),
  };
}
