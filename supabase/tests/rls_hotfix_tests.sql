-- ============================================================================
-- STATUS: PREPARED, NOT RUN.
-- ============================================================================
-- No database environment was available in the session that wrote this file
-- to execute it: `docker --version` and `psql --version` both failed
-- (neither installed), no local Postgres/Supabase stack could be started,
-- and no staging Supabase project reachable from that session had these
-- migrations applied. Direct Postgres connections to the real project also
-- fail there (IPv6-only route, unavailable in that sandbox). This task
-- explicitly disallows running these against production.
--
-- Run this against a LOCAL Postgres (e.g. `supabase start`, or any Postgres
-- 14+ with the `pgcrypto`/`uuid-ossp` extensions and a stub `auth` schema
-- providing `auth.uid()`) or an explicitly designated staging Supabase
-- project — never production. Use `psql -f supabase/tests/rls_hotfix_tests.sql
-- <connection-string>` or paste sections into the SQL editor. Every test
-- block either prints `NOTICE: PASS ...` or raises an exception naming the
-- first failure — a clean run to the end with no exception is a full pass.
--
-- SETUP THIS FILE ASSUMES:
--   1. A fresh database with 0000-0007 (or, for the "current schema" tests,
--      just the pre-0001 base schema + 0000) already applied.
--   2. Synthetic data only — no real user/book rows. This file creates and
--      cleans up its own rows, all tagged 'zzztest-'.
--   3. A working `auth.uid()` — Supabase's own stack provides this; a bare
--      Postgres needs a stub:
--        create schema if not exists auth;
--        create or replace function auth.uid() returns uuid as $$
--          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
--        $$ language sql stable;
--      and the `authenticated`/`anon` roles must exist
--      (`create role authenticated; create role anon;` with `nologin`).
--
-- HOW EACH "as <role>" BLOCK WORKS: `set local role` switches the current
-- transaction's effective role (so RLS/grants apply as that role);
-- `set local request.jwt.claim.sub` sets the uuid `auth.uid()` reads. Both
-- are transaction-local and reset at the next `commit`/`rollback` in this
-- script's own use of transactions per test group.
-- ============================================================================

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- Fixtures: two synthetic authors, one synthetic book each, cleaned up at
-- the end of the file. Replace these UUIDs if they collide with anything
-- real in whatever database this runs against (they should never exist in
-- production — this file must never run there).
-- ----------------------------------------------------------------------------
begin;

do $$
begin
  -- Synthetic auth.users rows — only needed if the schema has a real
  -- foreign key from books.author_id to auth.users(id); Supabase's stack
  -- does. Adjust/remove if testing against a stub schema without it.
  insert into auth.users (id, email) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'zzztest-author-a@example.invalid'),
    ('bbbbbbbb-0000-4000-8000-000000000002', 'zzztest-author-b@example.invalid')
  on conflict (id) do nothing;
exception when undefined_table or undefined_column then
  raise notice 'auth.users insert skipped (stub schema without it, or different shape) — adjust fixtures for your environment';
end $$;

commit;

-- ============================================================================
-- GROUP 1 — Anonymous and unrelated-user reads of drafts and draft chunks
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  insert into public.books (id, title, author, author_id, source_language, description, status, available_languages, total_chunks, access_type)
  values ('cccccccc-0000-4000-8000-000000000001', 'zzztest-draft-1', 'Zzz Author', 'aaaaaaaa-0000-4000-8000-000000000001', 'English', 'test', 'draft', array['English'], 1, 'free');
  insert into public.book_chunks (book_id, language, chunk_index, content, status)
  values ('cccccccc-0000-4000-8000-000000000001', 'English', 0, 'ZZZTEST-DRAFT-MARKER', 'published');
commit;

begin;
  set local role anon;
  do $$
  declare n integer;
  begin
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000001';
    if n <> 0 then raise exception 'FAIL 1.1: anon could see the draft book row (expected 0, got %)', n; end if;
    raise notice 'PASS 1.1: anon cannot see the draft book row';

    select count(*) into n from public.book_chunks where book_id = 'cccccccc-0000-4000-8000-000000000001';
    if n <> 0 then raise exception 'FAIL 1.2: anon could see the draft''s book_chunks (expected 0, got %)', n; end if;
    raise notice 'PASS 1.2: anon cannot see the draft''s book_chunks content';
  end $$;
