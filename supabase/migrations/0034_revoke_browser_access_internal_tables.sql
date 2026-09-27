-- Internal tables with RLS enabled and no browser policies should not
-- retain default browser-role table privileges. They are accessed only from
-- trusted server/service-role code or SECURITY DEFINER helpers.
-- Forward-only migration after 0033.

begin;

revoke all on table public.admin_action_events
  from anon, authenticated;

revoke all on table public.book_editions
  from anon, authenticated;

revoke all on table public.book_structure_nodes
  from anon, authenticated;

revoke all on table public.support_report_rate_limit
  from anon, authenticated;

commit;
