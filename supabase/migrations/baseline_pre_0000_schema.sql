-- Seeparah — baseline schema for a FRESH, empty Supabase project.
--
-- MUST be applied FIRST, before 0000_hotfix_current_books_rls.sql. This is
-- not part of the numbered 0000-0007 sequence and is deliberately named
-- without a leading number: every migration in this project has always
-- been applied manually, one file at a time, via the SQL editor or
-- `supabase db push` against a single already-identified file — never
-- through automated sequential `supabase migration list` ordering (no
-- session working on this project has ever had a working path to that;
-- see docs/seeparah-backend-recovery-plan.md and
-- docs/lovable-final-handoff.md). A leading-zero filename that sorts
-- before "0000" is not reliably parseable by this project's own tooling
-- (confirmed this session: `supabase migration new` only recognizes a
-- purely numeric, typically 14-digit timestamp prefix) — so this file
-- relies on being named clearly and applied deliberately, not on lexical
-- ordering. Do not rename the existing 0000-0007 files to make room for
-- this one; that would invalidate every cross-reference in their own
-- headers and in the docs that cite them by name.
--
-- WHY THIS FILE EXISTS: `0000_hotfix_current_books_rls.sql` and every
-- migration after it were written against Seeparah's ORIGINAL production
-- database, whose `books`/`book_chunks`/`book_shelves`/`reading_progress`/
-- `book_highlights`/`user_subscriptions` tables predate this repo's
-- migration history entirely — they were created directly (by Lovable's
-- initial scaffolding), never captured as a migration file here. Every
-- migration from `0000` onward assumes those six tables already exist
-- with a specific shape and explicitly checks for that shape in its own
-- precondition block (e.g. 0000 aborts if `public.books` or
-- `public.books.status`/`author_id` don't exist). Applying `0000` to a
-- genuinely empty new project fails immediately and correctly, by design
-- — it is not a bug in `0000`, it is `0000` refusing to guess at a schema
-- it cannot see. This file supplies exactly what `0000`-`0007` expect to
-- already be there, reconstructed from the application's own TypeScript
-- types (`src/lib/data.ts` — the `Book`, `Chunk`, `Progress`, `Highlight`,
-- `Subscription`, `ShelfRow` interfaces) and its exact query/upsert
-- patterns (`src/lib/library.ts`, `src/lib/shelves.ts`), not guessed —
-- every column, every upsert conflict target, and every unique
-- constraint below is traceable to a specific call site.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO:
--   - Does not enable RLS or create any policy on `books`/`book_chunks` —
--     that is `0000`'s job, immediately next, and it already does exactly
--     this (`alter table ... enable row level security`, then a dynamic
--     drop-and-recreate of every policy — which works identically whether
--     there were zero prior policies, as here, or some inherited ones, as
--     on the original database). Adding policies here that `0000` would
--     immediately drop and replace would be redundant, not wrong, but
--     pointless — skipped for exactly that reason.
--   - DOES enable RLS and create real, minimal, owner-only policies on
--     `book_shelves`, `reading_progress`, `book_highlights`, and
--     `user_subscriptions` — none of `0000`-`0007` ever touch these four
--     tables' policies (confirmed by re-reading every one of those
--     files' headers, several of which say so explicitly), so if this
--     file didn't set real policies here, these four tables would be
--     created with RLS enabled and NO policies at all — which is a
--     silent total-deny for every role including the owner, not a safe
--     default to leave implicit.
--   - Does not seed any data. The new project starts empty by design —
--     see docs/lovable-final-handoff.md and the owner's explicit
--     instruction: "Start with fresh accounts and an empty production
--     catalogue."
--
-- VALIDATION STATUS: written and reviewed by inspection against the
-- application's own source (not against a live database — no isolated
-- Postgres instance was available in this session; see
-- docs/seeparah-backend-recovery-plan.md §3.2/§7 for the same, still-
-- unresolved tooling gap). Apply this to a real project and run the
-- VERIFY block at the bottom before trusting it with real traffic.

begin;

-- ---------------------------------------------------------------------------
-- 1. books — matches src/lib/data.ts's `Book` interface exactly. `genre`,
--    `rights_status`, `edition_review_status`, `rejection_reason`,
--    `review_notes` are marked optional there because 0005 adds the review
--    columns later; only `genre` (present in the original schema, per
--    every anon-key probe of the real production project throughout this
--    engagement) belongs in the baseline.
-- ---------------------------------------------------------------------------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  author_id uuid references auth.users (id) on delete set null,
  cover_url text,
  available_languages text[] not null default '{}',
  total_chunks integer not null default 0,
  source_language text not null,
  description text not null default '',
  genre text,
  status text not null default 'draft',
  access_type text not null default 'free' check (access_type in ('free', 'paid')),
  subscription_price_usd numeric,
  created_at timestamptz not null default now()
);

create index books_author_id_idx on public.books (author_id);
create index books_status_idx on public.books (status);

