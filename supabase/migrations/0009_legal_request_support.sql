-- Seeparah — extend support_tickets to also carry copyright notices/
-- counter-notices and the new general-support/complaint request taxonomy,
-- for the Privacy/Terms/Copyright/Support rework.
--
-- WHY EXTEND support_tickets RATHER THAN A NEW TABLE: its RLS already does
-- exactly what a legal-request table would need — owner-read-own
-- (support_tickets_owner_read), staff-read-all via is_admin() (owner/
-- administrator/support — support_tickets_staff_read), and NO write policy
-- for any client role at all (every existing write goes through the
-- service-role client only, in src/lib/admin/support.server.ts). A new
-- table would duplicate all of that for no benefit, and would need its own
-- admin UI instead of reusing the existing /admin/support area. The
-- copyright form's structured fields (claimant, organization, work
-- identification, ownership explanation, good-faith statement, accuracy
-- declaration, signature) go in a new `structured_data jsonb` column
-- rather than into `description` — the whole point of this migration is
-- NOT stuffing structured legal fields into an unstructured message.
--
-- Additive and backward compatible: every existing row gets
-- request_kind='ticket' (its actual kind), structured_data=null,
-- notification_status='not_applicable' (no email pipeline existed when
-- those rows were created), and the existing 6 category values keep their
-- exact current meaning — nothing here changes them.

alter table public.support_tickets
  add column if not exists request_kind text not null default 'ticket'
    check (request_kind in ('ticket', 'copyright_notice', 'copyright_counter_notice')),
  add column if not exists reference_code text,
  add column if not exists structured_data jsonb,
  add column if not exists notification_status text not null default 'not_applicable'
    check (notification_status in ('pending', 'sent', 'failed', 'not_applicable'));

-- New rows created going forward should get a real 'pending' default for
-- notification_status (existing historical rows correctly stay
-- 'not_applicable' — set explicitly above, not touched by this).
alter table public.support_tickets
  alter column notification_status set default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_category_check') then
    raise exception 'Precondition failed: expected the original support_tickets_category_check constraint from migration 0006 to still exist under that name — aborting rather than guess';
  end if;
  alter table public.support_tickets drop constraint support_tickets_category_check;
  alter table public.support_tickets
    add constraint support_tickets_category_check
    check (category in (
      -- Original 6 (migration 0006) — unchanged meaning.
      'account', 'book', 'upload', 'translation_job', 'sign_in', 'other',
      -- New, from the general support/complaint form's request-type list.
      'general_support', 'reading_progress', 'manuscript_publication',
      'translation_request', 'complaint', 'safety_abuse', 'privacy_request',
      'accessibility'
    ));
end $$;

-- Reference codes are shown to visitors as their tracking number and must
-- never collide; enforced at the database level, not just by the
-- generator's low collision probability. Partial (nulls allowed) since
-- historical rows never had one.
create unique index if not exists support_tickets_reference_code_unique
  on public.support_tickets (reference_code) where reference_code is not null;

create index if not exists support_tickets_request_kind_idx
  on public.support_tickets (request_kind, created_at desc);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_tickets' and column_name = 'request_kind'
  ) then
    raise exception 'Postcondition failed: request_kind was not added';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_tickets' and column_name = 'structured_data'
  ) then
    raise exception 'Postcondition failed: structured_data was not added';
  end if;
  if not exists (
    select 1 from pg_indexes
    where tablename = 'support_tickets' and indexname = 'support_tickets_reference_code_unique'
  ) then
    raise exception 'Postcondition failed: reference_code unique index was not created';
  end if;
  raise notice 'support_tickets extended: request_kind, reference_code, structured_data, notification_status; category check widened.';
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select column_name, data_type, column_default from information_schema.columns
-- where table_schema='public' and table_name='support_tickets'
--   and column_name in ('request_kind','reference_code','structured_data','notification_status')
-- order by column_name;
-- -- expect 4 rows
--
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.support_tickets'::regclass and contype = 'c';
-- -- expect support_tickets_category_check to list all 14 values,
-- -- support_tickets_identity_check and request_kind's own check unchanged/present
--
-- select tablename, policyname from pg_policies
-- where schemaname='public' and tablename='support_tickets';
-- -- expect the SAME 2 policies as before (support_tickets_owner_read,
-- -- support_tickets_staff_read) — this migration adds no new policy and
-- -- removes none; RLS coverage is unchanged by design.
