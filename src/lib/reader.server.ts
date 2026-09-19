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

/** Hindi and Arabic TRANSLATED editions (not the original) are only readable
 * by a reader whose translation_requests row for this book+language is
 * 'granted' — approval to produce a translation is separate from permission
 * to read one. English/Urdu/the book's own original language are never
 * gated this way. */
const REQUEST_GATED_LANGUAGES = new Set(["Hindi", "Arabic"]);

async function hasGrantedTranslationAccess(
  bookId: string,
  language: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const db = await admin();
  const { data } = await db
    .from("translation_requests")
    .select("status")
    .eq("book_id", bookId)
    .eq("language", language)
    .eq("requester_id", userId)
    .eq("status", "granted")
    .maybeSingle();
  return !!data;
}

interface ReaderAccessBookState {
  status: string;
  accessType: string;
  sourceLanguage: string;
}

interface ReaderAccessInput {
  book: ReaderAccessBookState;
  language: string;
  chunkIndex: number;
  userId: string | null;
  isOwner: boolean;
  monetizationEnabled: boolean;
  hasActiveSubscription: boolean;
  hasGrantedTranslationAccess: boolean;
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
 */
export function resolveReaderAccess(
  input: ReaderAccessInput,
): { locked: true; reason: NonNullable<ReaderChunkResult["reason"]> } | { locked: false } {
  const { book } = input;

  // The owning author may always open their own book (any status) — this is
  // the only bypass of the catalog gate, and it never bypasses the
  // subscription/translation-access gates below.
  if (book.status !== "published" && !input.isOwner) {
    return { locked: true, reason: "not_available" };
  }

  const isFreePreview = input.chunkIndex === 0;
  const requiresSubscription =
    input.monetizationEnabled && book.accessType === "paid" && !isFreePreview && !input.isOwner;
  if (requiresSubscription) {
    if (!input.userId) return { locked: true, reason: "sign_in_required" };
    if (!input.hasActiveSubscription) return { locked: true, reason: "subscription_required" };
  }

  const isTranslatedEdition = input.language !== book.sourceLanguage;
  if (REQUEST_GATED_LANGUAGES.has(input.language) && isTranslatedEdition && !input.isOwner) {
    if (!input.hasGrantedTranslationAccess) {
      return {
        locked: true,
        reason: input.userId ? "translation_access_required" : "sign_in_required",
      };
    }
  }

  return { locked: false };
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
    .select("id, status, access_type, author_id, source_language")
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) return { content: null, locked: false, reason: "not_available" };

  const isOwner = params.userId != null && book.author_id === params.userId;
  const monetizationEnabled = await isMonetizationEnabled();

  let hasActiveSubscription = false;
  if (params.userId && monetizationEnabled && book.access_type === "paid") {
    const { data: sub } = await db
      .from("user_subscriptions")
      .select("status, expires_at")
      .eq("book_id", params.bookId)
      .eq("user_id", params.userId)
      .eq("status", "active")
      .maybeSingle();
    hasActiveSubscription = !!sub && (!sub.expires_at || new Date(sub.expires_at) > new Date());
  }

  const isTranslatedEdition = params.language !== book.source_language;
  let grantedTranslationAccess = false;
  if (REQUEST_GATED_LANGUAGES.has(params.language) && isTranslatedEdition && !isOwner) {
    grantedTranslationAccess = await hasGrantedTranslationAccess(
      params.bookId,
      params.language,
      params.userId,
    );
  }

  const access = resolveReaderAccess({
    book: {
      status: book.status,
      accessType: book.access_type,
      sourceLanguage: book.source_language,
    },
    language: params.language,
    chunkIndex: params.chunkIndex,
    userId: params.userId,
    isOwner,
    monetizationEnabled,
    hasActiveSubscription,
    hasGrantedTranslationAccess: grantedTranslationAccess,
  });
  if (access.locked) return { content: null, locked: true, reason: access.reason };

  let { data: chunk, error: chunkError } = await db
    .from("book_chunks")
    .select("content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex)
    .eq("status", "published")
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
    .select("id, subscription_price_usd, access_type")
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) throw new Error("Book not found");
  if (book.access_type !== "paid") throw new Error("This book does not require a subscription");

  const { data: existing } = await db
    .from("user_subscriptions")
    .select("*")
    .eq("book_id", params.bookId)
    .eq("user_id", params.userId)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return existing;

  const now = new Date();
  const { data: sub, error } = await db
    .from("user_subscriptions")
    .upsert({
      user_id: params.userId,
      book_id: params.bookId,
      status: "active",
      monthly_price_usd: book.subscription_price_usd ?? 0,
      starts_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    })
    .select()
    .single();
  if (error || !sub) throw new Error(error?.message ?? "Could not activate subscription");
  return sub;
}
