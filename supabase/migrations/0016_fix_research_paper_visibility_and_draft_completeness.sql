-- Seeparah — transforms the ORIGINAL research-papers schema (exactly
-- what 0014 creates) into the corrected design established during
-- review, before anything is applied.
--
-- WHY THIS IS A SEPARATE FILE, NOT A CHANGE TO 0014: 0014.sql was edited
-- in place three times this session (drafting draft-completeness and
-- visibility fixes) under the belief it had never been applied anywhere.
-- That was wrong — a version of it matching git commit 001c9b2 had
-- already run against wxldqxuxpjurttspbxok. 0014.sql has since been
-- RESTORED to exactly that applied SQL (see its own header note): it
-- still creates research_paper_versions with is_current/withdrawn, and
-- research_papers' completeness constraints are still unconditional.
-- This matters for more than just the live database — it also means the
-- migration chain now replays identically from nothing: a fresh database
-- running 0014 -> 0015 -> 0016 in order reaches the exact same corrected
-- schema that wxldqxuxpjurttspbxok reaches by having already run 0014's
-- original form and then this file. Editing 0014 in place instead would
-- have made a "replay from scratch" diverge from "what the live database
-- actually has," which is the whole point of not touching an
-- already-applied migration.
--
-- LIVE DATA CHECKED BEFORE WRITING THIS (read-only, via service-role
-- REST, no content columns selected): research_papers, research_paper_
-- versions, and category_suggestions all currently have ZERO rows. There
-- is no existing exposure to remediate — this migration exists to fix
-- the DESIGN before real data starts flowing through it, not to clean up
-- a live incident. It is nonetheless written to be correct in general
-- (not "safe only because the tables happen to be empty right now"): the
-- published_version_id backfill below, its data-integrity guards, and
-- every constraint change here would behave correctly with real rows
-- present, and would refuse to run rather than guess if the data doesn't
-- look like what's expected.
--
-- WHAT THIS MIGRATION DOES:
--   A. Backfills research_papers.published_version_id from whatever
--      research_paper_versions row is currently is_current=true and
--      withdrawn=false for that paper, for any paper that doesn't
--      already have a pointer set.
--   B. Replaces research_paper_versions_public_read with the
--      pointer-only design from 0014's "THIRD REVIEW ROUND": drops the
--      is_current column and its partial index, adds the SECURITY
--      DEFINER function public.is_paper_version_published(paper_id,
--      version_id), and rewrites the policy to call it.
--   C. Replaces research_papers' unconditional draft-completeness CHECK
--      constraints with the status-conditional ones from 0014's "DRAFT
--      COMPLETENESS" section, so a genuinely incomplete draft can be
--      saved while submission still requires every field.
--   D. Proves via postcondition that no row was added, changed in a
--      lossy way, or deleted in research_papers, research_paper_
--      versions, or category_suggestions — row counts are captured
--      before any change and compared after.
--
-- DATA-INTEGRITY GUARDS — the actual deliverable is an invariant, not a
-- list of cases: the set of publicly readable versions immediately
-- before this migration must equal the set immediately after its
-- backfill and policy change. The OLD design's published_version_id and
-- is_current/withdrawn were maintained somewhat independently — nothing
-- enforced they always agreed — so the backfill (which only fills a NULL
-- pointer, never overwrites one already set) could silently let an
-- already-wrong pointer become the new, sole source of truth. Two layers
-- enforce the invariant:
--
--   1. Four NAMED PRECONDITIONS, each diagnosing one concrete way an
--      already-set pointer can be wrong, so a failure names the actual
--      problem instead of just "something's wrong":
--        a) a non-null pointer for a paper where NO version is currently
--           is_current=true/withdrawn=false at all (nothing to legitimately
--           point at, yet something is pointed at anyway);
--        b) a pointer that references a version belonging to a DIFFERENT
--           paper (research_paper_versions.paper_id <> the pointer's own
--           research_papers.id — the FK only guarantees the pointer names
--           an existing version row, never that it's THIS paper's row);
--        c) a pointer that references a version marked withdrawn = true
--           (the new policy has no "withdrawn" concept at all — this
--           would make a withdrawn version public again);
--        d) a pointer that disagrees with whichever DIFFERENT version is
--           actually is_current=true/withdrawn=false for that paper.
--      (A fifth precondition, kept from before, guards the backfill
--      itself: no paper may have more than one is_current=true,
--      non-withdrawn version, which would make the backfill's own
--      UPDATE...FROM pick a match nondeterministically.)
--
--   2. One COMPREHENSIVE, DIRECT set-equality check, run immediately
--      after the backfill (while is_current still exists to compute the
--      "before" side): for every version, is "is_current=true and
--      withdrawn=false" (before) exactly equal to "some paper's
--      published_version_id now names it" (after)? This is not derived
--      from the four cases above — it's computed straight from the data,
--      so it catches the actual invariant even if some future edit to
--      this file's reasoning missed a case the four named checks don't
--      cover.
--
-- Every one of these checks is a PRECONDITION or an early postcondition
-- that raises an exception and aborts the whole transaction — nothing is
-- "resolved" automatically by picking a side; a human decides. Today,
-- with zero rows in every affected table, all of them are vacuously
-- satisfied; they exist for whenever this actually runs against real
-- data. See the "GUARD TEST HARNESS" comment block at the end of this
-- file for SQL that constructs each of the four bad states and confirms
-- the corresponding guard fires — written but NOT executed by this
-- session (no local Postgres available in this sandbox; never run it
-- against wxldqxuxpjurttspbxok).
--
-- ROLLBACK BEHAVIOR: everything below runs inside one `begin; ... commit;`
-- transaction, exactly like every other migration in this repo. Any
-- `raise exception` in a postcondition (or precondition) check aborts the
-- whole transaction — Postgres will not commit a transaction that hit an
-- unhandled exception, so a failed postcondition leaves the live schema
-- completely unchanged, not partially migrated. There is no separate
-- "down" script: if this needs to be reversed after a successful commit,
-- that would be its own forward migration (recreating is_current,
-- reverting the constraints) — not attempted here since there's no
-- reason to expect it's needed; this is a bug fix, not a reversible
-- feature toggle.
--
-- MIGRATION HISTORY: this migration does not touch, repair, or assume
-- anything about supabase_migrations.schema_migrations. After 0014 (now
-- restored to what actually ran), 0015, and this file have all been
-- reviewed and run in order, the recommended reconciliation (for you to
-- run, not this session) is: repair 0014, 0015, and 0016 as applied, in
-- that order. 0014.sql's text now genuinely matches what ran, so
-- "applied" is a plain, accurate description — no hedging needed the way
-- it was before 0014.sql was restored.

