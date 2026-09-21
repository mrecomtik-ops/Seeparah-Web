-- Seeparah — book category suggestions, and the Literature Research
-- content type (submission, review, versioning, publication).
--
-- CATEGORIES: no schema change needed for the core feature.
-- `books.categories text[]` already exists (migration 0005), currently
-- populated only by the admin CSV import path and otherwise unused. The
-- master controlled vocabulary already has a home too: `categories` is
-- already a legal `content_settings` key (settings.server.ts's
-- SETTINGS_SCHEMAS), public and versioned via the existing
-- publishSetting()/adminPublishSetting mechanism — reused as-is, not
-- duplicated. `categories` was NEVER included in `books`'s authenticated
-- column grant (checked migration 0011's exact grant list) — an author
-- already cannot write it directly today. What's added here is narrow:
-- a place to record an author's category SUGGESTION for their own book
-- (or, reused generically, their own research paper) without ever writing
-- to `books.categories` or the master list themselves — an admin's own
-- separate, later action is what actually changes either.
--
-- RESEARCH PAPERS: a genuinely new content type, deliberately NOT modeled
-- on `books`/`book_chunks` (a paper is one document, not a chunked,
-- multi-language edition). Two tables:
--   * research_papers — the single live "authoring" row per paper. Authors
--     read/write their own row (via RLS) while it's in a self-editable
--     status; every submission/review-decision field mirrors the exact
--     draft -> submitted -> changes_requested/approved/rejected ->
--     published/unpublished workflow already established for books
--     (0005/0007), for the same reasons (accountable review, no
--     self-publication).
--   * research_paper_versions — an IMMUTABLE snapshot taken at the moment
--     an admin publishes a version. Readers only ever read from here, via
--     `research_papers.published_version_id` pointing at whichever
--     version row is current. This is the same principle as book_chunks'
--     new pending_content staging column from migration 0013 — applied at
--     whole-document granularity instead of per-chunk — so a reader never
--     sees an in-review edit, and "the previously approved version
--     remains stable" is true by construction: publishing a NEW version
--     never modifies the old snapshot row, it only creates a new one and
--     repoints published_version_id. Withdrawal sets `withdrawn` on the
--     live snapshot and clears the pointer — the paper disappears from
--     public view, nothing is deleted, and the full version history
--     (including every past snapshot) stays in the table as the audit
--     trail, on top of the standard audit_log entries every admin action
--     here also writes via recordAudit().
--
-- HONESTY CONSTRAINTS (product rule, enforced by omission, not by a
-- column): there is no `doi`, `journal`, `peer_reviewed`, or `indexed`
-- column anywhere below. Nothing in this schema can be populated with a
-- fabricated academic credential because nothing exists to hold one.
-- `orcid` is the one external identifier accepted, and only because a
-- reader/author can independently verify a real one — application code
-- validates its format before accepting it (never invented server-side).

begin;

do $$
begin
  if to_regclass('public.books') is null then
    raise exception 'Precondition failed: public.books does not exist — aborting';
  end if;
  if to_regprocedure('public.is_admin(text[])') is null then
    raise exception 'Precondition failed: public.is_admin(text[]) does not exist — apply 0004 first';
  end if;
  if to_regclass('public.research_papers') is not null then
    raise exception 'Precondition failed: public.research_papers already exists — aborting rather than assume this file''s reasoning still matches live state';
  end if;
end $$;

-- ============================================================================
-- 1. Category suggestions — author-facing, generic across content types.
-- ============================================================================
create table public.category_suggestions (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('book', 'research_paper')),
  content_id uuid not null,
  suggested_category text not null check (length(trim(suggested_category)) > 0),
  suggested_by uuid not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index category_suggestions_content_idx
  on public.category_suggestions (content_type, content_id);
create index category_suggestions_status_idx on public.category_suggestions (status);

alter table public.category_suggestions enable row level security;

-- Same pattern as every other author-submission table in this project
-- (e.g. translation_requests): the author can insert/read their own rows;
-- everything else (deciding, reading across all authors) is service-role
-- only from src/lib/admin/catalog.server.ts, never a client-facing policy.
create policy category_suggestions_author_insert on public.category_suggestions
for insert
with check (
  suggested_by = auth.uid()
  and (
    (content_type = 'book' and exists (
      select 1 from public.books b where b.id = content_id and b.author_id = auth.uid()
    ))
    or (content_type = 'research_paper' and exists (
      select 1 from public.research_papers rp where rp.id = content_id and rp.author_id = auth.uid()
    ))
  )
);

create policy category_suggestions_author_read_own on public.category_suggestions
for select
using (suggested_by = auth.uid());

-- ============================================================================
-- 2. research_papers — the live authoring row.
-- ============================================================================
create table public.research_papers (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  author_name text not null check (length(trim(author_name)) > 0),
  coauthor_names text[] not null default '{}',
  affiliation text,
  orcid text,
  language text not null,
  title text not null check (length(trim(title)) > 0),
  abstract text not null check (length(trim(abstract)) > 0),
  keywords text[] not null default '{}',
  topic text,
  paper_type text not null check (
    paper_type in ('original_research', 'literary_analysis', 'review_essay', 'textual_study', 'other')
  ),
  body_text text,
  pdf_data bytea,
  pdf_filename text,
  pdf_size_bytes integer,
  citation_style text,
  references_text text not null check (length(trim(references_text)) > 0),
  rights_declaration text not null check (length(trim(rights_declaration)) > 0),
  third_party_rights_note text,
  funding_note text,
  conflicts_of_interest text,
  acknowledgments text,
  ai_assistance_disclosure text,
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'published', 'unpublished')
  ),
  rejection_reason text,
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_papers_has_content check (
    (body_text is not null and length(trim(body_text)) > 0) or pdf_data is not null
  ),
  constraint research_papers_orcid_format check (
    orcid is null or orcid ~ '^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$'
  )
);