rollback; -- anon never wrote anything; rollback is just to drop the role switch

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002'; -- a DIFFERENT signed-in user
  do $$
  declare n integer;
  begin
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000001';
    if n <> 0 then raise exception 'FAIL 1.3: an unrelated authenticated user could see the draft (expected 0, got %)', n; end if;
    raise notice 'PASS 1.3: an unrelated authenticated user cannot see the draft';
  end $$;
rollback;

-- ============================================================================
-- GROUP 2 — Public reading of published originals
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  insert into public.books (id, title, author, author_id, source_language, description, status, available_languages, total_chunks, access_type)
  values ('cccccccc-0000-4000-8000-000000000002', 'zzztest-published-1', 'Zzz Author', 'aaaaaaaa-0000-4000-8000-000000000001', 'English', 'test', 'in_review', array['English'], 1, 'free');
  -- Move to published the way the app would only permit an ADMIN to do —
  -- for this fixture we use a superuser/service-role connection assumption;
  -- if running this file as a normal role, replace the next line with
  -- whatever your test harness uses to simulate the service-role publish.
  reset role;
  update public.books set status = 'published' where id = 'cccccccc-0000-4000-8000-000000000002';
commit;

begin;
  set local role anon;
  do $$
  declare n integer;
  begin
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000002' and status = 'published';
    if n <> 1 then raise exception 'FAIL 2.1: anon could NOT see the published book (expected 1, got %)', n; end if;
    raise notice 'PASS 2.1: anon can read a published book';
  end $$;
rollback;

-- ============================================================================
-- GROUP 3 — Authors reading and editing their own drafts
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  do $$
  declare n integer;
  begin
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000001';
    if n <> 1 then raise exception 'FAIL 3.1: the author could not see their own draft (expected 1, got %)', n; end if;
    raise notice 'PASS 3.1: author can read their own draft';

    update public.books set description = 'zzztest-edited-description' where id = 'cccccccc-0000-4000-8000-000000000001';
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000001' and description = 'zzztest-edited-description';
    if n <> 1 then raise exception 'FAIL 3.2: author could not edit their own draft''s description'; end if;
    raise notice 'PASS 3.2: author can edit their own draft (non-approval column)';
  end $$;
rollback;

-- ============================================================================
-- GROUP 4 — Inserting a book directly as published
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  do $$
  begin
    insert into public.books (title, author, author_id, source_language, description, status, available_languages, total_chunks, access_type)
    values ('zzztest-insert-published', 'Zzz', 'aaaaaaaa-0000-4000-8000-000000000001', 'English', 'test', 'published', array['English'], 1, 'free');
    raise exception 'FAIL 4.1: inserting a book already at status=published SUCCEEDED — this must be rejected';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS 4.1: inserting a book already at status=published was rejected (%)', sqlerrm;
  end $$;
rollback;

-- ============================================================================
-- GROUP 5 — Updating and upserting a draft to published
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  do $$
  declare n integer;
  begin
    update public.books set status = 'published' where id = 'cccccccc-0000-4000-8000-000000000001' and author_id = auth.uid();
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000001' and status = 'published';
    if n <> 0 then raise exception 'FAIL 5.1: author directly UPDATEd their own draft to status=published — self-publish bypass still open'; end if;
    raise notice 'PASS 5.1: direct self-publish UPDATE is rejected (0 rows affected, not an error — this is the correct RLS behavior for a WITH CHECK failure on UPDATE)';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS 5.1 (alternate): self-publish UPDATE raised an error instead of silently affecting 0 rows — also acceptable, still blocked';
  end $$;

  do $$
  declare n integer;
  begin
    insert into public.books (id, title, author, author_id, source_language, description, status, available_languages, total_chunks, access_type)
    values ('cccccccc-0000-4000-8000-000000000001', 'zzztest-draft-1', 'Zzz Author', 'aaaaaaaa-0000-4000-8000-000000000001', 'English', 'test', 'published', array['English'], 1, 'free')
    on conflict (id) do update set status = excluded.status;
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000001' and status = 'published';
    if n <> 0 then raise exception 'FAIL 5.2: an upsert resolving to UPDATE moved the draft to status=published'; end if;
    raise notice 'PASS 5.2: upsert-to-published is rejected the same way a plain UPDATE is';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS 5.2 (alternate): upsert raised an error instead of silently affecting 0 rows — also acceptable, still blocked';
  end $$;