-- ---------------------------------------------------------------------------
-- 2. book_chunks — matches the pre-0001 `Chunk` shape (book_id, language,
--    chunk_index, content only; status/source_version/job_id/model/
--    prompt_version/updated_at are added later by 0001). Composite primary
--    key matches every read path in the app, which always addresses a
--    chunk by exactly (book_id, language, chunk_index).
-- ---------------------------------------------------------------------------
create table public.book_chunks (
  book_id uuid not null references public.books (id) on delete cascade,
  language text not null,
  chunk_index integer not null,
  content text not null,
  primary key (book_id, language, chunk_index)
);

create index book_chunks_book_id_idx on public.book_chunks (book_id);

-- ---------------------------------------------------------------------------
-- 3. reading_progress — matches `Progress`. `saveProgress` in library.ts
--    calls `.upsert(row)` with NO explicit onConflict target, which means
--    Postgres/PostgREST resolves the conflict against the table's own
--    primary key — so the primary key must be exactly
--    (user_id, book_id, language), not a separate surrogate id.
-- ---------------------------------------------------------------------------
create table public.reading_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  language text not null,
  last_chunk_index integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id, language)
);

alter table public.reading_progress enable row level security;

create policy reading_progress_owner_all on public.reading_progress
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. book_highlights — matches `Highlight`. `note` is declared as a
--    required (non-optional) field on the TypeScript interface, but is
--    historically a migration-0002 addition — kept OUT of this baseline
--    deliberately, so 0002 still has real, meaningful work to do and the
--    migration sequence's own numbering keeps its original meaning; 0002's
--    `add column if not exists` runs immediately after this file in the
--    same setup pass, so the gap is closed before any real traffic exists.
-- ---------------------------------------------------------------------------
create table public.book_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  language text not null,
  chunk_index integer not null,
  highlight_text text not null,
  created_at timestamptz not null default now()
);

create index book_highlights_user_book_idx on public.book_highlights (user_id, book_id);

alter table public.book_highlights enable row level security;

create policy book_highlights_owner_all on public.book_highlights
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. book_shelves — matches `ShelfRow`. `toggleShelf` in shelves.ts upserts
--    with an EXPLICIT `onConflict: "user_id,book_id,shelf"`, so the unique
--    constraint must be named to match that exact column list (Postgres/
--    PostgREST resolve onConflict by column list against any matching
--    unique constraint, not specifically the primary key here, so a
--    surrogate `id` primary key is fine as long as the (user_id, book_id,
--    shelf) unique constraint also exists).
-- ---------------------------------------------------------------------------
create table public.book_shelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  shelf text not null check (shelf in ('favorite', 'saved', 'want_to_read')),
  created_at timestamptz not null default now(),
  unique (user_id, book_id, shelf)
);

alter table public.book_shelves enable row level security;

create policy book_shelves_owner_all on public.book_shelves
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. user_subscriptions — matches `Subscription`. `activateTestModeSubscription`
--    in reader.server.ts upserts with no explicit onConflict, so the
--    primary key must be exactly (user_id, book_id) — one active
--    subscription row per reader per book.
-- ---------------------------------------------------------------------------
create table public.user_subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  status text not null default 'active',
  monthly_price_usd numeric not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  renewed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.user_subscriptions enable row level security;

create policy user_subscriptions_owner_read on public.user_subscriptions
for select
using (user_id = auth.uid());

-- No authenticated-role INSERT/UPDATE policy: activateTestModeSubscription
-- (reader.server.ts) writes through the service-role client, which
-- bypasses RLS by design — matching the exact same pattern
-- 0000/0004-0007 use for every service-role-only write path elsewhere in
-- this schema. An ordinary reader granting themselves a subscription row
-- directly via REST is exactly the "test subscription activation cannot
-- grant production entitlements" property already required of this app.

-- ---------------------------------------------------------------------------
-- Postconditions — abort the whole file if anything is missing, rather
-- than leave a partially-created baseline for 0000 to fail against
-- confusingly.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.books') is null then
    raise exception 'Postcondition failed: public.books was not created';
  end if;
  if to_regclass('public.book_chunks') is null then
    raise exception 'Postcondition failed: public.book_chunks was not created';
  end if;
  if to_regclass('public.reading_progress') is null then
    raise exception 'Postcondition failed: public.reading_progress was not created';
  end if;
  if to_regclass('public.book_highlights') is null then
    raise exception 'Postcondition failed: public.book_highlights was not created';
  end if;
  if to_regclass('public.book_shelves') is null then
    raise exception 'Postcondition failed: public.book_shelves was not created';
  end if;
  if to_regclass('public.user_subscriptions') is null then
    raise exception 'Postcondition failed: public.user_subscriptions was not created';
  end if;
  raise notice 'Baseline schema created: books, book_chunks, reading_progress, book_highlights, book_shelves, user_subscriptions.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only) — run before proceeding to 0000:
-- ---------------------------------------------------------------------------
-- select table_name from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('books','book_chunks','reading_progress',
--                       'book_highlights','book_shelves','user_subscriptions')
-- order by table_name;
-- -- expect exactly 6 rows.
--
-- select relname, relrowsecurity from pg_class
-- where relname in ('reading_progress','book_highlights','book_shelves','user_subscriptions')
--   and relnamespace = 'public'::regnamespace;
-- -- expect relrowsecurity = true for all four (books/book_chunks are
-- -- intentionally NOT yet RLS-enabled here — that's 0000's job, next).