create index research_papers_author_idx on public.research_papers (author_id);
create index research_papers_status_idx on public.research_papers (status);

alter table public.research_papers enable row level security;

-- Mirrors books_author_update exactly: an author's own row is writable
-- only while it's in a self-editable status, and can only ever be moved
-- BACK to one of these three by the author themselves — 'approved' /
-- 'published' / 'rejected' / 'changes_requested' are never client-settable,
-- only written by the service-role admin functions below.
create policy research_papers_author_select on public.research_papers
for select
using (author_id = auth.uid() or public.is_admin(array['owner', 'administrator', 'editor']));

create policy research_papers_author_insert on public.research_papers
for insert
with check (
  author_id = auth.uid()
  and status in ('draft', 'submitted')
);

create policy research_papers_author_update on public.research_papers
for update
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and status in ('draft', 'submitted', 'changes_requested')
);

-- No DELETE policy or grant for any client role — same deliberate
-- default-deny as books/book_chunks; an author's "delete" is the
-- unpublish/withdraw path through service-role code, never a real DELETE.

revoke insert, update, delete on public.research_papers from anon;
revoke insert, update, delete on public.research_papers from authenticated;
grant insert (
  author_id, author_name, coauthor_names, affiliation, orcid, language,
  title, abstract, keywords, topic, paper_type, body_text, pdf_data,
  pdf_filename, pdf_size_bytes, citation_style, references_text,
  rights_declaration, third_party_rights_note, funding_note,
  conflicts_of_interest, acknowledgments, ai_assistance_disclosure, status
) on public.research_papers to authenticated;
grant update (
  author_name, coauthor_names, affiliation, orcid, language, title,
  abstract, keywords, topic, paper_type, body_text, pdf_data, pdf_filename,
  pdf_size_bytes, citation_style, references_text, rights_declaration,
  third_party_rights_note, funding_note, conflicts_of_interest,
  acknowledgments, ai_assistance_disclosure, status
) on public.research_papers to authenticated;
-- author_id, rejection_reason, review_notes, reviewed_by, reviewed_at,
-- published_version_id are excluded from both grants — an author can
-- never reassign ownership, self-approve, or point their own row at a
-- published snapshot. Every one of those is written only by service-role
-- code in src/lib/admin/research.server.ts.

