-- Seeparah — book category suggestions, and the Literature Research
-- content type (submission, review, versioning, publication).
--
-- HISTORICAL NOTE (added after discovering live drift — read this before
-- trusting "0014 has never been applied" anywhere else in this repo's
-- history): the version of this file at git commit 001c9b2 — table order
-- and precondition fixes only, NONE of the draft-completeness or
-- visibility-design changes below — was actually executed against
-- wxldqxuxpjurttspbxok. This file kept being revised in place afterward
-- (commits d94eb5e, e89268c) under the belief it had never run at all;
-- that belief was wrong for the schema, even though the *file on disk*
-- genuinely was never applied verbatim as it now reads. `git show
-- 001c9b2:supabase/migrations/0014_categories_and_research_papers.sql`
-- is the authoritative record of what actually ran. Migration 0016
-- (`0016_fix_research_paper_visibility_and_draft_completeness.sql`)
-- brings the live schema from that 001c9b2 state up to what this file
-- describes today — it is the accurate record of "what happened" from
-- here forward. This file's own migration-history entry should eventually
-- be repaired as applied (something under version 0014 genuinely did
-- run) — but only once 0016 has been reviewed and run, and with the
-- understanding that "applied" records that a version 0014 ran, not that
-- this exact file's current text is what ran; see 0016's own header for
-- the full reasoning before running that repair command.
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
--     an admin publishes a version. Readers only ever read from here.
--     Publishing/withdrawal design is covered in its own section below —
--     see "PUBLIC VISIBILITY DESIGN".
--
-- HONESTY CONSTRAINTS (product rule, enforced by omission, not by a
-- column): there is no `doi`, `journal`, `peer_reviewed`, or `indexed`
-- column anywhere below. Nothing in this schema can be populated with a
-- fabricated academic credential because nothing exists to hold one.
-- `orcid` is the one external identifier accepted, and only because a
-- reader/author can independently verify a real one — application code
-- validates its format before accepting it (never invented server-side).
--
-- SECTION ORDER (caught during review, before this ever ran): the
-- original draft created category_suggestions FIRST, including its
-- author_insert policy's WITH CHECK, which references
-- public.research_papers — but research_papers didn't exist yet at that
-- point in the script. CREATE POLICY validates every identifier in its
-- USING/WITH CHECK expression immediately, the same as a view or CHECK
-- constraint would, so this would have failed outright with "relation
-- \"public.research_papers\" does not exist" the moment it was run —
-- never actually applied against wxldqxuxpjurttspbxok. Reordered below so
-- research_papers (and research_paper_versions, its own dependent) are
-- created first; category_suggestions — the one table with a forward
-- reference — now comes last.
--
-- DRAFT COMPLETENESS (caught during a second review round, also before
-- this ever ran): the original draft's NOT NULL + CHECK constraints on
-- title/abstract/references_text/rights_declaration/author_name, and the
-- has-content constraint, were UNCONDITIONAL — they would have refused to
-- save a genuinely incomplete draft (e.g. just a title, nothing else)
-- even though the whole point of 'draft' status is that it's allowed to
-- be incomplete, and src/lib/research.ts's firstSubmissionProblem()
-- already implements exactly this distinction at the application layer
-- (permissive for a draft save, strict for a submission). Every one of
-- these constraints below is now conditional on status: `status = 'draft'
-- or <the real requirement>` — a draft can leave any of them empty; every
-- other status (submitted and beyond) requires them, matching
-- firstSubmissionProblem() as the same check duplicated at the DB layer,
-- not a stricter or looser one.
--
-- PUBLIC VISIBILITY DESIGN (also caught during the second review round):
-- the original draft made `is_current` the version table's own
-- independent "am I the public one" flag, defaulting to true on INSERT,
-- with research_papers.published_version_id as a SEPARATE pointer set in
-- a later statement. Between "insert the new version (is_current=true by
-- default)" and "point research_papers.published_version_id at it", the
-- new version was ALREADY publicly readable per the old
-- research_paper_versions_public_read policy (`is_current = true and
-- withdrawn = false`) — and if the second statement never ran at all
-- (a crash, a network failure, anything short-circuiting
-- publishPaperVersion between its insert and its final update), the new
-- version would stay silently, permanently public with no
-- research_papers row ever actually pointing at it as published. This
-- was a real gap, not a rounding error, so it's designed out here rather
-- than patched: `is_current` is removed entirely. A version row can exist
-- in the table (already inserted, snapshot taken) without ever being
-- visible until research_papers.published_version_id is moved to name it;
-- if that never happens, the row simply stays permanently invisible — an
-- orphan, not a leak.
--
-- THIRD REVIEW ROUND (also caught before this ever ran) — two more gaps
-- in the second round's design, both fixed below:
--
-- (a) RLS-on-RLS recursion: the second round's policy read
--     `exists (select 1 from public.research_papers rp where rp.id = ...
--     and rp.published_version_id = ... and rp.status = 'published')`
--     directly inside research_paper_versions' own USING clause. Postgres
--     does NOT exempt a table referenced inside another table's policy
--     expression from that table's own RLS — the subquery is evaluated as
--     the CURRENT caller (anon/authenticated), and research_papers has no
--     public-read policy at all, only research_papers_author_select
--     (author or admin). An anonymous or non-author reader's subquery
--     would therefore find the referenced research_papers row invisible
--     to THEM specifically, `exists(...)` would evaluate false, and
--     research_paper_versions_public_read would never match anything for
--     anon or a logged-in non-author — this was not a leak, it was a
--     silent total outage of the entire public papers feature (worse in
--     some ways: it would have looked like "no papers exist" rather than
--     erroring). Fixed by moving the check into a SECURITY DEFINER
--     function, `is_paper_version_published(paper_id, version_id)` below
--     — the exact same pattern already established by
--     public.is_admin()/public.current_admin_role() in migration 0004
--     ("security definer so policies elsewhere can check role without
--     recursive RLS on admin_users itself"). A SECURITY DEFINER function
--     executes with its OWNER's privileges (the migration role, which is
--     research_papers' table owner and therefore bypasses its RLS by
--     default), so the visibility check itself can see the row — while
--     the function's return value is still just a boolean, revealing
--     nothing about research_papers' actual content to the caller.
--
-- (b) status coupling breaks the "stays visible through a revision" promise:
--     the second round's condition included `rp.status = 'published'`.
--     But a paper that already has a live published version and later
--     gets a REVISION submitted for review must pass back through
--     'submitted' -> 'changes_requested'/'approved' before the next
--     publish — the exact same review cycle every paper goes through
--     (reviewResearchPaper only acts on status = 'submitted'). While that
--     revision is in flight, research_papers.status is temporarily NOT
--     'published' even though the OLD version is still the correct thing
--     to show readers — nothing about the still-live published snapshot
--     has changed. Requiring status = 'published' in the visibility check
--     would hide that old, still-good version the moment the author
--     merely STARTED editing a revision, before any replacement was ever
--     approved or published — breaking exactly the "existing published
--     snapshot stays visible while a replacement is submitted, reviewed,
--     or approved" guarantee. Fixed by dropping the status condition
--     entirely: visibility is now governed SOLELY by
--     `research_papers.published_version_id = research_paper_versions.id`
--     — nothing else. `status` is now a purely editorial-workflow field
--     (what state the CURRENT draft/revision is in) with zero bearing on
--     what's publicly readable. Superseding an old version still happens
--     for free: moving the pointer to the new version's id is the ONLY
--     statement required, and it simultaneously makes the previous
--     version invisible (its id no longer matches the pointer) — no
--     window where old and new are both visible, or both invisible.
--     Withdrawal now explicitly NULLs the pointer (see
--     withdrawPublishedPaper in research.server.ts) rather than relying
--     on status leaving 'published' — required precisely because status
--     may legitimately already be something else (a revision mid-review)
--     at the moment an admin withdraws the currently-live version; nulling
--     the pointer is the one action that cuts visibility regardless of
--     what state the live draft/revision is in.
--     `withdrawn`/`withdrawn_at`/`withdrawn_by`/`withdrawn_reason` on the
--     version row remain, purely as an audit record of *that specific
--     version* having been formally withdrawn (as opposed to superseded
--     by a newer one) — not security-relevant, since the pointer alone
--     fully determines visibility.

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
  if to_regclass('public.research_paper_versions') is not null then
    raise exception 'Precondition failed: public.research_paper_versions already exists — aborting rather than assume this file''s reasoning still matches live state';
  end if;
  if to_regclass('public.category_suggestions') is not null then
    raise exception 'Precondition failed: public.category_suggestions already exists — aborting rather than assume this file''s reasoning still matches live state';
  end if;
