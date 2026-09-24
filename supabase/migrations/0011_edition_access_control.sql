-- Seeparah — edition-level (per-language) access control, account-wide
-- subscription entitlement, and a real grant-leak fix found during audit.
--
-- ============================================================================
-- 0. SECURITY FINDING (fixed below): authors could change their own book's
--    access_type / subscription_price_usd
-- ============================================================================
-- 0007_finalize_access_policies.sql's INSERT and UPDATE column grants on
-- `books` for `authenticated` both list `access_type` and
-- `subscription_price_usd` — meaning any signed-in author could already
-- set their own book to 'paid' (or change its price) directly via REST,
-- with no RLS check stopping it (the books_author_update policy only
-- checks author_id and status, never which columns changed). Confirmed by
-- re-reading 0007's own grant statements before writing this migration,
-- not assumed. This is exactly the gap the product rules called out:
-- "authors must not be able to make their own books Free/Premium or
-- change pricing through the UI, server calls, or direct REST requests."
--
-- REVISION NOTE — attempt #1 of this migration was applied against
-- wxldqxuxpjurttspbxok and rolled back by its own postcondition. Root
-- cause, confirmed live via has_column_privilege(), not assumed: 0007
-- granted access_type/subscription_price_usd as COLUMN-LEVEL privileges
-- (`grant update (col1, col2, ...) on public.books to authenticated`),
-- which Postgres stores in a completely separate ACL (pg_attribute.attacl)
-- from table-level grants (pg_class.relacl). A bare
-- `revoke insert, update on public.books from authenticated` — what
-- attempt #1 did — only clears the table-level ACL entry; it is a silent
-- no-op against column-level grants and never touched 0007's. Fixed below
-- by revoking the two protected columns by name, which is the only syntax
-- that reaches a column-level grant, from both `authenticated` and the
-- PUBLIC pseudo-role (defensive — every role implicitly inherits PUBLIC's
-- privileges, so a PUBLIC-level grant would otherwise survive this
-- migration invisibly and still leak through to authenticated). The
-- pre/postconditions now use has_column_privilege() throughout instead of
-- information_schema.role_column_grants, because the latter only matches
-- an exact `grantee = 'authenticated'` row and would miss a privilege
-- authenticated holds purely by inheriting it from PUBLIC —
-- has_column_privilege() reports the real, effective, inheritance-aware
-- answer, i.e. exactly what a live REST request would actually be allowed
-- to do.

begin;

do $$
begin
  if to_regclass('public.books') is null then
    raise exception 'Precondition failed: public.books does not exist — aborting';
  end if;
  if not (
    has_column_privilege('authenticated', 'public.books', 'access_type', 'INSERT')
    or has_column_privilege('authenticated', 'public.books', 'access_type', 'UPDATE')
    or has_column_privilege('authenticated', 'public.books', 'subscription_price_usd', 'INSERT')
    or has_column_privilege('authenticated', 'public.books', 'subscription_price_usd', 'UPDATE')
  ) then
    raise exception 'Precondition failed: expected authenticated to currently hold some INSERT/UPDATE privilege on books.access_type or books.subscription_price_usd (the exact leak this migration closes) — aborting rather than assume this file''s own reasoning still matches live state';
  end if;
end $$;

-- Clear any table-level grant first (defensive — harmless no-op if none
-- exists; does NOT by itself reach the column-level grants below).
revoke insert, update on public.books from authenticated;

-- THE ACTUAL FIX: revoke the two protected columns by name — the only
-- REVOKE syntax that removes a column-level ACL entry — from both
-- `authenticated` and PUBLIC.
revoke insert (access_type, subscription_price_usd) on public.books from authenticated;
revoke update (access_type, subscription_price_usd) on public.books from authenticated;
revoke insert (access_type, subscription_price_usd) on public.books from public;
revoke update (access_type, subscription_price_usd) on public.books from public;

grant insert (
  title, author, author_id, cover_url, available_languages, total_chunks,
  source_language, description, genre, status
) on public.books to authenticated;
grant update (
  title, author, cover_url, available_languages, total_chunks,
  source_language, description, genre, status
) on public.books to authenticated;
-- access_type and subscription_price_usd are now excluded from BOTH
-- grants entirely — an author cannot set either at insert time or change
-- either afterward, through this role, under any column list. Every other
-- column's grant is unchanged from 0007.

