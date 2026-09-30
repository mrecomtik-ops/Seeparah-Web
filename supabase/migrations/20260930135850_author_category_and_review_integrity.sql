-- Align author category writes with the protected production ACL and make
-- the overall Approved lifecycle state truthful. Forward-only migration.
begin;

create or replace function public.enforce_book_content_policy()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_becoming_religious boolean;
  v_religious_tag_added boolean;
  v_is_privileged boolean;
  v_allowed_categories text[];
  v_category text;
begin
  -- Original/source-language books remain free at the database boundary.
  new.access_type := 'free';

  v_is_privileged :=
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.role() = 'service_role', false)
    or public.is_admin(array['owner','administrator','editor']);

  if not v_is_privileged then
    if new.content_classification = 'religious'
       or 'Religious' = any(coalesce(new.categories, array[]::text[]))
    then
      raise exception 'Religious is a protected classification and cannot be selected through the normal author workflow.';
    end if;
    if cardinality(coalesce(new.categories, array[]::text[])) > 3 then
      raise exception 'Authors may choose at most 3 categories.';
    end if;
    if new.status='in_review'
       and cardinality(coalesce(new.categories, array[]::text[])) = 0
    then
      raise exception 'Choose at least one category before submitting for review.';
    end if;

    select coalesce(array_agg(category), array[]::text[])
      into v_allowed_categories
    from jsonb_array_elements_text(
      coalesce(
        (select value from public.content_settings where key='categories'),
        '[]'::jsonb
      )
    ) as category;

    foreach v_category in array coalesce(new.categories, array[]::text[]) loop
      if v_category = 'Religious'
         or not (v_category = any(v_allowed_categories))
      then
        raise exception 'Category "%" is not in the controlled Seeparah category list.', v_category;
      end if;
    end loop;
  end if;

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
        select 1 from public.book_editions e
        where e.book_id=new.id and e.provenance_type='ai_assisted'
      ) then
        raise exception 'Resolve AI-assisted translated editions before classifying this book as Religious';
      end if;

      if exists (
        select 1 from public.book_translation_jobs j
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

-- Categories are the one previously-protected author column deliberately
-- reopened. The trigger above validates every browser write independently.
grant insert (categories) on public.books to authenticated;
grant update (categories) on public.books to authenticated;

create or replace function public.enforce_book_approved_review_integrity()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.status='approved'
     and (
       new.rights_status <> 'approved'
       or new.edition_review_status <> 'approved'
       or new.structure_review_status <> 'approved'
       or new.cleanup_review_status <> 'approved'
     )
  then
    raise exception 'A book cannot be Approved until rights, edition, structure, and cleanup reviews are all approved.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_book_approved_review_integrity()
  from public, anon, authenticated;

drop trigger if exists books_approved_review_integrity on public.books;
create trigger books_approved_review_integrity
  before insert or update on public.books
  for each row execute function public.enforce_book_approved_review_integrity();

do $$
begin
  if not has_column_privilege('authenticated','public.books','categories','INSERT')
     or not has_column_privilege('authenticated','public.books','categories','UPDATE')
  then
    raise exception 'Postcondition failed: author category column privileges are missing';
  end if;

  if has_column_privilege('authenticated','public.books','access_type','INSERT')
     or has_column_privilege('authenticated','public.books','subscription_price_usd','INSERT')
  then
    raise exception 'Postcondition failed: protected monetization columns became author-writable';
  end if;

  if exists (
    select 1 from public.books
    where status='approved'
      and (
        rights_status <> 'approved'
        or edition_review_status <> 'approved'
        or structure_review_status <> 'approved'
        or cleanup_review_status <> 'approved'
      )
  ) then
    raise exception 'Postcondition failed: an existing Approved book has incomplete review stages';
  end if;
end $$;

commit;
