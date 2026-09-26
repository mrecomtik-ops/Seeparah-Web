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
  reason?:
    "sign_in_required" | "subscription_required" | "translation_access_required" | "not_available";
}

/**
 * Seeparah is free during launch: no checkout, no premium locks. This flag
 * lets that be reversed later purely via admin content settings (see
 * src/lib/admin/settings.server.ts) rather than a code change — but it
 * defaults to false (free) even if the content_settings table/row doesn't
 * exist yet, so a missing settings row can never accidentally turn paywalls
 * back on.
 */
async function isMonetizationEnabled(): Promise<boolean> {
  try {
    const db = await admin();
    const { data } = await db
      .from("content_settings")
      .select("value")
      .eq("key", "monetization_enabled")
      .maybeSingle();
    return data?.value === true;
  } catch {
    return false;
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
  monetizationEnabled: boolean;
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
  const requiresSubscription =
    input.monetizationEnabled && effectiveAccessType === "paid";
  if (requiresSubscription) {
    if (!input.userId) return { locked: true, reason: "sign_in_required" };
    if (!input.hasActiveSubscription) return { locked: true, reason: "subscription_required" };
  }

  return { locked: false };
}

export interface ReaderNavigationItem {
  index: number;
  title: string;
  kind: "part" | "chapter" | "section" | "front_matter" | "reading";
  depth: number;
}

export async function getReaderNavigation(params: {
  bookId: string;
  language: string;
  userId: string | null;
}): Promise<ReaderNavigationItem[]> {
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select("id, status, access_type, author_id, source_language, source_version, content_classification")
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
        .select("node_type, title, depth, start_chunk_index, ordinal")
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
        ]);
        return nodes
          .filter((node) => node.title && allowed.has(node.node_type))
          .map((node) => {
            const type = node.node_type as string;
            const kind: ReaderNavigationItem["kind"] =
              type === "part" || type === "book" || type === "volume"
                ? "part"
                : type === "chapter" ||
                    type === "story" ||
                    type === "act" ||
                    type === "poem" ||
                    type === "canto"
                  ? "chapter"
                  : type === "front_matter"
                    ? "front_matter"
                    : "section";
            return {
              index: node.start_chunk_index,
              title: node.title as string,
              kind,
              depth: Math.max(0, Math.min(3, Number(node.depth ?? 0))),
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

  let { data: rows, error: rowsError } = await query;
  if (rowsError) {
    let fallback = db
      .from("book_chunks")
      .select("chunk_index, content")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .order("chunk_index", { ascending: true });
    if (!fullAccess) fallback = fallback.eq("chunk_index", 0);
    ({ data: rows, error: rowsError } = await fallback);
  }
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
    .select("id, status, access_type, author_id, source_language, source_version, content_classification")
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

  let { data: rows, error } = await query;
  if (error) {
    let fallback = db
      .from("book_chunks")
      .select("chunk_index, content")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .ilike("content", pattern)
      .order("chunk_index", { ascending: true })
      .limit(50);
    if (!fullAccess) fallback = fallback.eq("chunk_index", 0);
    ({ data: rows, error } = await fallback);
  }
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

export async function getReaderChunk(params: {
  bookId: string;
  language: string;
  chunkIndex: number;
  userId: string | null;
}): Promise<ReaderChunkResult> {
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select("id, status, access_type, author_id, source_language, source_version, content_classification")
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
  if (isSourceLanguage) {
    editionAccessType = undefined; // unused — resolveReaderAccess uses book.accessType instead
  } else {
    const { data: edition } = await db
      .from("book_editions")
      .select("access_type")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .maybeSingle();
    editionAccessType = (edition?.access_type as "free" | "paid" | undefined) ?? undefined;
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

  let { data: chunk, error: chunkError } = await db
    .from("book_chunks")
    .select("content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex)
    .eq("status", "published")
    .eq("source_version", book.source_version ?? 1)
    .maybeSingle();

  if (chunkError) {
    // `book_chunks.status` doesn't exist until migration 0001 is applied —
    // as of this writing it isn't, on production. Without this fallback,
    // the query above errors on every single call, the error is
    // impossible to see from here (only `data` was ever read), and every
    // reader silently gets "this page couldn't be loaded" for every book,
    // every language, every page. Retry without the status filter: every
    // row that exists pre-migration was already being served as live
    // content (see migration 0001's own comment: existing rows default to
    // status='published' precisely because they were already visible), so
    // this fallback doesn't change what a reader can see today — it just
    // stops a schema-compatibility query from masquerading as "no content
    // here." Once the migration lands, the first query succeeds and this
    // branch stops running.
    ({ data: chunk } = await db
      .from("book_chunks")
      .select("content")
      .eq("book_id", params.bookId)
      .eq("language", params.language)
      .eq("chunk_index", params.chunkIndex)
      .maybeSingle());
  }

  return { content: chunk?.content ?? null, locked: false };
}

/**
 * Test-mode subscription activation. There is no Stripe (or any other
 * payment provider) integration in this codebase — see the launch report.
 * This function exists so "activating" a subscription is at least a
 * server-verified, idempotent, identity-checked operation instead of a raw
 * client-side database write, and so the reader's real access check
 * (getReaderChunk above) has a trustworthy row to look at. It must be
 * replaced with real Stripe Checkout + webhook handling before any live
 * billing, per the launch report.
 */
export async function activateTestModeSubscription(params: { bookId: string; userId: string }) {
  // Server-side enforcement, not just a hidden UI control: while
  // monetization is off, this must refuse rather than quietly create a
  // real 'active' user_subscriptions row that would suddenly grant paid
  // access the moment monetization is turned on, without the reader ever
  // having gone through a real payment flow. The public /subscribe page
  // already hides the button that calls this when monetization is off —
  // this check is what makes that the actual boundary, not just the UI's.
  if (!(await isMonetizationEnabled())) {
    throw new Error(
      "Subscriptions are not active during free launch — every book is free to read.",
    );
  }
  // The check above only protects the free-launch period. The moment an
  // operator flips monetization on for real, this function — unguarded —
  // would become a public, zero-payment "buy" button: any signed-in reader
  // could call it for any paid book and receive a real 30-day 'active'
  // user_subscriptions row with no money ever changing hands, because
  // there is still no Stripe (or other payment) integration in this
  // codebase. Requiring this separate, explicit env flag means the escape
  // hatch stays off by default in production even after monetization is
  // enabled there — it only works in a deployment where an operator has
  // deliberately opted in (a staging/test project), never by default on
  // whatever project ALLOW_TEST_SUBSCRIPTIONS happens to be unset on.
  if (process.env["ALLOW_TEST_SUBSCRIPTIONS"] !== "true") {
    throw new Error(
      "Test-mode subscription activation is disabled in this environment. Real subscriptions require the payment integration described in the launch report — this endpoint is not it.",
    );
  }
  const db = await admin();
  const { data: book, error: bookError } = await db
    .from("books")
    .select("id")
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) throw new Error("Book not found");
  // No "this book must be access_type='paid'" check anymore — a
  // subscription is a single account-wide plan, not tied to any one book
  // (see migration 0011's has_active_plan_subscription()); bookId here is
  // kept only as a reference to which book's page the reader subscribed
  // from, matching user_subscriptions' existing schema.

  const { data: existing } = await db
    .from("user_subscriptions")
    .select("*")
    .eq("book_id", params.bookId)
    .eq("user_id", params.userId)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return existing;

  const { getMonthlyPlanPriceUsd } = await import("@/lib/admin/settings.server");
  const monthlyPriceUsd = await getMonthlyPlanPriceUsd();

  const now = new Date();
  const { data: sub, error } = await db
    .from("user_subscriptions")
    .upsert({
      user_id: params.userId,
      book_id: params.bookId,
      status: "active",
      monthly_price_usd: monthlyPriceUsd,
      starts_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    })
    .select()
    .single();
  if (error || !sub) throw new Error(error?.message ?? "Could not activate subscription");
  return sub;
}
