-- Seeparah — staged content edits for book_chunks (admin content-editing
-- review workflow), and a defense-in-depth SELECT grant narrowing so the
-- new staging column can never leak to a reader even via a stray
-- `select("*")`. No changes to `books` in this migration — admin/author
-- book Edit and Delete controls reuse entirely existing mechanisms
-- (setBookLifecycleStatus's 'archived'/'unpublished' states for reversible
-- delete, the existing author-update grant/RLS for metadata edits, and a
-- new application-level permanent-delete function that needs no schema
-- change since every FK from books cascades already except
-- support_tickets.related_book_id, which the delete function nulls out
-- explicitly before deleting — see src/lib/admin/catalog.server.ts).
--
-- WHY A STAGING COLUMN, NOT AN IMMEDIATE WRITE: "require review before
-- changed text becomes publicly readable" (product rule) means an edit by
-- an admin must not overwrite `content` directly — the currently-published
-- text has to keep serving readers, unchanged, until a second, deliberate
-- "publish this edit" action. `pending_content` holds the proposed text;
-- `content` is untouched until that second action runs (see
-- stageChunkContentEdit / publishChunkContentEdit in catalog.server.ts).
-- pending_content_by/pending_content_at are for at-a-glance admin UI
-- display ("pending edit by X, 2 hours ago") without a join — the
-- authoritative who/when audit trail is still admin_action_events via
-- recordAudit(), exactly like every other admin action in this codebase.

begin;

do $$
begin
  if to_regclass('public.book_chunks') is null then
    raise exception 'Precondition failed: public.book_chunks does not exist — aborting';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'book_chunks' and column_name = 'pending_content'
  ) then
    raise exception 'Precondition failed: book_chunks.pending_content already exists — aborting rather than assume this file''s reasoning still matches live state';
  end if;
end $$;

alter table public.book_chunks
  add column if not exists pending_content text,
  add column if not exists pending_content_by uuid,
  add column if not exists pending_content_at timestamptz;

-- ---------------------------------------------------------------------------
-- SELECT grant narrowing: book_chunks has relied on the default table-wide
-- SELECT grant Supabase gives anon/authenticated on every public-schema
-- table since project bootstrap — no migration has ever scoped it (unlike
-- the write side, which has been column-scoped since 0007). Every actual
-- read site in this codebase already selects an explicit column list, not
-- `*` (checked: src/lib/reader.server.ts, src/lib/library.ts), so this is
-- a pure hardening with no behavior change for any existing code path —
-- it just stops a stray future `select("*")` from ever being able to
-- surface an unreviewed pending edit to a reader.
-- ---------------------------------------------------------------------------
revoke select on public.book_chunks from anon, authenticated;
grant select (
  book_id, language, chunk_index, content, status, source_version,
  job_id, model, prompt_version, updated_at
) on public.book_chunks to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'book_chunks' and column_name = 'pending_content'
  ) then
    raise exception 'Postcondition failed: pending_content was not added — rolling back';
  end if;
  if has_column_privilege('authenticated', 'public.book_chunks', 'pending_content', 'SELECT') then
    raise exception 'Postcondition failed: authenticated can still SELECT pending_content — rolling back';
  end if;
  if has_column_privilege('anon', 'public.book_chunks', 'pending_content', 'SELECT') then
    raise exception 'Postcondition failed: anon can still SELECT pending_content — rolling back';
  end if;
  if not has_column_privilege('authenticated', 'public.book_chunks', 'content', 'SELECT') then
    raise exception 'Postcondition failed: authenticated lost SELECT on content — rolling back';
  end if;
  if not has_column_privilege('anon', 'public.book_chunks', 'content', 'SELECT') then
    raise exception 'Postcondition failed: anon lost SELECT on content — rolling back';
  end if;
  raise notice 'Migration 0013 complete: pending_content staging columns added; SELECT column-scoped so pending edits cannot leak.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select has_column_privilege('authenticated', 'public.book_chunks', 'pending_content', 'SELECT') as authed_can_see_pending,
--        has_column_privilege('anon', 'public.book_chunks', 'pending_content', 'SELECT') as anon_can_see_pending,
--        has_column_privilege('authenticated', 'public.book_chunks', 'content', 'SELECT') as authed_can_see_content;
-- -- expect: authed_can_see_pending=false, anon_can_see_pending=false, authed_can_see_content=true
--
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='book_chunks' and column_name like 'pending_content%';
-- -- expect 3 rows: pending_content, pending_content_by, pending_content_at