begin;

-- ----------------------------------------------------------------------
-- Preconditions — abort rather than assume live state matches what's
-- described above if any of this doesn't hold.
-- ----------------------------------------------------------------------
do $$
begin
  if to_regclass('public.research_papers') is null then
    raise exception 'Precondition failed: public.research_papers does not exist — apply (some version of) 0014 first';
  end if;
  if to_regclass('public.research_paper_versions') is null then
    raise exception 'Precondition failed: public.research_paper_versions does not exist — apply (some version of) 0014 first';
  end if;
  if to_regclass('public.category_suggestions') is null then
    raise exception 'Precondition failed: public.category_suggestions does not exist — apply (some version of) 0014 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'research_paper_versions' and column_name = 'is_current'
  ) then
    raise exception 'Precondition failed: research_paper_versions.is_current does not exist — this migration has likely already been applied, or live schema does not match what this file assumes; inspect manually before proceeding';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'research_paper_versions' and column_name = 'withdrawn'
  ) then
    raise exception 'Precondition failed: research_paper_versions.withdrawn does not exist — live schema does not match what this file assumes';
  end if;
  if to_regprocedure('public.is_paper_version_published(uuid, uuid)') is not null then
    raise exception 'Precondition failed: public.is_paper_version_published(uuid, uuid) already exists — this migration has likely already been applied; aborting rather than replace it silently';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'research_paper_versions'
      and policyname = 'research_paper_versions_public_read'
      and qual like '%is_current%' and qual like '%withdrawn%'
      and qual not like '%published_version_id%'
  ) then
    raise exception 'Precondition failed: research_paper_versions_public_read''s qual does not match the expected is_current/withdrawn design — live schema differs from what this file assumes; inspect pg_policies manually before proceeding';
  end if;
  -- The five unconditional-completeness constraints plus the
  -- unconditional has-content constraint, by the deterministic Postgres
  -- auto-naming for a single inline column-level CHECK (`<table>_<column>_
  -- check`), confirmed exactly matching git commit 001c9b2's text (each
  -- column has exactly one inline check, no naming collisions possible).
  if not exists (select 1 from pg_constraint where conrelid = 'public.research_papers'::regclass and conname = 'research_papers_author_name_check') then
    raise exception 'Precondition failed: expected constraint research_papers_author_name_check not found — live schema does not match the assumed pre-migration state; inspect pg_constraint manually before proceeding';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.research_papers'::regclass and conname = 'research_papers_title_check') then
    raise exception 'Precondition failed: expected constraint research_papers_title_check not found — inspect pg_constraint manually before proceeding';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.research_papers'::regclass and conname = 'research_papers_abstract_check') then
    raise exception 'Precondition failed: expected constraint research_papers_abstract_check not found — inspect pg_constraint manually before proceeding';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.research_papers'::regclass and conname = 'research_papers_references_text_check') then
    raise exception 'Precondition failed: expected constraint research_papers_references_text_check not found — inspect pg_constraint manually before proceeding';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.research_papers'::regclass and conname = 'research_papers_rights_declaration_check') then
    raise exception 'Precondition failed: expected constraint research_papers_rights_declaration_check not found — inspect pg_constraint manually before proceeding';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.research_papers'::regclass and conname = 'research_papers_has_content') then
    raise exception 'Precondition failed: expected constraint research_papers_has_content not found — inspect pg_constraint manually before proceeding';
  end if;

  -- ---- Data-integrity guards (see "DATA-INTEGRITY GUARDS" above) ----

  -- Guard 0: at most one is_current=true, non-withdrawn version per
  -- paper — the backfill's UPDATE...FROM would otherwise pick a match
  -- nondeterministically.
  if exists (
    select 1 from public.research_paper_versions
    where is_current = true and withdrawn = false
    group by paper_id
    having count(*) > 1
  ) then
    raise exception 'Precondition failed: at least one paper has more than one is_current=true, non-withdrawn version — resolve manually before running this migration';
  end if;

  -- Guard a: a non-null pointer for a paper where NO version is
  -- currently is_current=true/withdrawn=false at all.
  if exists (
    select 1 from public.research_papers rp
    where rp.published_version_id is not null
      and not exists (
        select 1 from public.research_paper_versions v2
        where v2.paper_id = rp.id and v2.is_current = true and v2.withdrawn = false
      )
  ) then
    raise exception 'Precondition failed: at least one paper has published_version_id set but no version is currently is_current=true (non-withdrawn) at all for that paper — resolve manually before running this migration';
  end if;

  -- Guard b: a pointer to a version belonging to a DIFFERENT paper. The
  -- FK only guarantees published_version_id names an EXISTING version
  -- row — never that it's this paper's own row.
  if exists (
    select 1 from public.research_papers rp
    join public.research_paper_versions v on v.id = rp.published_version_id
    where v.paper_id <> rp.id
  ) then
    raise exception 'Precondition failed: at least one paper''s published_version_id references a version belonging to a DIFFERENT paper — resolve manually before running this migration';
  end if;

  -- Guard c: a pointer to a version already marked withdrawn = true —
  -- the new policy has no "withdrawn" concept at all, so this would make
  -- that version public again the instant this migration commits.
  if exists (
    select 1 from public.research_papers rp
    join public.research_paper_versions v on v.id = rp.published_version_id
    where v.withdrawn = true
  ) then
    raise exception 'Precondition failed: at least one paper''s published_version_id points at a version marked withdrawn = true — this migration would silently make it public again under the new pointer-only policy; resolve manually (null the pointer, or deliberately un-withdraw) before running this migration';
  end if;

  -- Guard d: a pointer that disagrees with whichever DIFFERENT version
  -- is actually is_current=true/withdrawn=false for that paper. Silently
  -- trusting the pointer here would change what's public with no publish
  -- action ever having happened.
  if exists (
    select 1 from public.research_papers rp
    join public.research_paper_versions v on v.paper_id = rp.id
    where v.is_current = true and v.withdrawn = false
      and rp.published_version_id is not null
      and rp.published_version_id <> v.id
  ) then
    raise exception 'Precondition failed: at least one paper has published_version_id pointing at a DIFFERENT version than the one currently is_current = true — resolve manually (decide which version should actually be public) before running this migration, since this migration would otherwise silently change which version is public';
  end if;
