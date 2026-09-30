-- Strengthen Religious -> General downgrade.
-- The protected classification may only be removed after the public book is
-- taken down, and AI translation permission is reset to false so a downgrade
-- cannot immediately make a previously Religious title machine-translatable.

begin;

create or replace function public.owner_downgrade_religious_book(
  p_book_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_status text;
begin
  if length(btrim(coalesce(p_reason,''))) < 20 then
    raise exception 'A substantive downgrade reason of at least 20 characters is required';
  end if;

  select status into v_status
  from public.books
  where id=p_book_id
    and content_classification='religious'
  for update;

  if not found then
    raise exception 'Religious book not found or already General';
  end if;

  if v_status='published' then
    raise exception 'Unpublish the Religious book before changing it to General';
  end if;

  if exists (
    select 1 from public.book_editions
    where book_id=p_book_id
      and provenance_type in ('human_translation','licensed_translation','public_domain_translation')
  ) then
    raise exception 'Resolve verified sourced Religious editions before changing this book to General';
  end if;

  perform set_config('seeparah.allow_religious_downgrade','on',true);

  update public.books
  set
    content_classification='general',
    translation_generation_policy='ai_allowed',
    translation_permission=false,
    categories=array_remove(coalesce(categories,array[]::text[]),'Religious'),
    access_type='free'
  where id=p_book_id;
end;
$$;

revoke all on function public.owner_downgrade_religious_book(uuid,text)
  from public, anon, authenticated;
grant execute on function public.owner_downgrade_religious_book(uuid,text)
  to service_role;

commit;