do $$
declare
  -- access_type/subscription_price_usd (this migration's own fix) plus
  -- every rights/review column 0007 already excluded — re-verified here,
  -- not merely assumed still true, in case anything since 0007 re-granted
  -- one of them.
  protected_cols text[] := array[
    'access_type', 'subscription_price_usd',
    'rights_basis', 'rights_evidence_url', 'attribution', 'permitted_territories',
    'translation_permission', 'source_url', 'source_edition_id', 'translator',
    'categories', 'import_key', 'checksum', 'rights_status', 'edition_review_status',
    'rejection_reason', 'review_notes', 'reviewed_by', 'reviewed_at'
  ];
  col text;
begin
  foreach col in array protected_cols loop
    if has_column_privilege('authenticated', 'public.books', col, 'INSERT')
      or has_column_privilege('authenticated', 'public.books', col, 'UPDATE')
    then
      raise exception 'Postcondition failed: authenticated can still INSERT or UPDATE books.% — rolling back', col;
    end if;
  end loop;
  raise notice 'Postconditions passed: authenticated cannot INSERT or UPDATE any of % protected books columns (access_type/subscription_price_usd plus every 0007 rights/review column) — checked via has_column_privilege(), which is inheritance-aware (covers PUBLIC-granted privileges too).', array_length(protected_cols, 1);
end $$;

-- ============================================================================
-- 1. book_editions — the admin-controlled Free/Premium setting for each
--    TRANSLATED edition, independent of the original's own books.access_type.
-- ============================================================================
-- A row's mere existence means "this (book, language) edition has been
-- published at least once" — src/lib/translation.server.ts's
-- publishReviewedEdition creates it (defaulting to 'free') the first time
-- an edition is published, alongside its existing books.available_languages
-- update. No row = the reader-facing meaning is "not available yet, ask to
-- request it" — never a fabricated access decision. RLS enabled, NO
-- policies at all (same pattern as admin_action_events, audit_log): every
-- legitimate read/write goes through service-role admin code
-- (src/lib/admin/catalog.server.ts) or the SECURITY DEFINER functions
-- below, which is how the reader-facing RLS policy on book_chunks reads it
-- without a client-facing policy of its own.
create table if not exists public.book_editions (
  book_id uuid not null references public.books (id) on delete cascade,
  language text not null,
  access_type text not null default 'free' check (access_type in ('free', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (book_id, language)
);

alter table public.book_editions enable row level security;

-- Backfill: every already-published translated edition (any language in
-- available_languages other than the book's own source_language) gets a
-- 'free' row now, so it stays immediately readable after this migration —
-- required by "existing free content must remain readable throughout the
-- migration." New editions default to 'free' the same way going forward
-- via publishReviewedEdition's own upsert, not this one-time backfill.
insert into public.book_editions (book_id, language, access_type)
select b.id, lang, 'free'
from public.books b, unnest(b.available_languages) as lang
where lang <> b.source_language
on conflict (book_id, language) do nothing;

-- ============================================================================
-- 2. SECURITY DEFINER helpers — same established pattern as is_admin() /
--    current_admin_role() (migration 0004): let a client-role RLS policy
--    consult monetization/subscription/book_editions state without those
--    tables needing a direct client-facing read policy of their own.
-- ============================================================================
create or replace function public.is_monetization_enabled()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select value = 'true'::jsonb from public.content_settings where key = 'monetization_enabled'),
    false
  );
$$;

-- "One subscription unlocks all Premium books and translations; there are
-- no per-book or per-translation charges" — account-wide, deliberately NOT
-- filtered by book_id (the column still exists on user_subscriptions for
-- historical/reference purposes — which book a reader subscribed from —
-- but is no longer part of the entitlement check itself).
create or replace function public.has_active_plan_subscription(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_subscriptions
    where user_id = p_user_id
      and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

-- The single premium/free decision for one (book, language, chunk_index),
-- covering both the original edition (books.access_type) and a translated
-- one (book_editions.access_type) — this is the ONE place that logic is
-- expressed at the database layer; src/lib/reader.server.ts's
-- resolveReaderAccess() mirrors it in application code as the second,
-- independent layer the product rules require ("enforce ... in database
-- policies AND server code, not just badges or hidden buttons").
create or replace function public.book_chunk_readable(
  p_book_id uuid,
  p_language text,
  p_chunk_index integer
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_book record;
  v_edition_access text;
begin
  select access_type, source_language into v_book
  from public.books where id = p_book_id;
  if v_book is null then
    return false;
  end if;

  if p_chunk_index = 0 then
    return true;
  end if;

  if p_language = v_book.source_language then
    return v_book.access_type <> 'paid'
      or not public.is_monetization_enabled()
      or public.has_active_plan_subscription(auth.uid());
  end if;

  select access_type into v_edition_access
  from public.book_editions
  where book_id = p_book_id and language = p_language;

  if v_edition_access is null then
    -- No published edition in this language yet — not a premium lock, a
    -- "this doesn't exist yet, go request it" case, handled by the
    -- application layer's separate translation_requests-request flow.
    return false;
  end if;

  return v_edition_access <> 'paid'
    or not public.is_monetization_enabled()
    or public.has_active_plan_subscription(auth.uid());
end;
$$;

-- ============================================================================
-- 3. Replace book_chunks_read_access with the edition-aware version.
-- ============================================================================
-- Removes the old REQUEST_GATED_LANGUAGES (Hindi/Arabic) individual-grant
-- check entirely — "a reader must not need individual approval merely to
-- read an existing published translation." A published translated edition
-- is now governed by the SAME free/premium rule as the original, via
-- book_chunk_readable() above, never by whether this specific reader has
-- their own 'granted' translation_requests row. Dynamic drop-and-recreate,
-- same pattern as 0000/0007, so this is correct regardless of exactly
-- which policy currently exists under whatever name.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'book_chunks' and policyname = 'book_chunks_read_access'
  loop
    execute format('drop policy %I on public.book_chunks', pol.policyname);
  end loop;
end $$;

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
    exists (
      select 1 from public.books b
      where b.id = book_chunks.book_id and b.author_id = auth.uid()
    )
    or public.is_admin(array['owner', 'administrator', 'editor'])
    or public.book_chunk_readable(book_chunks.book_id, book_chunks.language, book_chunks.chunk_index)
  )
);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'book_chunks' and policyname = 'book_chunks_read_access'
  ) then
    raise exception 'Postcondition failed: book_chunks_read_access was not recreated';
  end if;
  if to_regclass('public.book_editions') is null then
    raise exception 'Postcondition failed: book_editions was not created';
  end if;
  raise notice 'Migration 0011 complete: grant leak fixed, book_editions created + backfilled, book_chunks_read_access is now edition-aware.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select has_column_privilege('authenticated', 'public.books', 'access_type', 'INSERT') as at_insert,
--        has_column_privilege('authenticated', 'public.books', 'access_type', 'UPDATE') as at_update,
--        has_column_privilege('authenticated', 'public.books', 'subscription_price_usd', 'INSERT') as price_insert,
--        has_column_privilege('authenticated', 'public.books', 'subscription_price_usd', 'UPDATE') as price_update;
-- -- expect every column: false — this is the exact check that failed on
-- -- attempt #1 (information_schema.role_column_grants missed the
-- -- column-level ACL entry; has_column_privilege() does not)
--
-- -- spot-check a couple of the previously-protected rights/review columns
-- -- too, confirming 0007's own protection is still intact:
-- select has_column_privilege('authenticated', 'public.books', 'rights_status', 'UPDATE') as rights_status_update,
--        has_column_privilege('authenticated', 'public.books', 'reviewed_by', 'UPDATE') as reviewed_by_update;
-- -- expect both: false
--
-- select table_name from information_schema.tables
-- where table_schema='public' and table_name='book_editions';
-- -- expect 1 row
--
-- select count(*) from public.book_editions;
-- -- expect one row per (book, non-source-language) already in
-- -- available_languages before this migration ran
--
-- select proname from pg_proc where pronamespace='public'::regnamespace
--   and proname in ('is_monetization_enabled','has_active_plan_subscription','book_chunk_readable');
-- -- expect 3 rows
