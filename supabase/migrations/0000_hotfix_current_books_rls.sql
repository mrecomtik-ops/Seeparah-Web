-- ============================================================================
-- MERGE NOTE (2026-09-19): this file now begins with the former standalone
-- `baseline_pre_0000_schema.sql`, folded in here rather than kept as a
-- separately-named file. Reason: `supabase db push` applies pending
-- migrations in filename lexical order, and a purely-descriptive filename
-- (no numeric prefix) sorts AFTER "0000_..." — not before it — so as a
-- separate file it would have been applied in the wrong order (0000 before
-- baseline), which fails immediately since 0000's own precondition block
-- requires `public.books`/`public.book_chunks` to already exist. This
-- project already solved the identical problem once before (a policy
-- addition that needed to land inside 0001, not as a separately-named
-- "0001b" file — CLI tooling only reliably orders purely numeric/timestamp
-- prefixes) by folding content into the existing numbered file instead of
-- inventing a new filename; the same fix is applied here. Nothing below was
-- retyped — both original files are concatenated verbatim, each keeping its
-- own begin;/commit; block, so this file now runs as two sequential
-- transactions: baseline schema creation first, then the original 0000
-- hotfix content, unchanged. See each section's own header for its original
-- content and reasoning.
-- ============================================================================

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
-- Seeparah — URGENT hotfix for the CURRENT production `books`/`book_chunks`
-- access rules. Independent of the admin-role work in 0001-0007; apply this
-- one on its own, in a maintenance window, AFTER taking a backup (see
-- docs/admin-operator-guide.md §8.1) — never as a substitute for one, and
-- never without it, urgent or not.
--
-- REVISION NOTE (this version supersedes an earlier draft of this file):
-- the previous version only searched pg_policies for cmd = 'SELECT' and
-- cmd = 'UPDATE' before dropping. A policy defined `FOR ALL` is stored in
-- pg_policies with cmd = 'ALL' and applies to every command — that exact
-- string search would silently never find or remove it, so if the real
-- live policy turns out to be `FOR ALL USING (true)` (or similar), the
-- previous version of this file would have added new, correct SELECT/
-- UPDATE policies ALONGSIDE the untouched permissive one and fixed
-- NOTHING, because Postgres OR's together every applicable PERMISSIVE
-- policy for a given command. This version does not try to selectively
-- match a command string at all: it drops EVERY existing policy on both
-- tables, logs what it found first (RAISE NOTICE — visible in the SQL
-- editor/CLI output), and then explicitly (re)creates a COMPLETE policy
-- set for SELECT, INSERT, and UPDATE on both tables, so nothing is left
-- implicit or inherited from an unknown prior policy of any shape.
--
-- EVIDENCE STATUS — read this before applying:
--   - The SELECT/self-publish findings below are PREVIOUSLY RECORDED,
--     LIVE-VERIFIED evidence from 2026-09-13/14 against the actual
--     production project (see docs/security-verification-2026-09.md for
--     the full transcript). They were re-confirmed read-only (no new
--     writes) on 2026-09-14.
--   - The exact current policy names, whether any of them is `FOR ALL`,
--     and the current table/column grants were NEVER directly inspected
--     (no SQL/dashboard access was available in the session that produced
--     either version of this file) — this is explicitly UNKNOWN, not
--     assumed safe. `supabase/inspect_current_access.sql` queries 1-3 and
--     6 return exactly this; run them and paste the output back before
--     applying, if at all practical. The DYNAMIC DROP below does not
--     depend on that answer to work correctly, but knowing it in advance
--     lets you confirm the drop removes what you expect.
--   - The INSERT-side protections and column-grant restrictions added in
--     THIS revision have NOT been live-tested against production (doing
--     so would require writing test data to production, which this task
--     explicitly disallows) and have NOT been run against any local or
--     staging database (none was available in this session — no Docker,
--     no local Postgres, no reachable staging project; confirmed by
--     trying `docker --version` and `psql --version`, both absent). They
--     are NEW, WRITTEN BUT NOT YET VERIFIED. See
--     supabase/tests/rls_hotfix_tests.sql for the executable test suite,
--     marked NOT RUN, prepared for whoever has a real environment to run
--     it against before this is applied anywhere.
--
-- FINDINGS THIS FIXES (previously recorded, live-verified):
--   1. A disposable test author inserted a `status='draft'` book plus one
--      `book_chunks` row containing a marker string, through the normal
--      authenticated REST path (the same path the real app uses).
--   2. A second, unrelated, fully anonymous REST client (no user session
--      at all) could read the draft's full row AND its book_chunks
--      content — the actual manuscript text of an unpublished book, not
--      metadata, with no account at all.
--   3. The test author could `PATCH` their own draft's `status` directly
--      to `'published'` and have it succeed — self-publish, no review.
--   4. A second, unrelated authenticated user could NOT write to the first
--      author's row (cross-user UPDATE/INSERT-with-spoofed-author-id were
--      both rejected) — so ownership isolation was sound for the paths
--      tested; the gaps were the missing status scope on SELECT and the
--      missing status allow-list on UPDATE.
--   5. Everything created for that test was deleted and confirmed gone.
--      Two disposable auth.users accounts remain
--      (zzzsectestqx1*/zzzsectestqx2*@mailinator.com — see
--      docs/security-verification-2026-09.md for the exact addresses).
--      **These are NOT harmless just because their passwords were
--      discarded**: Mailinator inboxes are PUBLIC — anyone who knows or
--      guesses the inbox name can read mail sent to it, including a future
--      password-reset email, and could then complete a real, confirmed
--      sign-in as that account. They hold no role and no data today, but
--      they are live, confirmed identities in this project's `auth.users`
--      that this session does not control. **An authorized operator with
--      dashboard access should delete both accounts** (Authentication →
--      Users) — this is an outstanding action item, not something already
--      handled.
--   NOT re-tested this session, per this task's explicit constraint
--   against creating production test accounts or modifying production
--   records: whether the finding above is still exactly reproducible today
--   was NOT re-verified by writing new test data. What WAS re-checked,
--   read-only, is that the schema is unchanged (see next paragraph).
--
-- CHECKED NOW (2026-09-14, read-only, no writes): production's `books`
-- table still has only its pre-0001 columns (no `rights_status` etc.) and
-- `book_chunks` still has only `book_id, language, chunk_index, content`
-- — none of 0001-0007 have been applied. This is consistent with (not
-- proof of) migration history — a REST 404/schema-cache-miss on a table
-- name shows PostgREST doesn't currently expose that table under that
-- name; it is evidence of current schema shape, not a substitute for
-- reading actual migration/DDL history if that exists elsewhere.

