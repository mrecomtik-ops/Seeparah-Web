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
  reason?: "sign_in_required" | "subscription_required" | "not_available";
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
    .select("id, access_type, author_id")
    .eq("id", params.bookId)
    .single();
  if (bookError || !book) return { content: null, locked: false, reason: "not_available" };

  const isFreePreview = params.chunkIndex === 0;
  const isOwner = params.userId != null && book.author_id === params.userId;
  const requiresSubscription = book.access_type === "paid" && !isFreePreview && !isOwner;

  if (requiresSubscription) {
    if (!params.userId) {
      return { content: null, locked: true, reason: "sign_in_required" };
    }
    const { data: sub } = await db
      .from("user_subscriptions")
      .select("id, status, expires_at")
      .eq("book_id", params.bookId)
      .eq("user_id", params.userId)
      .eq("status", "active")
      .maybeSingle();
    const active = sub && (!sub.expires_at || new Date(sub.expires_at) > new Date());
    if (!active) return { content: null, locked: true, reason: "subscription_required" };
  }

  const { data: chunk } = await db
    .from("book_chunks")
    .select("content")
    .eq("book_id", params.bookId)
    .eq("language", params.language)
    .eq("chunk_index", params.chunkIndex)
    .eq("status", "published")
    .maybeSingle();

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
