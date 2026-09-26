// Server-only aggregate analytics for the admin Overview.
// Keeps the dashboard simple: operational counts, engagement, catalog mix,
// translation demand, and subscription readiness in one read-only function.
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface AdminOverviewAnalytics {
  books: {
    total: number;
    published: number;
    religious: number;
    general: number;
    publishedTranslations: number;
    paidTranslations: number;
    freeTranslations: number;
  };
  readers: {
    active7d: number;
    active30d: number;
    highlights: number;
    shelfSaves: number;
  };
  translations: {
    requested: number;
    awaitingEdition: number;
    processingJobs: number;
    awaitingReviewJobs: number;
    failedJobs: number;
    topDemand: { language: string; requests: number }[];
  };
  subscriptions: {
    active: number;
  };
  categories: { category: string; books: number }[];
}

export async function getAdminOverviewAnalytics(): Promise<AdminOverviewAnalytics> {
  const db = await admin();
  const now = Date.now();
  const since7 = new Date(now - 7 * 86_400_000).toISOString();
  const since30 = new Date(now - 30 * 86_400_000).toISOString();

  const [
    { data: books },
    { data: editions },
    { data: progress7 },
    { data: progress30 },
    { count: highlights },
    { count: shelfSaves },
    { data: requests },
    { data: jobs },
    { data: subscriptions },
  ] = await Promise.all([
    db.from("books").select("id,status,categories,content_classification"),
    db.from("book_editions").select("book_id,language,access_type"),
    db.from("reading_progress").select("user_id").gte("updated_at", since7),
    db.from("reading_progress").select("user_id").gte("updated_at", since30),
    db.from("book_highlights").select("id", { count: "exact", head: true }),
    db.from("book_shelves").select("id", { count: "exact", head: true }),
    db.from("translation_requests").select("language,status").limit(5000),
    db.from("book_translation_jobs").select("status").limit(5000),
    db
      .from("user_subscriptions")
      .select("user_id,status,expires_at")
      .eq("status", "active")
      .limit(5000),
  ]);

  const bookRows = books ?? [];
  const editionRows = editions ?? [];
  const religiousIds = new Set(
    bookRows
      .filter(
        (b) =>
          b.content_classification === "religious" ||
          (b.categories ?? []).includes("Religious"),
      )
      .map((b) => b.id),
  );

  const categoryCounts = new Map<string, number>();
  for (const book of bookRows.filter((b) => b.status === "published")) {
    for (const category of book.categories ?? []) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }

  const demand = new Map<string, number>();
  for (const request of requests ?? []) {
    if (["requested", "approved_awaiting_edition", "granted"].includes(request.status)) {
      demand.set(request.language, (demand.get(request.language) ?? 0) + 1);
    }
  }

  const activeSubscriptions = new Set(
    (subscriptions ?? [])
      .filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now)
      .map((s) => s.user_id),
  );

  return {
    books: {
      total: bookRows.length,
      published: bookRows.filter((b) => b.status === "published").length,
      religious: religiousIds.size,
      general: bookRows.length - religiousIds.size,
      publishedTranslations: editionRows.length,
      paidTranslations: editionRows.filter((e) => e.access_type === "paid").length,
      freeTranslations: editionRows.filter((e) => e.access_type === "free").length,
    },
    readers: {
      active7d: new Set((progress7 ?? []).map((r) => r.user_id)).size,
      active30d: new Set((progress30 ?? []).map((r) => r.user_id)).size,
      highlights: highlights ?? 0,
      shelfSaves: shelfSaves ?? 0,
    },
    translations: {
      requested: (requests ?? []).filter((r) => r.status === "requested").length,
      awaitingEdition: (requests ?? []).filter((r) => r.status === "approved_awaiting_edition").length,
      processingJobs: (jobs ?? []).filter((j) => ["pending", "processing"].includes(j.status)).length,
      awaitingReviewJobs: (jobs ?? []).filter((j) => j.status === "awaiting_review").length,
      failedJobs: (jobs ?? []).filter((j) => j.status === "failed").length,
      topDemand: [...demand.entries()]
        .map(([language, requests]) => ({ language, requests }))
        .sort((a, b) => b.requests - a.requests || a.language.localeCompare(b.language))
        .slice(0, 8),
    },
    subscriptions: {
      active: activeSubscriptions.size,
    },
    categories: [...categoryCounts.entries()]
      .map(([category, books]) => ({ category, books }))
      .sort((a, b) => b.books - a.books || a.category.localeCompare(b.category)),
  };
}
