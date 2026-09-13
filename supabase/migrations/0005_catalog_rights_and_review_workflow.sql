-- Seeparah — publishing rights metadata + a real editorial review workflow.
-- Additive and backward compatible: every existing books row keeps its
-- current status/meaning; new columns default to values that do not change
-- what's currently visible to readers.
--
-- HOW TO APPLY: same as prior migrations — review, then run by hand.
--
-- WHY: today `status` moves draft -> in_review -> published entirely under
-- the author's own control (see src/routes/author.book.$bookId.tsx, which
-- says so explicitly in its own UI copy). There is no independent rights
-- review or edition-quality review. This migration adds the columns and the
-- DB-level publish gate; src/lib/admin/catalog.server.ts adds the
-- application-level workflow and error messages on top of it.

-- ---------------------------------------------------------------------------
-- 1. Rights + provenance metadata (required to evaluate a submission)
-- ---------------------------------------------------------------------------
alter table public.books
  add column if not exists rights_basis text,
  add column if not exists rights_evidence_url text,
  add column if not exists attribution text,
  add column if not exists permitted_territories text[] not null default '{}',
  add column if not exists translation_permission boolean not null default false,
  add column if not exists source_url text,
  add column if not exists source_edition_id text,
  add column if not exists translator text,
  add column if not exists categories text[] not null default '{}',
  add column if not exists import_key text,
  add column if not exists checksum text,
  add column if not exists rights_status text not null default 'pending',
  add column if not exists edition_review_status text not null default 'pending',
  add column if not exists rejection_reason text,
  add column if not exists review_notes text,
  add column if not exists reviewed_by uuid references auth.users (id),
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_rights_status_check') then
    alter table public.books
      add constraint books_rights_status_check
      check (rights_status in ('pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'books_edition_review_status_check') then
    alter table public.books
      add constraint books_edition_review_status_check
      check (edition_review_status in ('pending', 'approved', 'changes_requested', 'rejected'));
  end if;
end $$;

-- Stable dedupe key for admin batch/CSV imports: retries of the same import
-- row must not create a second book. Partial unique index (nulls allowed,
-- so existing/organic publishes without an import_key are unaffected).
create unique index if not exists books_import_key_unique
  on public.books (import_key) where import_key is not null;

-- ---------------------------------------------------------------------------
-- 2. Extend the status vocabulary (existing values keep working as-is)
-- ---------------------------------------------------------------------------
-- Existing values in use today: draft, in_review, published, unpublished.
-- New values an admin can set: changes_requested, rejected, archived.
-- "approved" is a transient admin-only state meaning "rights + edition both
-- passed review, not yet published" — kept distinct from "published" so an
-- approved-but-not-yet-live book never appears in the public catalog.
--
-- IMPORTANT — check this before relying on the new status values: this repo
-- has no migration history for the live database (see 0001's header), so
-- it's possible a status check constraint already exists on `books` under a
-- different name than 'books_status_check'. If so, the guard below will
-- correctly skip adding a redundant one, but the OLD constraint will still
-- be enforced alongside it — and since Postgres ANDs all check constraints
-- together, an old constraint limited to the original 4 values would then
-- silently block every new value added here (an UPDATE trying to set
-- 'changes_requested', 'approved', 'rejected', or 'archived' would fail
-- with a constraint-violation error, not a helpful one). Before applying:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.books'::regclass and contype = 'c';
-- If an existing constraint restricts `status`, drop it first (or fold its
-- definition into this one) rather than layering a second one on top.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_status_check') then
    alter table public.books
      add constraint books_status_check
      check (status in (
        'draft', 'in_review', 'changes_requested', 'approved',
        'published', 'rejected', 'unpublished', 'archived'
      ));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Publication gate: DB-level defense in depth
-- ---------------------------------------------------------------------------
-- A book cannot transition INTO 'published' unless rights_status='approved'
-- AND edition_review_status='approved'. This does not replace the
-- application-level check in src/lib/admin/catalog.server.ts (which gives a
-- specific, actionable error message) — it's a second, unbypassable backstop
-- against a direct SQL UPDATE that skips the app entirely.
--
-- IMPORTANT — this intentionally does NOT require a reviewed English/Urdu
-- edition to exist. An approved original-language edition must be
-- publishable on its own; English/Urdu are the standard translation targets
-- but are produced asynchronously afterward and must never block the
-- original from going live (see src/lib/admin/catalog.server.ts's
-- computePublishGate, which reports missing English/Urdu as
-- `pendingTranslations` — informational, not blocking). An earlier version
-- of this trigger hard-blocked on missing English/Urdu editions; that was a
-- product-rules bug, not a security control, and has been removed.
create or replace function public.check_book_publish_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    if new.rights_status <> 'approved' then
      raise exception 'Cannot publish: rights review is not approved';
    end if;
    if new.edition_review_status <> 'approved' then
      raise exception 'Cannot publish: edition quality review is not approved';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists books_publish_gate on public.books;
create trigger books_publish_gate
  before update on public.books
  for each row execute function public.check_book_publish_gate();

-- ---------------------------------------------------------------------------
-- The books UPDATE policy: see 0000 and 0007, not a comment here
-- ---------------------------------------------------------------------------
-- This used to be a commented-out suggestion pending a live policy-name
-- lookup. It's now verified and real: live testing confirmed an author
-- could `PATCH` their own book's status straight to 'published' via REST
-- (see docs/security-verification-2026-09.md) — the trigger above stops
-- that specific transition once IT is applied, but nothing before this
-- change stopped the write from an untouched, unrelated RLS policy that
-- has no status allow-list at all. `0000_hotfix_current_books_rls.sql`
-- fixes this immediately using only today's schema; the same fix, extended
-- for the full status vocabulary this migration adds, is folded into
-- `0007_finalize_access_policies.sql`, applied after 0001-0006. Both drop
-- whatever UPDATE policy currently exists on `books` by querying
-- pg_policies directly rather than requiring a manual name lookup first.
--
-- Service-role admin functions (src/lib/admin/catalog.server.ts) always
-- bypass RLS, so no additional policy is needed for the admin-only status
-- values ('approved', 'rejected', 'changes_requested', 'archived',
-- 'published') — they are simply never granted to the authenticated role
-- at all, at any privilege level, by design.