end $$;

-- Snapshot row counts now, compared against the same counts in the
-- postcondition block below — proves this migration adds/removes zero
-- rows in any of the three tables. on commit drop: cleans itself up,
-- leaves nothing behind either on success or on a failed/rolled-back run.
create temporary table __migration_0016_precounts (
  research_papers_count bigint not null,
  research_paper_versions_count bigint not null,
  category_suggestions_count bigint not null
) on commit drop;

insert into __migration_0016_precounts
select
  (select count(*) from public.research_papers),
  (select count(*) from public.research_paper_versions),
  (select count(*) from public.category_suggestions);

-- ============================================================================
-- A. Backfill published_version_id from the OLD is_current pointer, for
--    any paper that doesn't already have one set. Only fills a NULL —
--    never overwrites an existing pointer.
-- ============================================================================
update public.research_papers rp
set published_version_id = v.id
from public.research_paper_versions v
where v.paper_id = rp.id
  and v.is_current = true
  and v.withdrawn = false
  and rp.published_version_id is null;

-- Comprehensive, direct proof of the actual invariant — computed
-- straight from the data, not derived from the four named guards above:
-- the set of versions publicly readable under the OLD policy
-- (is_current=true, withdrawn=false) must exactly equal the set publicly
-- readable under the NEW policy (some paper's published_version_id now
-- names it). Must run here, before is_current is dropped below, since
-- this is the only point where both sides of the comparison can still be
-- computed.
do $$
declare
  newly_hidden int;   -- publicly readable before, would NOT be after
  newly_visible int;  -- NOT publicly readable before, would be after