-- ============================================================================
-- 3. research_paper_versions — immutable published snapshots.
-- ============================================================================
create table public.research_paper_versions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.research_papers (id) on delete cascade,
  version integer not null,
  author_name text not null,
  coauthor_names text[] not null default '{}',
  affiliation text,
  orcid text,
  language text not null,
  title text not null,
  abstract text not null,
  keywords text[] not null default '{}',
  topic text,
  paper_type text not null,
  body_text text,
  pdf_data bytea,
  pdf_filename text,
  pdf_size_bytes integer,
  citation_style text,
  references_text text not null,
  funding_note text,
  conflicts_of_interest text,
  acknowledgments text,
  ai_assistance_disclosure text,
  is_current boolean not null default true,
  withdrawn boolean not null default false,
  withdrawn_at timestamptz,
  withdrawn_by uuid,
  withdrawn_reason text,
  published_at timestamptz not null default now(),
  published_by uuid not null,
  unique (paper_id, version)
);

create index research_paper_versions_paper_idx on public.research_paper_versions (paper_id);
create index research_paper_versions_current_idx
  on public.research_paper_versions (is_current)
  where is_current = true and withdrawn = false;

alter table public.research_paper_versions enable row level security;

-- Public read: exactly the current, non-withdrawn snapshot — the one and
-- only thing a reader is ever allowed to see. RLS enforces this
-- independently of whatever application code does or doesn't filter,
-- exactly like book_chunks_read_access for books.
create policy research_paper_versions_public_read on public.research_paper_versions
for select
using (is_current = true and withdrawn = false);

create policy research_paper_versions_admin_read on public.research_paper_versions
for select
using (public.is_admin(array['owner', 'administrator', 'editor']));

-- No client-facing write policy or grant at all — every version is
-- created, superseded, and withdrawn exclusively by service-role code.
revoke insert, update, delete on public.research_paper_versions from anon;
revoke insert, update, delete on public.research_paper_versions from authenticated;

alter table public.research_papers
  add constraint research_papers_published_version_fkey
  foreign key (published_version_id) references public.research_paper_versions (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'research_papers'
  ) then
    raise exception 'Postcondition failed: research_papers was not created';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'research_paper_versions'
  ) then
    raise exception 'Postcondition failed: research_paper_versions was not created';
  end if;
  if has_column_privilege('authenticated', 'public.research_papers', 'reviewed_by', 'UPDATE') then
    raise exception 'Postcondition failed: authenticated can UPDATE research_papers.reviewed_by — rolling back';
  end if;
  if has_column_privilege('authenticated', 'public.research_paper_versions', 'title', 'INSERT') then
    raise exception 'Postcondition failed: authenticated can INSERT into research_paper_versions — rolling back';
  end if;
  raise notice 'Migration 0014 complete: category_suggestions, research_papers, research_paper_versions created with RLS + grants.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select table_name from information_schema.tables where table_schema='public'
--   and table_name in ('category_suggestions','research_papers','research_paper_versions');
-- -- expect 3 rows
--
-- select has_column_privilege('authenticated', 'public.research_papers', 'status', 'UPDATE') as authed_can_set_status,
--        has_column_privilege('authenticated', 'public.research_papers', 'reviewed_by', 'UPDATE') as authed_can_set_reviewer,
--        has_column_privilege('authenticated', 'public.research_paper_versions', 'title', 'INSERT') as authed_can_insert_version;
-- -- expect: authed_can_set_status=true (client can move status among draft/submitted/changes_requested per RLS WITH CHECK,
-- --   even though the grant allows the column — RLS is the real gate on WHICH values), authed_can_set_reviewer=false,
-- --   authed_can_insert_version=false
