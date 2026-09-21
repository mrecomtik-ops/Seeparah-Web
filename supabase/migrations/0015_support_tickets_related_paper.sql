-- Seeparah — let a support ticket reference a research paper, the same way
-- one can already reference a book (related_book_id) or a translation job
-- (related_job_id, migration 0006). Needed for the Literature Research
-- "report a problem" route: src/lib/research.functions.ts's
-- reportResearchPaperProblem writes into this same support_tickets queue
-- (via src/lib/admin/support.server.ts's createTicket, extended with
-- relatedPaperId in this commit) so it shows up in the existing admin
-- support UI — no separate, unreviewed reports table.
--
-- No cascade: exactly like related_book_id/related_job_id, a report must
-- survive the paper it describes being withdrawn or permanently affected —
-- a moderation/audit record, not paper metadata. `on delete set null`
-- (default when unspecified, matching related_book_id/related_job_id's own
-- unspecified-cascade style in migration 0006) means the ticket stays,
-- only the link is cleared, if a paper row is ever actually deleted.

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
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_tickets' and column_name = 'related_paper_id'
  ) then
    raise exception 'Postcondition failed: related_paper_id was not added — rolling back';
  end if;
  raise notice 'Migration 0015 complete: support_tickets.related_paper_id added.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='support_tickets' and column_name='related_paper_id';
-- -- expect 1 row, data_type uuid