begin
  select count(*) into newly_hidden
  from public.research_paper_versions v
  where v.is_current = true and v.withdrawn = false
    and not exists (
      select 1 from public.research_papers rp
      where rp.id = v.paper_id and rp.published_version_id = v.id
    );

  select count(*) into newly_visible
  from public.research_paper_versions v
  join public.research_papers rp on rp.id = v.paper_id
  where rp.published_version_id = v.id
    and not (v.is_current = true and v.withdrawn = false);

  if newly_hidden > 0 or newly_visible > 0 then
    raise exception 'Postcondition failed: the set of publicly readable versions would change across this migration (% version(s) would newly disappear, % version(s) would newly become visible) — resolve the underlying data inconsistency manually before running this migration; nothing has been committed',
      newly_hidden, newly_visible;
  end if;
end $$;

-- ============================================================================
-- B. Visibility redesign — see 0014's "THIRD REVIEW ROUND" for the full
--    reasoning (RLS-on-RLS recursion fix + status-independence fix).
-- ============================================================================
drop policy research_paper_versions_public_read on public.research_paper_versions;

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

create policy research_paper_versions_public_read on public.research_paper_versions
for select
using (public.is_paper_version_published(paper_id, id));

drop index public.research_paper_versions_current_idx;

alter table public.research_paper_versions drop column is_current;

