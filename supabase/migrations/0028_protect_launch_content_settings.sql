-- Protect launch-critical content settings at the database boundary.
-- Forward-only migration after 0027.
--
-- These constraints intentionally fail closed while production billing is
-- not connected. A future billing-integration migration must explicitly
-- replace the monetization guard after recurring billing + webhook
-- verification is complete.

begin;

create or replace function public.protect_launch_content_settings()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.key='categories' then
    if jsonb_typeof(new.value) <> 'array'
       or not (new.value @> '["Religious"]'::jsonb)
    then
      raise exception 'Protected setting: categories must contain Religious';
    end if;
  end if;

  if new.key='monetization_enabled' and new.value='true'::jsonb then
    raise exception 'Protected setting: monetization cannot be enabled until the production billing integration is deployed and this database guard is explicitly replaced';
  end if;

  return new;
end;
$$;

drop trigger if exists content_settings_launch_guard on public.content_settings;
create trigger content_settings_launch_guard
  before insert or update of key,value on public.content_settings
  for each row execute function public.protect_launch_content_settings();

revoke all on function public.protect_launch_content_settings() from public, anon, authenticated;

commit;