rollback;

-- ============================================================================
-- GROUP 6 — Changing ownership
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  do $$
  begin
    update public.books set author_id = 'bbbbbbbb-0000-4000-8000-000000000002' where id = 'cccccccc-0000-4000-8000-000000000001';
    raise exception 'FAIL 6.1: author reassigned their own book''s author_id to another user — this must be rejected at the grant layer';
  exception when insufficient_privilege then
    raise notice 'PASS 6.1: changing author_id is rejected at the column-grant layer (%)', sqlerrm;
  end $$;
rollback;

-- ============================================================================
-- GROUP 7 — Replacing or adding chunks to an already-published book
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  do $$
  begin
    insert into public.book_chunks (book_id, language, chunk_index, content, status)
    values ('cccccccc-0000-4000-8000-000000000002', 'English', 1, 'ZZZTEST-INJECTED-INTO-PUBLISHED-BOOK', 'published');
    raise exception 'FAIL 7.1: author inserted a new chunk into their OWN already-published book — this must be rejected';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS 7.1: inserting a chunk into an already-published book is rejected (%)', sqlerrm;
  end $$;
rollback;

-- ============================================================================
-- GROUP 8 — A deliberately broad pre-existing FOR ALL policy
-- ============================================================================
-- This simulates the exact class of bug the hotfix revision fixes: a
-- legacy policy with cmd='ALL' that the OLD (cmd='SELECT'/'UPDATE'-only)
-- dynamic-drop would have silently missed.
begin;
  reset role;
  create policy zzztest_legacy_for_all on public.books for all using (true) with check (true);
commit;

