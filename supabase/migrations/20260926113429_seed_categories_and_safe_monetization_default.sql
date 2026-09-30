-- Seed Seeparah's reader-facing category taxonomy and make Religious a
-- permanent first-class category. Preserve any categories an operator has
-- already configured; only append missing defaults.

begin;

do $$
declare
  v_value jsonb;
  v_version integer;
  v_defaults text[] := array[
    'Religious','Classics','Literary Fiction','Romance','Adventure','Poetry',
    'History','Philosophy','Biography & Memoir','Science & Nature',
    'Business & Economics','Self-Development','Children & Young Readers'
  ];
  v_item text;
begin
  select value, version into v_value, v_version
  from public.content_settings
  where key='categories'
  for update;

  if not found then
    v_value := to_jsonb(v_defaults);
    v_version := 1;
    insert into public.content_settings(key,value,is_public,version,updated_by,updated_at)
    values ('categories',v_value,true,v_version,null,now());

    insert into public.content_settings_history(key,value,version,action,updated_by)
    values ('categories',v_value,v_version,'publish',null);
  else
    foreach v_item in array v_defaults loop
      if not (v_value ? v_item) then
        v_value := v_value || to_jsonb(v_item);
      end if;
    end loop;

    v_version := coalesce(v_version,0)+1;
    update public.content_settings
    set value=v_value,is_public=true,version=v_version,updated_at=now()
    where key='categories';

    insert into public.content_settings_history(key,value,version,action,updated_by)
    values ('categories',v_value,v_version,'publish',null);
  end if;
end $$;

-- Be explicit that monetization remains OFF until a real billing provider is
-- connected. The access model is ready, but no user should be charged or
-- locked behind a non-existent checkout flow.
insert into public.content_settings(key,value,is_public,version,updated_by,updated_at)
values ('monetization_enabled','false'::jsonb,true,1,null,now())
on conflict (key) do nothing;

commit;
