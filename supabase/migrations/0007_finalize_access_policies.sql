-- Seeparah — the FINAL, admin-role-aware `books`/`book_chunks` access
-- policies. Required, not optional: apply in the same maintenance window
-- as 0001-0006, right after them (references `public.is_admin()` from
-- 0004, the rights/edition columns from 0005, and `translation_requests`
-- from 0006, so it cannot run before those exist).
--
-- REVISION NOTE (this version supersedes an earlier draft of this file):
-- re-reviewed for the same class of gap found in 0000 (see that file's
-- header) and one further gap specific to the post-0005 schema:
--   1. The previous version searched pg_policies for cmd = 'SELECT' /
--      cmd = 'ALL'... no — it searched only 'SELECT' and 'UPDATE'
--      literally, which misses a `FOR ALL` policy the same way 0000's did.
--      Fixed the same way: drop EVERY existing policy on both tables,
--      logged first, regardless of cmd.
--   2. The previous version never touched `books` INSERT at all — an
--      author could have inserted a brand-new row already at
--      `status = 'published'` (or, worse, with `rights_status`/
--      `edition_review_status` pre-set to `'approved'`) directly via REST,
--      with nothing in that version rejecting it. Fixed with an explicit
--      INSERT policy AND column-level INSERT grants (see step 4 below).
--   3. The previous version's UPDATE policy only checked `status` in its
--      WITH CHECK. A row-level policy's WITH CHECK sees the proposed NEW
--      row as a whole; it does not, by itself, stop an author from ALSO
--      setting `rights_status = 'approved'` or `edition_review_status =
--      'approved'` in the SAME statement as long as the resulting
--      `status` value passed the check — `rights_status`/
--      `edition_review_status` were never independently protected. Do not
--      assume a row-level UPDATE policy protects a column it never
--      mentions. Fixed with column-level UPDATE/INSERT grants (step 4) —
--      the correct primitive for "this specific column may never be set
--      by this role," independent of whatever the row-level policy checks.
--
-- EVIDENCE STATUS: none of the protections in this file have been applied
-- to any database or live-tested — `books.rights_status` etc. do not exist
-- in production yet (checked now, read-only, 2026-09-14), and no local or
-- staging database was available in this session (no Docker, no local
-- Postgres, no reachable staging project). This is WRITTEN, NOT VERIFIED.
-- See supabase/tests/rls_hotfix_tests.sql §"0007 / post-migration" for the
-- prepared, NOT RUN test cases this needs before being trusted in
-- production, and docs/admin-operator-guide.md §8.3 for the staging
-- procedure.
--
-- SCOPE: this migration touches the SELECT/INSERT/UPDATE policies and the
-- INSERT/UPDATE column grants on `books` and `book_chunks`. It does not
-- touch any other table: `admin_users`, `audit_log`, `admin_action_events`,
-- `translation_requests`, `content_settings`(+history), `support_tickets`
-- (+notes), `error_events`, and the translation job/section/guide tables
-- are all NEW tables introduced by 0001/0004/0006 with no pre-existing
-- policy to conflict with — reviewed directly in this change, not carried
-- over from before, so there is no "older permissive policy" risk on
-- those specifically. (Their own INSERT policies were separately reviewed
-- for the same "does the WITH CHECK actually pin every review-owned
-- column" class of bug — see the fix already applied to
-- `translation_requests_insert_own` in migration 0006.)

begin;

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.books') is null then
    raise exception 'Precondition failed: public.books does not exist — aborting';
  end if;
  if to_regclass('public.book_chunks') is null then
    raise exception 'Precondition failed: public.book_chunks does not exist — aborting';
  end if;
  if to_regprocedure('public.is_admin(text[])') is null then
    raise exception 'Precondition failed: public.is_admin(text[]) does not exist — apply 0004 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'rights_status'
  ) then
    raise exception 'Precondition failed: public.books.rights_status does not exist — apply 0005 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'book_chunks' and column_name = 'status'
  ) then
    raise exception 'Precondition failed: public.book_chunks.status does not exist — apply 0001 first';
  end if;
  if to_regclass('public.translation_requests') is null then
    raise exception 'Precondition failed: public.translation_requests does not exist — apply 0006 first';
  end if;
  if to_regclass('public.user_subscriptions') is null then
    raise exception 'Precondition failed: public.user_subscriptions does not exist (expected to predate this change)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Log, then drop, EVERY existing policy on books/book_chunks —
