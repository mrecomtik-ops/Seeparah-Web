-- Read-only inspection script. Does not modify anything. Run this in the
-- Supabase SQL editor (or `psql`/`supabase db query` with a connection that
-- has schema-introspection rights) against the project BEFORE applying any
-- of 0000-0007, and paste back the output of every query below — this is
-- policy/grant METADATA, not user data, and does not require sharing a
-- service-role key or any row content.
--
-- Why this is needed: the dynamic drop-and-recreate migrations (0000,
-- 0007) do not need to know existing policy names in advance, so applying
-- them is safe either way — but knowing what is actually there first lets
-- you confirm the migrations will remove what you expect, and surfaces
-- anything unexpected (e.g. a policy that also covers a use case not
-- accounted for here) before you run anything.

-- 1. Every policy on the tables this change touches or adds, with its full
--    definition (permissive/restrictive, command, using/with-check).
--    SPECIFIC OUTPUT NEEDED: for `books` and `book_chunks`, the `cmd`
--    column of every row returned — if any row shows `cmd = 'ALL'`, that
--    is a `FOR ALL` policy, which applies to SELECT/INSERT/UPDATE/DELETE
--    together. The hotfix migrations (0000, 0007) drop every policy on
--    these two tables regardless of `cmd` before recreating them, so they
--    do not depend on this answer to work — but if a `FOR ALL` policy
--    shows up here, its `qual`/`with_check` text is worth reading before
--    applying, since it's the thing actually being replaced.
select
  schemaname, tablename, policyname, permissive, roles, cmd,
  qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'books', 'book_chunks', 'book_shelves', 'reading_progress',
    'user_subscriptions', 'author_profiles', 'book_highlights',
    'book_translation_jobs', 'book_translation_sections',
    'book_translation_guides', 'translation_reports',
    'translation_requests', 'admin_users', 'audit_log',
    'admin_action_events', 'content_settings', 'content_settings_history',
    'support_tickets', 'support_ticket_notes', 'support_report_rate_limit',
    'error_events'
  )
order by tablename, cmd, policyname;

-- 2. Is RLS actually enabled (and FORCEd, which matters for table owners)
--    on each of those tables? A table with rls disabled ignores every
--    policy above entirely.
select
  n.nspname as schema, c.relname as table,
  c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'books', 'book_chunks', 'book_shelves', 'reading_progress',
    'user_subscriptions', 'author_profiles', 'book_highlights',
    'book_translation_jobs', 'book_translation_sections',
    'book_translation_guides', 'translation_reports',
    'translation_requests', 'admin_users', 'audit_log',
    'admin_action_events', 'content_settings', 'content_settings_history',
    'support_tickets', 'support_ticket_notes', 'support_report_rate_limit',
    'error_events'
  )
order by c.relname;

-- 3. Table-level GRANTs to anon/authenticated/service_role — RLS policies
--    only ever narrow what a role can already do at the grant level; if
--    anon has no UPDATE grant at all on a table, no policy can grant it
--    back, and vice versa a broad grant plus a missing/permissive policy
--    is what actually causes exposure.
select
  table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
  and table_name in (
    'books', 'book_chunks', 'translation_requests', 'admin_users',
    'audit_log', 'admin_action_events'
  )
order by table_name, grantee, privilege_type;

-- 4. Any VIEW in the public schema — views bypass the base table's RLS
--    under their own separate rules (security_invoker vs security_definer
--    view semantics), so an old view over `books`/`book_chunks` could leak
--    data even after the base table's policies are correct.
select table_name, view_definition
from information_schema.views
where table_schema = 'public';

-- 5. Every SECURITY DEFINER function in public — these run with the
--    privileges of whoever created them (usually the table owner/postgres),
--    not the caller, so a callable one with a missing permission check is
--    equivalent to a service-role hole reachable by an ordinary user via
--    `rpc()`. Confirm the only ones present are is_admin/current_admin_role/
--    prevent_last_owner_removal/check_book_publish_gate (all in 0004/0005,
--    all narrowly scoped) — and check `acl` for who may EXECUTE each.
select
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition,
  (
    select array_agg(distinct grantee::text)
    from information_schema.role_routine_grants g
    where g.specific_schema = 'public' and g.routine_name = p.proname
  ) as execute_grantees
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;

-- 6. Column-level grants — rarer, but if anon/authenticated ever received a
--    column-specific privilege (as opposed to whole-table), it wouldn't
--    show up in query 3.
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in ('books', 'book_chunks')
order by table_name, column_name, grantee;
