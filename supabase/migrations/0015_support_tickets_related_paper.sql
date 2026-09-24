-- Seeparah — let a support ticket reference a research paper, the same way
-- one can already reference a book (related_book_id) or a translation job
-- (related_job_id, migration 0006). Needed for the Literature Research
-- "report a problem" route: src/lib/research.functions.ts's
-- reportResearchPaperProblem writes into this same support_tickets queue
-- (via src/lib/admin/support.server.ts's createTicket, extended with
-- relatedPaperId in this commit) so it shows up in the existing admin
-- support UI — no separate, unreviewed reports table.
--
-- No cascade: a report must survive the paper it describes being withdrawn
-- or permanently affected — a moderation/audit record, not paper metadata.
--
-- CORRECTION (caught during review, verified live against
-- wxldqxuxpjurttspbxok before writing this note — not assumed): the
-- original version of this comment claimed `on delete set null` was "the
-- default when unspecified, matching related_book_id/related_job_id's own
-- style." That's wrong on two counts. First, Postgres's actual default
-- for a bare `references` with no ON DELETE clause is NO ACTION, not SET
-- NULL — it BLOCKS deleting the referenced row entirely unless the
-- reference is cleared first. Second, that block is real, not
-- theoretical: `related_book_id` has exactly this bare, no-ON-DELETE
-- shape, and a live test confirmed deleting a book with a ticket still
-- pointing at it raises `violates foreign key constraint
-- support_tickets_related_book_id_fkey` — which is exactly why
-- deleteBookPermanently (src/lib/admin/catalog.server.ts) explicitly
-- nulls out related_book_id before deleting the book; that null-out is
-- required, not defensive belt-and-suspenders.
--
-- `related_paper_id` below is deliberately given an EXPLICIT
-- `on delete set null` instead — a genuine, intentional difference from
-- related_book_id/related_job_id, not a copy of their behavior. This is
-- arguably the better default for a table with no permanent-delete
-- feature yet (research papers don't have one today): if one is added
-- later, a ticket reference clears itself automatically instead of
-- silently blocking deletion the way related_book_id does until a caller
-- remembers to null it out first. The postcondition below asserts this
-- delete rule directly, so this file stays self-verifying rather than
-- relying on a comment being read and trusted.

begin;

do $$
begin
  if to_regclass('public.support_tickets') is null then
    raise exception 'Precondition failed: public.support_tickets does not exist — aborting';
  end if;
  if to_regclass('public.research_papers') is null then
    raise exception 'Precondition failed: public.research_papers does not exist — apply 0014 first';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_tickets' and column_name = 'related_paper_id'
  ) then
    raise exception 'Precondition failed: support_tickets.related_paper_id already exists — aborting rather than assume this file''s reasoning still matches live state';
  end if;
end $$;

alter table public.support_tickets
  add column related_paper_id uuid references public.research_papers (id) on delete set null;

do $$
declare
  v_delete_rule text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_tickets' and column_name = 'related_paper_id'
  ) then
    raise exception 'Postcondition failed: related_paper_id was not added — rolling back';
  end if;
  -- Confirms the delete rule is actually SET NULL, not the NO ACTION a
  -- bare `references` would default to — see the correction note above.
  -- Self-verifying rather than trusting the comment matches the SQL.
  select rc.delete_rule into v_delete_rule
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name and kcu.constraint_schema = rc.constraint_schema
  where kcu.table_schema = 'public' and kcu.table_name = 'support_tickets'
    and kcu.column_name = 'related_paper_id';
  if v_delete_rule is distinct from 'SET NULL' then
    raise exception 'Postcondition failed: related_paper_id''s delete rule is %, expected SET NULL — rolling back', coalesce(v_delete_rule, 'NULL (no FK found)');
  end if;
  raise notice 'Migration 0015 complete: support_tickets.related_paper_id added with ON DELETE SET NULL.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='support_tickets' and column_name='related_paper_id';
-- -- expect 1 row, data_type uuid
--
-- select rc.delete_rule from information_schema.referential_constraints rc
-- join information_schema.key_column_usage kcu
--   on kcu.constraint_name = rc.constraint_name and kcu.constraint_schema = rc.constraint_schema
-- where kcu.table_schema = 'public' and kcu.table_name = 'support_tickets' and kcu.column_name = 'related_paper_id';
-- -- expect 'SET NULL'
--
-- -- For comparison, confirms related_book_id/related_job_id do NOT auto-null
-- -- (this is expected — do not "fix" it, deleteBookPermanently relies on it
-- -- being a real block that it works around explicitly):
-- select kcu.column_name, rc.delete_rule from information_schema.referential_constraints rc
-- join information_schema.key_column_usage kcu
--   on kcu.constraint_name = rc.constraint_name and kcu.constraint_schema = rc.constraint_schema
-- where kcu.table_schema = 'public' and kcu.table_name = 'support_tickets'
--   and kcu.column_name in ('related_book_id', 'related_job_id');
-- -- expect delete_rule = 'NO ACTION' for both