--    regardless of cmd. Whatever 0000 created (if applied) or whatever
--    predates this change, all of it is superseded here.
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
  raise notice 'Dropped % existing polic(ies) on books/book_chunks.', dropped_count;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Grants — the actual boundary for "can an ordinary author ever set a
--    rights/editorial-review field", independent of what any row-level
--    policy's WITH CHECK does or doesn't mention. `anon` gets no write
--    grant at all on either table. `authenticated` gets INSERT/UPDATE
--    scoped to exactly the columns an author legitimately submits —
--    every rights/provenance/review column added by 0005
--    (`rights_basis`, `rights_evidence_url`, `attribution`,
--    `permitted_territories`, `translation_permission`, `source_url`,
--    `source_edition_id`, `translator`, `categories`, `import_key`,
--    `checksum`, `rights_status`, `edition_review_status`,
--    `rejection_reason`, `review_notes`, `reviewed_by`, `reviewed_at`) is
--    DELIBERATELY EXCLUDED — none of them are set by the current
--    author-facing publish flow (verified by reading
--    src/lib/library.ts's `publishBook`, which only ever sets the columns
--    listed below), so excluding them changes no existing behavior. A
--    column excluded from an INSERT grant falls back to its table default
--    (`rights_status`/`edition_review_status` both default to `'pending'`)
--    regardless of what a client sends — an author cannot self-approve at
--    insert time even if they include the field in the request body.
--    Admin-side writes to these columns run through the service-role
--    client (src/lib/admin/catalog.server.ts), which bypasses grants and
--    RLS entirely, so nothing here affects that path.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.books from anon;
revoke insert, update, delete on public.book_chunks from anon;