end $$;

-- ============================================================================
-- 1. research_papers — the live authoring row.
-- ============================================================================
create table public.research_papers (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  author_name text not null default '',
  coauthor_names text[] not null default '{}',
  affiliation text,
  orcid text,
  language text not null,
  title text not null default '',
  abstract text not null default '',
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
  references_text text not null default '',
  rights_declaration text not null default '',
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
  -- Each of these is exempt only for 'draft' — every other status
  -- (submitted and beyond) requires the real thing. Named individually
  -- (rather than one combined constraint) so a violation names exactly
  -- which field is missing, matching firstSubmissionProblem()'s own
  -- one-problem-at-a-time reporting in src/lib/research.ts.
  constraint research_papers_author_name_required_unless_draft check (
    status = 'draft' or length(trim(author_name)) > 0
  ),
  constraint research_papers_title_required_unless_draft check (
    status = 'draft' or length(trim(title)) > 0
  ),
  constraint research_papers_abstract_required_unless_draft check (
    status = 'draft' or length(trim(abstract)) > 0
  ),
  constraint research_papers_references_required_unless_draft check (
    status = 'draft' or length(trim(references_text)) > 0
  ),
  constraint research_papers_rights_required_unless_draft check (
    status = 'draft' or length(trim(rights_declaration)) > 0
  ),
  constraint research_papers_has_content_unless_draft check (
    status = 'draft'
    or (body_text is not null and length(trim(body_text)) > 0)
    or pdf_data is not null
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
-- 2. research_paper_versions — immutable published snapshots. Visibility
--    is governed entirely from research_papers (see PUBLIC VISIBILITY
--    DESIGN above) — this table carries no visibility flag of its own.
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
  withdrawn boolean not null default false,
  withdrawn_at timestamptz,
  withdrawn_by uuid,
  withdrawn_reason text,
  published_at timestamptz not null default now(),
  published_by uuid not null,
  unique (paper_id, version)
);

create index research_paper_versions_paper_idx on public.research_paper_versions (paper_id);

alter table public.research_paper_versions enable row level security;

-- SECURITY DEFINER so this can check research_papers.published_version_id
-- without applying the CALLER's RLS to research_papers (which has no
-- public-read policy at all — only author-or-admin). Same pattern, same
-- reason, as public.is_admin()/public.current_admin_role() in migration
-- 0004: a policy referencing another RLS-protected table directly in its
-- USING clause is evaluated under the CALLER's privileges on that other
-- table too, not the definer's — see this file's "THIRD REVIEW ROUND (a)"
-- note above for what breaks without this. Returns only a boolean; reveals
-- nothing about research_papers' actual content.
create or replace function public.is_paper_version_published(p_paper_id uuid, p_version_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.research_papers rp
    where rp.id = p_paper_id
      and rp.published_version_id = p_version_id
  );