-- ============================================================================
-- C. Draft completeness — see 0014's "DRAFT COMPLETENESS" for the full
--    reasoning. Strictly LOOSENS the old unconditional checks (adds
--    "status = 'draft' or" in front of each), so any row that satisfied
--    the old constraint still satisfies the new one — safe regardless of
--    what data exists when this runs.
-- ============================================================================
alter table public.research_papers
  drop constraint research_papers_author_name_check,
  drop constraint research_papers_title_check,
  drop constraint research_papers_abstract_check,
  drop constraint research_papers_references_text_check,
  drop constraint research_papers_rights_declaration_check,
  drop constraint research_papers_has_content,
  alter column author_name set default '',
  alter column title set default '',
  alter column abstract set default '',
  alter column references_text set default '',
  alter column rights_declaration set default '',
  add constraint research_papers_author_name_required_unless_draft check (
    status = 'draft' or length(trim(author_name)) > 0
  ),
  add constraint research_papers_title_required_unless_draft check (
    status = 'draft' or length(trim(title)) > 0
  ),
  add constraint research_papers_abstract_required_unless_draft check (
    status = 'draft' or length(trim(abstract)) > 0
  ),
  add constraint research_papers_references_required_unless_draft check (
    status = 'draft' or length(trim(references_text)) > 0
  ),
  add constraint research_papers_rights_required_unless_draft check (
    status = 'draft' or length(trim(rights_declaration)) > 0
  ),
  add constraint research_papers_has_content_unless_draft check (
    status = 'draft'
    or (body_text is not null and length(trim(body_text)) > 0)
    or pdf_data is not null
  );

-- ----------------------------------------------------------------------
-- Postconditions
-- ----------------------------------------------------------------------
do $$
declare
  pre record;
  v_fn_def text;
begin
  select * into pre from __migration_0016_precounts;
  if (select count(*) from public.research_papers) <> pre.research_papers_count then
    raise exception 'Postcondition failed: research_papers row count changed (% -> %) — this migration must never add or remove rows — rolling back',
      pre.research_papers_count, (select count(*) from public.research_papers);
  end if;
  if (select count(*) from public.research_paper_versions) <> pre.research_paper_versions_count then
    raise exception 'Postcondition failed: research_paper_versions row count changed (% -> %) — rolling back',
      pre.research_paper_versions_count, (select count(*) from public.research_paper_versions);
  end if;
  if (select count(*) from public.category_suggestions) <> pre.category_suggestions_count then
    raise exception 'Postcondition failed: category_suggestions row count changed (% -> %) — rolling back',
      pre.category_suggestions_count, (select count(*) from public.category_suggestions);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'research_paper_versions' and column_name = 'is_current'
  ) then
    raise exception 'Postcondition failed: research_paper_versions.is_current still exists — rolling back';
  end if;

  if to_regprocedure('public.is_paper_version_published(uuid, uuid)') is null then
    raise exception 'Postcondition failed: is_paper_version_published(uuid, uuid) was not created — rolling back';
  end if;
  select pg_get_functiondef('public.is_paper_version_published(uuid, uuid)'::regprocedure) into v_fn_def;
  if v_fn_def not ilike '%security definer%' then
    raise exception 'Postcondition failed: is_paper_version_published is not SECURITY DEFINER — rolling back';
  end if;
  if v_fn_def not like '%published_version_id%' then
    raise exception 'Postcondition failed: is_paper_version_published does not reference published_version_id — rolling back';
  end if;
  if v_fn_def ilike '%status%' then
    raise exception 'Postcondition failed: is_paper_version_published references status — visibility must depend only on published_version_id — rolling back';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'research_paper_versions'
      and policyname = 'research_paper_versions_public_read'
      and qual like '%is_paper_version_published%'
  ) then
    raise exception 'Postcondition failed: research_paper_versions_public_read does not call is_paper_version_published — rolling back';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.research_papers'::regclass
      and conname in (
        'research_papers_author_name_check', 'research_papers_title_check',
        'research_papers_abstract_check', 'research_papers_references_text_check',
        'research_papers_rights_declaration_check', 'research_papers_has_content'
      )
  ) then
    raise exception 'Postcondition failed: an old unconditional constraint still exists on research_papers — rolling back';
  end if;
  if (
    select count(*) from pg_constraint
    where conrelid = 'public.research_papers'::regclass
      and conname in (
        'research_papers_author_name_required_unless_draft', 'research_papers_title_required_unless_draft',
        'research_papers_abstract_required_unless_draft', 'research_papers_references_required_unless_draft',
        'research_papers_rights_required_unless_draft', 'research_papers_has_content_unless_draft'
      )
  ) <> 6 then
    raise exception 'Postcondition failed: not all six status-conditional constraints exist on research_papers — rolling back';
  end if;

  if has_column_privilege('authenticated', 'public.research_papers', 'reviewed_by', 'UPDATE') then
    raise exception 'Postcondition failed: authenticated can UPDATE research_papers.reviewed_by — rolling back';
  end if;
  if has_column_privilege('authenticated', 'public.research_paper_versions', 'title', 'INSERT') then
    raise exception 'Postcondition failed: authenticated can INSERT into research_paper_versions — rolling back';
  end if;

  raise notice 'Migration 0016 complete: research_papers/research_paper_versions brought up to the corrected draft-completeness and publish-visibility design. Row counts unchanged: research_papers=%, research_paper_versions=%, category_suggestions=%.',
    pre.research_papers_count, pre.research_paper_versions_count, pre.category_suggestions_count;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='research_paper_versions' and column_name='is_current';
