-- Prevent a General -> Religious reclassification from inheriting AI
-- translations/jobs that violate the Religious source-only policy.
-- Forward-only migration after 0029.

begin;

create or replace function public.enforce_book_content_policy()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_becoming_religious boolean;
begin
  -- Original-language content is always free.
  new.access_type := 'free';

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