revoke insert, update on public.books from authenticated;
grant insert (
  title, author, author_id, cover_url, available_languages, total_chunks,
  source_language, description, genre, status, access_type,
  subscription_price_usd
) on public.books to authenticated;
grant update (
  title, author, cover_url, available_languages, total_chunks,
  source_language, description, genre, status, access_type,
  subscription_price_usd
) on public.books to authenticated;
-- `id`, `created_at`, and every 0005 rights/review column above are
-- excluded from both grants; `author_id` is excluded from UPDATE only
-- (an author sets it once at insert time — to themselves, enforced by the
-- WITH CHECK below — but can never reassign it afterward: the column
-- simply isn't updatable by this role at all).

revoke insert, update, delete on public.book_chunks from authenticated;
grant insert (
  book_id, language, chunk_index, content, status
) on public.book_chunks to authenticated;
-- `source_version`, `job_id`, `model`, `prompt_version`, and `updated_at`
-- are translation-pipeline-internal bookkeeping columns an ordinary
-- author has no legitimate reason to set directly; excluded from the
-- grant so they always take their column defaults on a self-service
-- insert. No UPDATE grant at all — see the no-legitimate-edit-path note
-- in 0000's step 2, still true after 0001 adds these columns: nothing in
-- this codebase updates an existing book_chunks row outside the
-- service-role translation worker.

alter table public.books enable row level security;
alter table public.book_chunks enable row level security;

-- ---------------------------------------------------------------------------
-- 3. books: SELECT — public catalog (published), the owning author (any
--    status — this is how an author previews/edits their own draft), and
--    staff who hold catalog.read_unpublished (owner/administrator/editor
--    — matches src/lib/admin/permissions.ts exactly; support does NOT get
--    this). The staff clause is what lets an editor see an admin-uploaded
--    book that has `author_id is null` — the author clause can never
--    match that case.
-- ---------------------------------------------------------------------------
create policy books_read_access on public.books
for select
using (
  status = 'published'
  or author_id = auth.uid()
  or public.is_admin(array['owner', 'administrator', 'editor'])
);

-- ---------------------------------------------------------------------------
-- 4. books: INSERT — an author may create a new row for themselves, never
--    already at 'published'. The rights/review columns can't be set at
--    all per the grant above, so this WITH CHECK only needs to police
--    `status` and ownership.
-- ---------------------------------------------------------------------------
create policy books_author_insert on public.books
for insert
with check (
  author_id = auth.uid()
  and status in ('draft', 'in_review', 'unpublished')
);

-- ---------------------------------------------------------------------------
-- 5. books: UPDATE — the author keeps self-service over their own row's
--    editable columns (restricted by the column grant above), but can
--    only ever move `status` among the values that were always theirs to
--    set without review (draft/in_review/unpublished — matches
--    setBookStatus's own type in src/lib/library.ts). 'approved',
--    'published', 'rejected', 'changes_requested', and 'archived' are
--    admin-only decisions, written only by service-role code
--    (src/lib/admin/catalog.server.ts), which bypasses this table
--    entirely — no authenticated-role grant or policy ever allows those
--    values, at any privilege level, by design.
-- ---------------------------------------------------------------------------
create policy books_author_update on public.books
for update
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and status in ('draft', 'in_review', 'unpublished')
);

-- ---------------------------------------------------------------------------
-- 6. book_chunks: SELECT — every gate `src/lib/reader.server.ts`'s
--    `resolveReaderAccess` enforces server-side, mirrored here as the
--    REST-level backstop.
-- ---------------------------------------------------------------------------
create policy book_chunks_read_access on public.book_chunks
for select
using (
  status = 'published'
  and exists (
    select 1 from public.books b
    where b.id = book_chunks.book_id
      and (
        b.status = 'published'
        or b.author_id = auth.uid()
        or public.is_admin(array['owner', 'administrator', 'editor'])
      )
  )
  and (
    chunk_index = 0
    or exists (
      select 1 from public.books b
      where b.id = book_chunks.book_id and b.access_type <> 'paid'
    )
    or exists (
      select 1 from public.books b
      where b.id = book_chunks.book_id and b.author_id = auth.uid()
    )
    or exists (
      select 1 from public.user_subscriptions s
      where s.book_id = book_chunks.book_id
        and s.user_id = auth.uid()
        and s.status = 'active'
        and (s.expires_at is null or s.expires_at > now())
    )
  )
  and (
    book_chunks.language not in ('Hindi', 'Arabic')
    or exists (
      select 1 from public.books b
      where b.id = book_chunks.book_id and b.source_language = book_chunks.language
    )
    or exists (
      select 1 from public.books b
      where b.id = book_chunks.book_id and b.author_id = auth.uid()
    )
    or exists (
      select 1 from public.translation_requests tr
      where tr.book_id = book_chunks.book_id
        and tr.language = book_chunks.language
        and tr.requester_id = auth.uid()
        and tr.status = 'granted'
    )
  )
);

-- ---------------------------------------------------------------------------
-- 7. book_chunks: INSERT — the same "don't let an author silently add or
--    replace content on a live book" protection as 0000, using the final
--    schema (book_chunks now has its own `status`, unrelated to whether
--    the book is publicly visible — see 0000's footer note on what
--    book_chunks.status actually means).
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

-- No DELETE policy/grant for `anon` or `authenticated` on either table —
-- same deliberate default-deny as 0000, unchanged by anything 0001-0006
-- add.

-- ---------------------------------------------------------------------------
-- 8. Postconditions
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
  if exists (
    select 1 from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'books'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
      and column_name in ('rights_status', 'edition_review_status', 'reviewed_by', 'reviewed_at', 'review_notes', 'rejection_reason')
  ) then
    raise exception 'Postcondition failed: authenticated still has UPDATE on a protected rights/review column — rolling back';
  end if;
  raise notice 'Postconditions passed: all 5 expected policies exist; no protected column grant leaked to authenticated.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- Run supabase/tests/rls_hotfix_tests.sql's "0007 / post-migration" section
-- (currently marked NOT RUN — no database was available to run it in the
-- session that wrote this file), plus the staging checklist in
-- docs/admin-operator-guide.md §8.3, before relying on this in production.