begin;

-- ---------------------------------------------------------------------------
-- 0. Preconditions — abort (rolling back everything below) rather than
--    proceed against a schema this file doesn't understand.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.books') is null then
    raise exception 'Precondition failed: public.books does not exist — aborting, nothing changed';
  end if;
  if to_regclass('public.book_chunks') is null then
    raise exception 'Precondition failed: public.book_chunks does not exist — aborting, nothing changed';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'status'
  ) then
    raise exception 'Precondition failed: public.books.status does not exist — aborting, nothing changed';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'author_id'
  ) then
    raise exception 'Precondition failed: public.books.author_id does not exist — aborting, nothing changed';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'book_chunks' and column_name = 'book_id'
  ) then
    raise exception 'Precondition failed: public.book_chunks.book_id does not exist — aborting, nothing changed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Log, then drop, EVERY existing policy on books/book_chunks —
--    regardless of cmd (SELECT/INSERT/UPDATE/DELETE/ALL). Logged via
--    RAISE NOTICE so the operator applying this sees exactly what existed
--    and was removed, even without separate SQL introspection access.
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
  dropped_count integer := 0;
begin
  for pol in
    select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename in ('books', 'book_chunks')
  loop
    raise notice 'Dropping existing policy: table=%.% name=% cmd=% permissive=% roles=% using=% with_check=%',
      pol.schemaname, pol.tablename, pol.policyname, pol.cmd, pol.permissive, pol.roles, pol.qual, pol.with_check;
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    dropped_count := dropped_count + 1;
  end loop;
  raise notice 'Dropped % existing polic(ies) on books/book_chunks (all commands, including any FOR ALL).', dropped_count;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Table/column grants — do not rely on row-level policies alone to
--    protect what an author may write. `anon` should never be able to
--    write to either table at all; `authenticated` should only ever be
--    able to touch the specific columns an author legitimately edits.
--    (These REVOKE/GRANT statements never affect the service-role
--    connection admin server code uses — that connects as a role which
--    bypasses grants and RLS entirely, by Postgres/Supabase design.)
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.books from anon;
revoke insert, update, delete on public.book_chunks from anon;