$$;

-- Public read: exactly the one version research_papers.published_version_id
-- currently names — nothing else. Deliberately does NOT check
-- research_papers.status (see "THIRD REVIEW ROUND (b)" above) — the
-- pointer alone is the single source of truth, so an in-progress revision
-- (status back to submitted/changes_requested/approved) never hides the
-- still-live published snapshot. A version row can be fully inserted and
-- sitting in this table without this policy ever matching it, and it
-- stays that way permanently if the pointer update never runs.
create policy research_paper_versions_public_read on public.research_paper_versions
for select
using (public.is_paper_version_published(paper_id, id));

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

-- ============================================================================
-- 3. Category suggestions — author-facing, generic across content types.
--    Created last: its own INSERT policy references research_papers (for
--    content_type='research_paper' suggestions), which must already exist.
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

do $$
declare
  new_tables text[] := array['research_papers', 'research_paper_versions', 'category_suggestions'];
  tbl text;
  v_fn_def text;
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
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'category_suggestions'
  ) then
    raise exception 'Postcondition failed: category_suggestions was not created';
  end if;
  -- RLS enabled on all three — checked directly via pg_class rather than
  -- assumed from the `alter table ... enable row level security`
  -- statements above having run without error (they could have run
  -- against the wrong table name and still succeeded silently).
  foreach tbl in array new_tables
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = tbl and c.relrowsecurity
    ) then
      raise exception 'Postcondition failed: % does not have row level security enabled — rolling back', tbl;
    end if;
  end loop;
  -- category_suggestions gets no admin read policy (service-role only, by
  -- design — see listCategorySuggestions in catalog.server.ts) but MUST
  -- have exactly the two author-facing policies and nothing else, so a
  -- future migration can't silently add a third without this file's own
  -- reasoning being revisited.
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'category_suggestions'
  ) <> 2 then
    raise exception 'Postcondition failed: category_suggestions has an unexpected policy count — rolling back';
  end if;
  -- is_current must not exist — confirms the redesigned, pointer-only
  -- visibility model actually landed, not a partial/mixed state.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'research_paper_versions' and column_name = 'is_current'
  ) then
    raise exception 'Postcondition failed: research_paper_versions.is_current exists — rolling back';
  end if;
  -- The public-read policy must actually call is_paper_version_published
  -- — not just exist under the right name with stale inline logic. Guards
  -- against a future edit reverting to a direct cross-table subquery
  -- (bringing back the RLS-recursion outage from "THIRD REVIEW ROUND (a)")
  -- while leaving the policy name alone.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'research_paper_versions'
      and policyname = 'research_paper_versions_public_read'
      and qual like '%is_paper_version_published%'
  ) then
    raise exception 'Postcondition failed: research_paper_versions_public_read does not call is_paper_version_published — rolling back';
  end if;
  if to_regprocedure('public.is_paper_version_published(uuid, uuid)') is null then
    raise exception 'Postcondition failed: is_paper_version_published(uuid, uuid) was not created — rolling back';
  end if;
  select pg_get_functiondef('public.is_paper_version_published(uuid, uuid)'::regprocedure) into v_fn_def;
  if v_fn_def not ilike '%security definer%' then
    raise exception 'Postcondition failed: is_paper_version_published is not SECURITY DEFINER — it cannot see research_papers under the caller''s own RLS, so anon could never read a published version — rolling back';
  end if;
  if v_fn_def not like '%published_version_id%' then
    raise exception 'Postcondition failed: is_paper_version_published does not reference published_version_id — rolling back';
  end if;
  if v_fn_def like '%is_current%' then
    raise exception 'Postcondition failed: is_paper_version_published still references the removed is_current column — rolling back';
  end if;
  -- Must NOT reference status at all — see "THIRD REVIEW ROUND (b)":
  -- coupling visibility to research_papers.status hides an already-published
  -- version the moment its author starts a revision, before anything new
  -- has been approved or published. Regression guard against that
  -- reappearing under a different name later.
  if v_fn_def ilike '%status%' then
    raise exception 'Postcondition failed: is_paper_version_published references status — visibility must depend only on published_version_id — rolling back';
  end if;
  if has_column_privilege('authenticated', 'public.research_papers', 'reviewed_by', 'UPDATE') then
    raise exception 'Postcondition failed: authenticated can UPDATE research_papers.reviewed_by — rolling back';
  end if;
  if has_column_privilege('authenticated', 'public.research_paper_versions', 'title', 'INSERT') then
    raise exception 'Postcondition failed: authenticated can INSERT into research_paper_versions — rolling back';
  end if;
  raise notice 'Migration 0014 complete: research_papers, research_paper_versions, category_suggestions created with RLS + grants.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select table_name from information_schema.tables where table_schema='public'
