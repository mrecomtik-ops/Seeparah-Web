-- Fail closed when the monetization setting cannot be resolved.
-- Production launch remains free because content_settings explicitly stores
-- monetization_enabled=false. Only a missing/invalid row falls back to true,
-- preventing paid translated editions from becoming free due to config loss.
-- Forward-only migration after 0034.

begin;

create or replace function public.is_monetization_enabled()
returns boolean
language sql
security definer
set search_path=public
stable
as $$
  select coalesce(
    (
      select case
        when jsonb_typeof(value)='boolean' then (value = 'true'::jsonb)
        else null
      end
      from public.content_settings
      where key='monetization_enabled'
    ),
    true
  );
$$;

revoke all on function public.is_monetization_enabled()
  from public, anon, authenticated;
grant execute on function public.is_monetization_enabled()
  to service_role;

commit;