revoke update on public.books from authenticated;
grant update (
  title, author, cover_url, available_languages, total_chunks,
  source_language, description, genre, status, access_type,
  subscription_price_usd
) on public.books to authenticated;
-- `id`, `author_id`, and `created_at` are deliberately NOT in this list:
-- an UPDATE statement that mentions a column in its SET clause needs
-- column-level privilege on that column before Postgres even evaluates
-- RLS — so an author literally cannot submit a statement that changes
-- `author_id` (reassigning ownership) at all, regardless of what the
-- row-level policy's WITH CHECK does or doesn't catch. This is the
-- concrete answer to "changing ownership": blocked at the grant layer,
-- not only by the WITH CHECK equality below (belt and suspenders).

-- authenticated keeps table-level INSERT on both tables (restricted by the
-- WITH CHECK policies below) and no UPDATE/DELETE grant at all on
-- book_chunks — there is no legitimate client-side path today that edits
-- an existing chunk row (verified by code review: every UPDATE/upsert to
-- book_chunks in this codebase runs through the service-role client in
-- src/lib/translation.server.ts / src/lib/admin/catalog.server.ts, which
-- bypasses grants entirely — see docs/security-verification-2026-09.md
-- and this migration's footer for the full file-by-file trace). Default
-- deny for that command, for that role, on that table, deliberately.
revoke update, delete on public.book_chunks from authenticated;

alter table public.books enable row level security;
alter table public.book_chunks enable row level security;

-- ---------------------------------------------------------------------------
-- 3. books: SELECT — public catalog + the owning author. Nothing else
--    exists yet to extend this with (no admin_users, no rights/edition
--    columns) — that comes in 0007, once 0004-0006 have added them.
-- ---------------------------------------------------------------------------
create policy books_read_access on public.books
for select
using (
  status = 'published'
  or author_id = auth.uid()
);

-- ---------------------------------------------------------------------------
-- 4. books: INSERT — an author may create a new row for themselves, but
--    NEVER already at 'published' — this closes the same self-publish gap
--    for the insert path (including an upsert whose conflict target
--    misses, which resolves as a plain insert), not just the update path.
-- ---------------------------------------------------------------------------
create policy books_author_insert on public.books
for insert
with check (
  author_id = auth.uid()
  and status in ('draft', 'in_review', 'unpublished')
);

-- ---------------------------------------------------------------------------
-- 5. books: UPDATE — the author keeps self-service over their own row's
--    editable columns (restricted separately by the column grant above),
--    but can only ever move `status` to a non-terminal, pre-review value.
--    `author_id = auth.uid()` in the WITH CHECK also means an author can
--    never reassign their own book to someone else's account (the new row
--    must still belong to the caller). This intentionally makes it
--    IMPOSSIBLE to update ANY column of an already-'published' row while
--    leaving status='published' — see the "editing a published book"
--    note at the bottom of this file for what that means for the product
--    workflow and why nothing in the current UI needs to change for it.
-- ---------------------------------------------------------------------------
create policy books_author_update on public.books
for update
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and status in ('draft', 'in_review', 'unpublished')
);

