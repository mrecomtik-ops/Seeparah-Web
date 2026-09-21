-- Seeparah — track outbound-email delivery status on support_ticket_notes,
-- for the admin "Reply to requester" action.
--
-- WHY ON support_ticket_notes, NOT A NEW TABLE: a reply-to-requester IS a
-- public note (visibility='public' already means "visible to the
-- requester" per the existing admin UI's own labeling) that additionally
-- triggers a real outbound email; the only new fact to record is whether
-- that email delivery succeeded. No RLS change needed — this table's
-- existing policies (support_ticket_notes_owner_read_public,
-- support_ticket_notes_staff_read) already cover exactly who should see
-- these rows, and there was never a client write policy at all (every
-- write already goes through the service-role client in
-- src/lib/admin/support.server.ts), so "only authorized admin roles can
-- send" continues to be enforced the same way it already is for every
-- other admin mutation: requireAdmin() at the server-function layer, not
-- by a new RLS policy.
--
-- Additive and backward compatible: every existing note gets
-- delivery_status='not_applicable' (it was never an email-send attempt —
-- the reply-email feature didn't exist yet when those rows were created).
-- New rows default to 'pending' going forward so the actual send path
-- always sets it explicitly to 'sent' or 'failed' immediately after.

alter table public.support_ticket_notes
  add column if not exists delivery_status text not null default 'not_applicable'
    check (delivery_status in ('sent', 'failed', 'not_applicable'));

alter table public.support_ticket_notes
  alter column delivery_status set default 'pending';

do $$
begin
  -- 'pending' wasn't in the original check list above (existing rows are
  -- correctly 'not_applicable', not 'pending') — widen the constraint to
  -- also allow it now that new rows can transiently be created with it
  -- before the send attempt completes and updates it.
  if exists (select 1 from pg_constraint where conname = 'support_ticket_notes_delivery_status_check') then
    alter table public.support_ticket_notes drop constraint support_ticket_notes_delivery_status_check;
  end if;
  alter table public.support_ticket_notes
    add constraint support_ticket_notes_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'failed', 'not_applicable'));
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_ticket_notes' and column_name = 'delivery_status'
  ) then
    raise exception 'Postcondition failed: delivery_status was not added';
  end if;
  raise notice 'support_ticket_notes.delivery_status added (pending/sent/failed/not_applicable).';
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select column_name, data_type, column_default from information_schema.columns
-- where table_schema='public' and table_name='support_ticket_notes' and column_name='delivery_status';
-- -- expect 1 row, default 'pending'
--
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.support_ticket_notes'::regclass and contype = 'c';
-- -- expect support_ticket_notes_delivery_status_check listing all 4 values
--
-- select tablename, policyname from pg_policies
-- where schemaname='public' and tablename='support_ticket_notes';
-- -- expect the SAME 2 policies as before — this migration adds no policy
