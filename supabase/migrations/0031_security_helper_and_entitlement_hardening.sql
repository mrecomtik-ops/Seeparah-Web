-- Final launch hardening for billing entitlements and SECURITY DEFINER
-- helpers. Forward-only migration after 0030.

begin;

-- A reader must never be able to use this helper as an arbitrary
-- "does user X subscribe?" oracle. It remains callable by the database
-- owner from book_chunk_readable(), but direct browser roles lose EXECUTE.
create or replace function public.has_active_plan_subscription(p_user_id uuid)
returns boolean
language sql
security definer
set search_path=public
stable
as $$
  select
    auth.uid() is not null
    and p_user_id = auth.uid()
    and exists (
      select 1
      from public.user_subscriptions
      where user_id = auth.uid()
        and status = 'active'
        and (expires_at is null or expires_at > now())
    );
$$;

revoke all on function public.has_active_plan_subscription(uuid)
  from public, anon, authenticated;
grant execute on function public.has_active_plan_subscription(uuid)
  to service_role;

-- book_chunk_readable is intentionally executable by browser roles because
-- it is the RLS predicate for book_chunks. Harden direct RPC calls so an
-- unpublished book cannot be probed by UUID/language.
create or replace function public.book_chunk_readable(
  p_book_id uuid,
  p_language text,
  p_chunk_index integer
)
returns boolean
language plpgsql
security definer
set search_path=public
stable
as $$
declare
  v_book record;
  v_edition_access text;
begin
  select status, author_id, source_language, content_classification
    into v_book
  from public.books
  where id=p_book_id;

  if v_book is null then
    return false;
  end if;

  if v_book.status <> 'published'
     and not (
       auth.uid() is not null
       and v_book.author_id = auth.uid()
     )
     and not public.is_admin(array['owner','administrator','editor'])
  then
    return false;
  end if;

  if p_language = v_book.source_language then
    return true;
  end if;

  select access_type into v_edition_access
  from public.book_editions
  where book_id=p_book_id and language=p_language;

  if v_edition_access is null then
    return false;
  end if;

  if v_book.content_classification='religious' then
    return true;
  end if;

  if p_chunk_index=0 then
    return true;
  end if;

  return v_edition_access <> 'paid'
    or not public.is_monetization_enabled()
    or public.has_active_plan_subscription(auth.uid());
end;
$$;

revoke all on function public.book_chunk_readable(uuid,text,integer) from public;
grant execute on function public.book_chunk_readable(uuid,text,integer)
  to anon, authenticated, service_role;

-- These helpers are only nested inside SECURITY DEFINER policy helpers.
-- Browser roles do not need to invoke them as standalone RPC endpoints.
revoke all on function public.current_admin_role()
  from public, anon, authenticated;
grant execute on function public.current_admin_role() to service_role;

revoke all on function public.is_monetization_enabled()
  from public, anon, authenticated;
grant execute on function public.is_monetization_enabled() to service_role;

-- Trigger/event-trigger functions should never be user-callable RPCs.
revoke all on function public.prevent_last_owner_removal()
  from public, anon, authenticated, service_role;
revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

-- Billing entitlements are webhook/server-owned. Preserve authenticated
-- SELECT for "my subscription" UI, but remove every browser write route.
revoke insert, update, delete, truncate
  on table public.user_subscriptions
  from anon, authenticated;
revoke select on table public.user_subscriptions from anon;

-- Other translation/config tables are server-owned for mutations. Keep the
-- existing authenticated SELECT paths where author/admin RLS allows them,
-- but remove broad write privileges that are unnecessary.
revoke insert, update, delete, truncate
  on table public.book_editions
  from anon, authenticated;
revoke insert, update, delete, truncate
  on table public.book_translation_jobs
  from anon, authenticated;
revoke insert, update, delete, truncate
  on table public.book_translation_sections
  from anon, authenticated;
revoke insert, update, delete, truncate
  on table public.content_settings
  from anon, authenticated;

-- Translation requests require an authenticated requester. Anonymous users
-- do not need table privileges at all; authenticated INSERT/SELECT remains
-- governed by the hardened RLS policies from 0026.
revoke all on table public.translation_requests from anon;
revoke update, delete, truncate on table public.translation_requests
  from authenticated;

commit;