--   and table_name in ('category_suggestions','research_papers','research_paper_versions');
-- -- expect 3 rows
--
-- select relname, relrowsecurity from pg_class
-- where relnamespace = 'public'::regnamespace
--   and relname in ('category_suggestions','research_papers','research_paper_versions');
-- -- expect relrowsecurity = true for all 3
--
-- select tablename, policyname, cmd from pg_policies where schemaname='public'
--   and tablename in ('category_suggestions','research_papers','research_paper_versions')
--   order by tablename, policyname;
-- -- expect exactly 7 rows total: category_suggestions_author_insert,
-- -- category_suggestions_author_read_own (2), research_papers_author_select,
-- -- research_papers_author_insert, research_papers_author_update (3),
-- -- research_paper_versions_public_read, research_paper_versions_admin_read (2)
--
-- select policyname, qual from pg_policies where schemaname='public'
--   and tablename='research_paper_versions' and policyname='research_paper_versions_public_read';
-- -- expect the qual text to be a call to is_paper_version_published(...)
-- -- (a function call, not an inline subquery — see "THIRD REVIEW ROUND (a)")
--
-- select pg_get_functiondef('public.is_paper_version_published(uuid, uuid)'::regprocedure);
-- -- expect: SECURITY DEFINER, references published_version_id, does NOT
-- -- reference status or is_current
--
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='research_paper_versions' and column_name='is_current';
-- -- expect 0 rows
--
-- select has_column_privilege('authenticated', 'public.research_papers', 'status', 'UPDATE') as authed_can_set_status,
--        has_column_privilege('authenticated', 'public.research_papers', 'reviewed_by', 'UPDATE') as authed_can_set_reviewer,
--        has_column_privilege('authenticated', 'public.research_paper_versions', 'title', 'INSERT') as authed_can_insert_version;
-- -- expect: authed_can_set_status=true (client can move status among draft/submitted/changes_requested per RLS WITH CHECK,
-- --   even though the grant allows the column — RLS is the real gate on WHICH values), authed_can_set_reviewer=false,
-- --   authed_can_insert_version=false
--
-- -- IMPORTANT: the checks above only prove grants/policy/function text, not
-- -- runtime behavior under an actual anon session (RLS-on-RLS recursion in
-- -- particular cannot be proven from SQL Editor alone, since the SQL Editor
-- -- runs as an elevated role, not anon). Real behavioral tests (draft save
-- -- with blank fields succeeds, submission with blank fields is refused,
-- -- anon cannot read an unpointed or withdrawn version, anon reads exactly
-- -- the published one even while a revision is mid-review, a revision
-- -- publish moves the pointer atomically) run live against
-- -- wxldqxuxpjurttspbxok, via real anon/authenticated REST calls — not the
-- -- SQL Editor — after you confirm this migration applied. See this
-- -- session's report for the exact results.
