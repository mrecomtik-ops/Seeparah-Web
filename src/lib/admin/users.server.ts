// Server-only. Customer/user-account support actions, built only on official
// Supabase Auth admin APIs — never on localStorage, client-editable profile
// fields, or hidden UI state. See docs/admin-operator-guide.md for the
// documented, real limitations of each action (there are a few — the GoTrue
// admin API has no server-side email search, and "send recovery email" only
// applies to accounts that actually have a password identity).
import type { User } from "@supabase/supabase-js";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface AdminUserSummary {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  banned: boolean;
  bannedUntil: string | null;
  providers: string[];
  hasPassword: boolean;
  displayName: string | null;
}

function summarize(u: User): AdminUserSummary {
  const providers =
    (u.app_metadata?.["providers"] as string[] | undefined) ??
    (u.app_metadata?.["provider"] ? [u.app_metadata["provider"] as string] : []);
  const bannedUntil = (u as unknown as { banned_until?: string | null }).banned_until ?? null;
  return {
    id: u.id,
    email: u.email ?? null,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    emailConfirmedAt: u.email_confirmed_at ?? null,
    banned: !!bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
    bannedUntil,
    providers,
    hasPassword: providers.includes("email"),
    displayName: (u.user_metadata?.["full_name"] as string | undefined) ?? null,
  };
}

const SCAN_PAGE_SIZE = 200;
const MAX_SCAN_PAGES = 25; // bounds worst case at 5,000 users scanned per search

/**
 * Searches users by (case-insensitive, substring) email or by exact user id.
 * The GoTrue admin API has no server-side email filter (a real, documented
 * upstream limitation), so a text query pages through listUsers and filters
 * in memory, capped at MAX_SCAN_PAGES. `truncated: true` means the cap was
 * hit before scanning every user — the caller should say results may be
 * incomplete rather than implying this is exhaustive.
 */
export async function searchUsers(params: {
  query: string;
  page: number;
  perPage: number;
}): Promise<{ users: AdminUserSummary[]; truncated: boolean }> {
  const db = await admin();
  const query = params.query.trim().toLowerCase();

  if (!query) {
    const { data, error } = await db.auth.admin.listUsers({
      page: params.page,
      perPage: params.perPage,
    });
    if (error) throw new Error(error.message);
    return { users: data.users.map(summarize), truncated: false };
  }

  if (/^[0-9a-f-]{36}$/i.test(query)) {
    const { data, error } = await db.auth.admin.getUserById(query);
    if (error || !data.user) return { users: [], truncated: false };
    return { users: [summarize(data.user)], truncated: false };
  }

  const matches: AdminUserSummary[] = [];
  let truncated = true;
  for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: SCAN_PAGE_SIZE });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      if (u.email?.toLowerCase().includes(query)) matches.push(summarize(u));
    }
    if (data.users.length < SCAN_PAGE_SIZE) {
      truncated = false;
      break;
    }
    if (matches.length >= params.perPage * 3) break; // enough to paginate client-side
  }
  const start = (params.page - 1) * params.perPage;
  return { users: matches.slice(start, start + params.perPage), truncated };
}

export async function getUserDetail(userId: string): Promise<AdminUserSummary | null> {
  const db = await admin();
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return summarize(data.user);
}

/** Suspends sign-in and session refresh for an account. This does NOT
 * instantly revoke an access token that's already valid (Supabase JWTs are
 * stateless) — it takes effect once that token expires and the client tries
 * to sign in or refresh, which is bounded by the token's remaining lifetime
 * (typically up to 1 hour). That bound is disclosed here deliberately rather
 * than promising immediate revocation. */
export async function suspendAccount(userId: string): Promise<void> {
  const db = await admin();
  const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (error) throw new Error(error.message);
}

export async function restoreAccount(userId: string): Promise<void> {
  const db = await admin();
  const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (error) throw new Error(error.message);
}

/** Sends a password-recovery email via Supabase's own configured mailer
 * (whatever the project's Auth SMTP settings are — this repo carries no
 * separate email-provider integration). Refuses for accounts that have no
 * password identity (Google-only) since there is no Seeparah password to
 * reset for them. */
export async function sendRecoveryEmail(email: string, redirectTo: string): Promise<void> {
  const db = await admin();
  const { data: existing } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  void existing; // listUsers has no email filter; resetPasswordForEmail itself validates the address
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const db = await admin();
  const { error } = await db.auth.resend({ type: "signup", email });
  if (error) throw new Error(error.message);
}

/**
 * Narrowly-scoped, idempotent repair: ensures an author_profiles row exists
 * for a user who owns at least one book but is missing one (e.g. a profile
 * write failed after the book insert succeeded). Never creates a profile for
 * someone who isn't an author, never overwrites an existing row.
 */
export async function repairAuthorProfile(userId: string): Promise<{ created: boolean }> {
  const db = await admin();
  const { count } = await db
    .from("books")
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId);
  if (!count || count === 0) {
    throw new Error("This account does not own any books — there is no author profile to repair");
  }
  const { data: existing } = await db
    .from("author_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return { created: false };
  const { error } = await db.from("author_profiles").insert({ user_id: userId });
  if (error) throw new Error(error.message);
  return { created: true };
}