-- Re-run the relevant section of 0000/0007 here (copy the "drop every
-- existing policy" DO block + the policy-creation statements) against this
-- database, THEN re-run this group:
begin;
  set local role anon;
  do $$
  declare n integer;
  begin
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000001';
    if n <> 0 then
      raise exception 'FAIL 8.1: the FOR ALL policy is still in effect (anon can see the draft) — the hotfix''s drop loop did not remove it. If you have NOT yet re-applied 0000/0007 in this session, do that now and re-run this group before treating this as a real failure.';
    end if;
    raise notice 'PASS 8.1: after re-applying the hotfix, the pre-existing FOR ALL policy is gone and anon can no longer see the draft';
  end $$;
rollback;

begin;
  reset role;
  drop policy if exists zzztest_legacy_for_all on public.books;
commit;

-- ============================================================================
-- GROUP 9 — Legitimate author submission and unpublish workflows
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  do $$
  declare n integer;
  begin
    insert into public.books (id, title, author, author_id, source_language, description, status, available_languages, total_chunks, access_type)
    values ('cccccccc-0000-4000-8000-000000000003', 'zzztest-submission', 'Zzz', 'aaaaaaaa-0000-4000-8000-000000000001', 'English', 'test', 'in_review', array['English'], 1, 'free');
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000003';
    if n <> 1 then raise exception 'FAIL 9.1: a legitimate draft->in_review submission was rejected'; end if;
    raise notice 'PASS 9.1: legitimate submission (insert at in_review) succeeds';
  end $$;
commit;

begin;
  reset role;
  update public.books set status = 'published' where id = 'cccccccc-0000-4000-8000-000000000003'; -- simulate admin publish
commit;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  do $$
  declare n integer;
  begin
    update public.books set status = 'unpublished' where id = 'cccccccc-0000-4000-8000-000000000003' and author_id = auth.uid();
    select count(*) into n from public.books where id = 'cccccccc-0000-4000-8000-000000000003' and status = 'unpublished';
    if n <> 1 then raise exception 'FAIL 9.2: the author could not unpublish their own published book'; end if;
    raise notice 'PASS 9.2: legitimate unpublish (published -> unpublished, by the owning author) succeeds';
  end $$;
rollback;

-- ============================================================================
-- GROUP 10 — Failure during migration execution: no partial policy replacement
-- ============================================================================
-- Deliberately corrupt a precondition (drop a column the migration expects,
-- in a throwaway copy/branch of the schema — never do this on a database
-- you care about) or intentionally break the postcondition array in a
-- scratch copy of 0000/0007, then apply it and confirm:
--   (a) the whole file raises an exception and the transaction rolls back;
--   (b) querying pg_policies immediately after shows EITHER the full
--       original policy set OR the full original set again after rollback
--       — never a state with some of the old policies dropped and none of
--       the new ones created.
-- This specifically exercises the `begin; ... commit;` wrapper and the
-- postcondition block added in this revision. Not automatable generically
-- here without a disposable schema to intentionally break — left as a
-- manual staging exercise; see docs/admin-operator-guide.md §8.1's
-- corrected recovery guidance for why "drop the trigger/policy" is not an
-- acceptable substitute for this test.

-- ============================================================================
-- Cleanup (safe to run even if some groups above failed/rolled back)
-- ============================================================================
begin;
  reset role;
  delete from public.book_chunks where book_id in (
    'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000003'
  );
  delete from public.books where id in (
    'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000003'
  );
  delete from auth.users where id in (
    'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002'
  );
exception when undefined_table then
  raise notice 'auth.users cleanup skipped (stub schema)';
end;
commit;

-- ============================================================================
-- GROUP 11 — Full migration set (0001-0007): translation grants/revocation,
-- protected approval fields, editor access, MFA
-- ============================================================================
-- These need 0001-0007 fully applied plus the admin_users/translation_
-- requests fixtures below. NOT RUN, same reasons as the rest of this file.
--
-- 11.1 Protected approval fields (0007's grant fix):
--   as an authenticated author owning a book (status='in_review',
--   rights_status='pending'):
--     update public.books set rights_status = 'approved' where id = '<own book>';
--   EXPECT: insufficient_privilege — rights_status has no UPDATE grant to
--   authenticated at all. Also try including it alongside a legitimate
--   field: `update ... set description = 'x', rights_status = 'approved'`
--   — a column-level grant failure rejects the WHOLE statement, so this
--   must fail identically, not silently drop just the rights_status part.
--
-- 11.2 Editor access to an admin-uploaded book (author_id is null):
--   insert an admin_users row for a synthetic editor
--   (role='editor', revoked_at=null); as that editor
--   (set local request.jwt.claim.sub = '<editor id>'):
--     select * from public.books where author_id is null and status='in_review';
--   EXPECT: the row IS visible (public.is_admin(array['owner','administrator','editor'])
--   clause matches). As a synthetic 'support' role instead: EXPECT 0 rows
--   (support does not hold catalog.read_unpublished).
--
-- 11.3 Translation grant/revocation:
--   as reader R, insert into translation_requests (book_id, language,
--   requester_id) values (..., 'Hindi', R) — EXPECT success, status
--   defaults to 'requested'. Then attempt
--     insert into translation_requests (..., status) values (..., 'granted')
--   EXPECT: check_violation/insufficient_privilege — the 0006 insert-check
--   fix requires status='requested' on insert.
--   As service role (bypasses RLS), flip that row to status='granted', with
--   a matching book_translation_jobs row published+human_reviewed=true for
--   the same book/language. As R: confirm
--     select content from book_chunks where book_id=... and language='Hindi'
--   now returns rows. Flip the translation_requests row to status='revoked'
--   (service role) and confirm R's SELECT returns 0 rows again.
--
-- 11.4 MFA enforcement — NOT a database-level test at all: `aal2` is
--   checked in application code (src/lib/admin/require-admin.server.ts),
--   not in any RLS policy in this file. This needs an integration test
--   against a running instance of the app + Supabase Auth (call any
--   admin.* server function with a valid but aal1 session and confirm it
--   throws `mfa_required`) — out of scope for a plain-SQL test file.
