-- Religious is a protected classification, not an ordinary category tag.
-- Existing books must enter the Religious policy through an explicit
-- classification update so all source-only/free-access guards run together.
-- Forward-only migration after 0031.

begin;

create or replace function public.enforce_book_content_policy()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_becoming_religious boolean;
  v_religious_tag_added boolean;
begin
  new.access_type := 'free';

  v_religious_tag_added :=
    tg_op='UPDATE'
    and old.content_classification is distinct from 'religious'
    and new.content_classification is distinct from 'religious'
    and not ('Religious'=any(coalesce(old.categories,array[]::text[])))
    and 'Religious'=any(coalesce(new.categories,array[]::text[]));

  if v_religious_tag_added then
    raise exception 'Religious is a protected classification. Use the explicit content-policy workflow instead of adding it as an ordinary category.';
  end if;

  v_becoming_religious :=
    new.content_classification='religious'
    or 'Religious'=any(coalesce(new.categories,array[]::text[]));

  if v_becoming_religious then
    if tg_op='UPDATE'
       and old.content_classification is distinct from 'religious'
    then
      if exists (
        select 1
        from public.book_editions e
        where e.book_id=new.id
          and e.provenance_type='ai_assisted'
      ) then
        raise exception 'Resolve AI-assisted translated editions before classifying this book as Religious';
      end if;

      if exists (
        select 1
        from public.book_translation_jobs j
        where j.book_id=new.id
          and j.status in ('pending','processing','awaiting_review','published')
      ) then
        raise exception 'Resolve active/published AI translation jobs before classifying this book as Religious';
      end if;
    end if;

    new.content_classification := 'religious';
    new.translation_generation_policy := 'source_only';
    new.translation_permission := false;

    if not ('Religious'=any(coalesce(new.categories,array[]::text[]))) then
      new.categories := array_append(coalesce(new.categories,array[]::text[]),'Religious');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_book_content_policy()
  from public, anon, authenticated;

commit;