-- ---------------------------------------------------------------------------
-- 6. book_chunks: SELECT — unchanged in intent from the previous revision.
--    book_chunks has no `status` column yet in the current schema (that's
--    added by 0001), so the only thing this can gate on right now is the
--    PARENT book's status/ownership.
-- ---------------------------------------------------------------------------
create policy book_chunks_read_access on public.book_chunks
for select
using (
  exists (
    select 1 from public.books b
    where b.id = book_chunks.book_id
      and (b.status = 'published' or b.author_id = auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- 7. book_chunks: INSERT — NEW in this revision. The previous version of
--    this file left book_chunks INSERT completely untouched, reasoning
--    (correctly, but incompletely) that cross-user insert was already
--    blocked. It never checked whether the OWNING author could insert new
--    chunk rows into their OWN already-published book — i.e. silently
--    swap or extend live manuscript text with no review. This policy
--    requires the target book to belong to the caller AND to not
--    currently be published. Combined with the revoked UPDATE grant
--    above, an author can add chunks to a book they're still drafting,
--    but can never add, replace, or otherwise touch chunk rows once that
--    book is live.
-- ---------------------------------------------------------------------------
create policy book_chunks_author_insert on public.book_chunks
for insert
with check (
  exists (
    select 1 from public.books b
    where b.id = book_chunks.book_id
      and b.author_id = auth.uid()
      and b.status <> 'published'
  )
);

-- No DELETE policy is created for either table for `anon` or
-- `authenticated`, and the grant revocations above remove the `authenticated`
-- privilege for it on book_chunks explicitly — this is a deliberate
-- default-deny, not an oversight: no client-side code path in this
-- codebase deletes a books or book_chunks row directly (verified by
-- grepping for `.from("books").delete` / `.from("book_chunks").delete` —
-- zero matches outside service-role admin code, which bypasses this
-- entirely). If a future feature needs client-side delete, it needs its
-- own reviewed policy, not an accidental side effect of this one.

-- ---------------------------------------------------------------------------
-- 8. Postconditions — verify the exact policy set this migration intended
--    to create actually exists before committing. If anything is missing,
--    roll back the WHOLE transaction (including the drops in step 1)
--    rather than leave a partially-replaced, ambiguous policy state.
-- ---------------------------------------------------------------------------
do $$
declare
  expected text[] := array[
    'books.books_read_access', 'books.books_author_insert', 'books.books_author_update',
    'book_chunks.book_chunks_read_access', 'book_chunks.book_chunks_author_insert'
  ];
  item text;
  tbl text;
  pname text;
begin
  foreach item in array expected loop
    tbl := split_part(item, '.', 1);
    pname := split_part(item, '.', 2);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl and policyname = pname
    ) then
      raise exception 'Postcondition failed: expected policy %.% is missing after this migration ran — rolling back everything in this file', tbl, pname;
    end if;
  end loop;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'books' and c.relrowsecurity
  ) then
    raise exception 'Postcondition failed: RLS is not enabled on public.books — rolling back';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'book_chunks' and c.relrowsecurity
  ) then
    raise exception 'Postcondition failed: RLS is not enabled on public.book_chunks — rolling back';
  end if;
  raise notice 'Postconditions passed: all 5 expected policies exist, RLS enabled on both tables.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- EDITING AN ALREADY-PUBLISHED BOOK — intended behavior, documented
-- ---------------------------------------------------------------------------
-- The UPDATE policy above makes it impossible for an author to change ANY
-- column of a currently-'published' row while status stays 'published' —
-- the WITH CHECK requires the resulting status to be draft/in_review/
-- unpublished on every author-initiated update, with no exception for
-- "just fixing a typo in the description."
--
-- This is intentional, not a UI regression to route around: verified by
-- code review, there is currently NO app feature that edits an existing
-- book's row at all except the status-only transition in `setBookStatus`
-- (src/lib/library.ts). `publishBook` (the only other author-facing write)
-- always INSERTs a brand-new row with a new id — there is no
-- "resubmit my existing draft with revised content" flow in the current
-- codebase, published or not. So this policy changes nothing about what
-- the current UI can already do.
--
-- The intended product workflow, if/when an "edit my published book"
-- feature is built: the author must first move `status` to 'unpublished'
-- (already possible today via the existing "Unpublish" button), which
-- immediately removes it from public reader access (per the SELECT
-- policy above); only then can other columns be edited (status is now in
-- the allowed set); republishing is the same reviewed path a new
-- submission takes, not a silent flip back to 'published'. There is no
-- "new draft version, published book stays live while a revision is
-- prepared" concept in the CURRENT schema — `books.source_version`
-- (added by migration 0001, not yet applied) exists specifically to let
-- TRANSLATION editions carry a version number for exactly this kind of
-- staged-revision need; the original `books` row itself has no equivalent
-- versioning mechanism, so "unpublish, edit, re-review" is the only
-- correct path today, not "create a new version." If first-class original-
-- manuscript versioning is wanted later, that is a schema change beyond
-- this security correction's scope — flagged, not built here.
--
-- ---------------------------------------------------------------------------
-- WHY 0007 IS STILL REQUIRED, NOT OPTIONAL
-- ---------------------------------------------------------------------------
-- This file was re-verified against migration 0007 during this revision:
-- 0007 had the exact same cmd='SELECT'/cmd='UPDATE' omission (now fixed
-- there too, in the same revision) and never touched books INSERT at all
-- (also fixed there now). Applying 0007 after this file DROPS every policy
-- this file created (same comprehensive, cmd-agnostic drop) and replaces
-- them with the admin-role-aware final version — it does not reopen
-- anything this file closes; see 0007's own header for the equivalent
-- re-verification note.