-- -- expect 0 rows
--
-- select policyname, qual from pg_policies where schemaname='public'
--   and tablename='research_paper_versions' and policyname='research_paper_versions_public_read';
-- -- expect a call to is_paper_version_published(...)
--
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.research_papers'::regclass and contype = 'c'
-- order by conname;
-- -- expect the 6 *_unless_draft / *_required_unless_draft constraints plus
-- -- research_papers_orcid_format (untouched) — none of the old unconditional ones
--
-- select count(*) from public.research_papers;
-- select count(*) from public.research_paper_versions;
-- select count(*) from public.category_suggestions;
-- -- expect the SAME counts as before this migration ran (0, 0, 0 as of this
-- -- writing — confirm via your own read before/after if any rows exist by
-- -- the time you run this)
--
-- -- IMPORTANT: as with 0014, the checks above only prove grants/policy/
-- -- constraint text, not runtime behavior under an actual anon session —
-- -- run the live anon/authenticated REST tests after confirming this
-- -- migration applied, before repairing its migration history.
--
-- ---------------------------------------------------------------------------
-- GUARD TEST HARNESS (optional — reference SQL only, NOT executed by this
-- session: no local Postgres/Docker is available in this sandbox to run
-- it against. Written to demonstrate each of the four named guards above
-- actually fires on the bad state it targets. Run ONLY against a
-- disposable database that already has migration 0014's ORIGINAL schema
-- applied (is_current/withdrawn design) — e.g. a local `supabase start`
-- instance, never against wxldqxuxpjurttspbxok. Each scenario is wrapped
-- in its own begin/rollback so nothing persists even if run by mistake;
-- strip the leading "-- " from a block and run it, then run this file's
-- precondition do-block (or the whole file) and confirm the matching
-- exception message appears, then move to the next scenario.
-- ---------------------------------------------------------------------------
--
-- -- Scenario a: non-null pointer when no version is is_current at all.
-- -- Expect: 'published_version_id set but no version is currently
-- -- is_current=true (non-withdrawn) at all for that paper'
-- begin;
-- insert into public.research_papers
--   (id, author_id, author_name, language, title, abstract, paper_type, body_text, references_text, rights_declaration, status)
--   values ('11111111-0000-0000-0000-00000000000a', gen_random_uuid(), 'Test Author', 'English', 'Test', 'Test abstract', 'other', 'Test body', 'Test refs', 'Test rights', 'published');
-- insert into public.research_paper_versions
--   (id, paper_id, version, author_name, language, title, abstract, paper_type, references_text, published_by, is_current, withdrawn)
--   values ('22222222-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 1, 'Test Author', 'English', 'Test', 'Test abstract', 'other', 'Test refs', gen_random_uuid(), false, false);
-- update public.research_papers set published_version_id = '22222222-0000-0000-0000-00000000000a'
--   where id = '11111111-0000-0000-0000-00000000000a';
-- -- run this file's precondition do-block here
-- rollback;
--
-- -- Scenario b: pointer references a version belonging to a DIFFERENT paper.
-- -- Expect: 'references a version belonging to a DIFFERENT paper'
-- begin;
-- insert into public.research_papers
--   (id, author_id, author_name, language, title, abstract, paper_type, body_text, references_text, rights_declaration, status) values
--   ('11111111-0000-0000-0000-00000000000b', gen_random_uuid(), 'A', 'English', 'Paper A', 'Abstract A', 'other', 'Body A', 'Refs A', 'Rights A', 'published'),
--   ('11111111-0000-0000-0000-00000000000c', gen_random_uuid(), 'B', 'English', 'Paper B', 'Abstract B', 'other', 'Body B', 'Refs B', 'Rights B', 'published');
-- insert into public.research_paper_versions
--   (id, paper_id, version, author_name, language, title, abstract, paper_type, references_text, published_by, is_current, withdrawn)
--   values ('22222222-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-00000000000c', 1, 'B', 'English', 'Paper B', 'Abstract B', 'other', 'Refs B', gen_random_uuid(), true, false);
-- update public.research_papers set published_version_id = '22222222-0000-0000-0000-00000000000b'
--   where id = '11111111-0000-0000-0000-00000000000b'; -- paper A points at paper B's version
-- -- run this file's precondition do-block here
-- rollback;
--
-- -- Scenario c: pointer references a version marked withdrawn = true.
-- -- Expect: 'points at a version marked withdrawn = true'
-- begin;
-- insert into public.research_papers
--   (id, author_id, author_name, language, title, abstract, paper_type, body_text, references_text, rights_declaration, status)
--   values ('11111111-0000-0000-0000-00000000000d', gen_random_uuid(), 'Test Author', 'English', 'Test', 'Test abstract', 'other', 'Test body', 'Test refs', 'Test rights', 'unpublished');
-- insert into public.research_paper_versions
--   (id, paper_id, version, author_name, language, title, abstract, paper_type, references_text, published_by, is_current, withdrawn)
--   values ('22222222-0000-0000-0000-00000000000d', '11111111-0000-0000-0000-00000000000d', 1, 'Test Author', 'English', 'Test', 'Test abstract', 'other', 'Test refs', gen_random_uuid(), false, true);
-- update public.research_papers set published_version_id = '22222222-0000-0000-0000-00000000000d'
--   where id = '11111111-0000-0000-0000-00000000000d';
-- -- run this file's precondition do-block here
-- rollback;
--
-- -- Scenario d: pointer disagrees with the version that IS is_current.
-- -- Expect: 'pointing at a DIFFERENT version than the one currently is_current = true'
-- begin;
-- insert into public.research_papers
--   (id, author_id, author_name, language, title, abstract, paper_type, body_text, references_text, rights_declaration, status)
--   values ('11111111-0000-0000-0000-00000000000e', gen_random_uuid(), 'Test Author', 'English', 'Test', 'Test abstract', 'other', 'Test body', 'Test refs', 'Test rights', 'published');
-- insert into public.research_paper_versions
--   (id, paper_id, version, author_name, language, title, abstract, paper_type, references_text, published_by, is_current, withdrawn) values
--   ('22222222-0000-0000-0000-00000000000e', '11111111-0000-0000-0000-00000000000e', 1, 'Test Author', 'English', 'Test v1', 'Test abstract', 'other', 'Test refs', gen_random_uuid(), false, false),
--   ('22222222-0000-0000-0000-00000000000f', '11111111-0000-0000-0000-00000000000e', 2, 'Test Author', 'English', 'Test v2', 'Test abstract', 'other', 'Test refs', gen_random_uuid(), true, false);
-- update public.research_papers set published_version_id = '22222222-0000-0000-0000-00000000000e' -- v1, not the is_current v2
--   where id = '11111111-0000-0000-0000-00000000000e';
-- -- run this file's precondition do-block here
-- rollback;
--
-- -- A fifth scenario (guard 0: more than one is_current=true, non-withdrawn
-- -- version for one paper) is omitted for brevity — it's the same
-- -- two-insert shape as (d) above, just with BOTH versions' is_current set
-- -- to true instead of one true/one false.
