-- Seeparah content access model:
-- 1) every original/source-language edition is always free;
-- 2) reviewed translated editions are subscription content by default;
-- 3) Religious books and every verified edition of them are always free;
-- 4) Religious books never enter the AI translation-generation pipeline.
--
-- Forward-only migration after 0022.

begin;

alter table public.books
  add column if not exists content_classification text not null default 'general',
  add column if not exists translation_generation_policy text not null default 'ai_allowed',
  add column if not exists typography_profile text not null default 'standard',
  add column if not exists authenticity_notes text;

alter table public.books
  drop constraint if exists books_content_classification_check;
alter table public.books
  add constraint books_content_classification_check
  check (content_classification in ('general','religious'));

alter table public.books
  drop constraint if exists books_translation_generation_policy_check;
alter table public.books
  add constraint books_translation_generation_policy_check
  check (translation_generation_policy in ('ai_allowed','source_only'));

alter table public.books
  drop constraint if exists books_typography_profile_check;
alter table public.books
  add constraint books_typography_profile_check
  check (typography_profile in (
    'standard',
    'scripture_arabic',
    'scripture_urdu',
    'scripture_hebrew',
    'scripture_indic',
    'facsimile_preserving'
  ));

alter table public.book_editions
  add column if not exists provenance_type text not null default 'ai_assisted',
  add column if not exists typography_profile text not null default 'standard',
  add column if not exists authenticity_notes text;

alter table public.book_editions
  drop constraint if exists book_editions_provenance_type_check;
alter table public.book_editions
  add constraint book_editions_provenance_type_check
  check (provenance_type in (
    'ai_assisted',
    'human_translation',
    'licensed_translation',
    'public_domain_translation'
  ));

alter table public.book_editions
  drop constraint if exists book_editions_typography_profile_check;
alter table public.book_editions
  add constraint book_editions_typography_profile_check
  check (typography_profile in (
    'standard',
    'scripture_arabic',
    'scripture_urdu',
    'scripture_hebrew',
    'scripture_indic',
    'facsimile_preserving'
  ));

-- Existing category data can opt a title into the protected religious policy.
update public.books
set
  content_classification = 'religious',
  translation_generation_policy = 'source_only',
  access_type = 'free'
where 'Religious' = any(coalesce(categories, array[]::text[]));

-- Product rule: the original edition of every book is free.
update public.books set access_type='free' where access_type <> 'free';

-- Product rule: translated editions are paid subscription content by default,
-- except Religious editions, which remain permanently free.
update public.book_editions e
set access_type = case
  when exists (
    select 1 from public.books b
    where b.id=e.book_id and b.content_classification='religious'
  ) then 'free'
  else 'paid'
end;

create or replace function public.enforce_book_content_policy()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  -- Original-language content is always free.
  new.access_type := 'free';

  if new.content_classification='religious'
     or 'Religious' = any(coalesce(new.categories, array[]::text[]))
  then
    new.content_classification := 'religious';
    new.translation_generation_policy := 'source_only';
    if not ('Religious' = any(coalesce(new.categories, array[]::text[]))) then
      new.categories := array_append(coalesce(new.categories, array[]::text[]), 'Religious');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists books_content_policy_guard on public.books;
create trigger books_content_policy_guard
  before insert or update on public.books
  for each row execute function public.enforce_book_content_policy();

create or replace function public.enforce_edition_content_policy()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_classification text;
begin
  select content_classification into v_classification
  from public.books where id=new.book_id;

  if v_classification='religious' then
    new.access_type := 'free';
  elsif tg_op='INSERT' and new.access_type is null then
    new.access_type := 'paid';
  end if;

  return new;
end;
$$;

drop trigger if exists book_editions_content_policy_guard on public.book_editions;
create trigger book_editions_content_policy_guard
  before insert or update on public.book_editions
  for each row execute function public.enforce_edition_content_policy();

-- Replace the translation-rights gate from 0022 with the additional
-- "source_only" restriction. Imported/licensed Religious translations do not
-- use book_translation_jobs; they are imported as reviewed editions.
create or replace function public.check_translation_job_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_language text;
  v_rights_status text;
  v_translation_permission boolean;
  v_generation_policy text;
  v_classification text;
begin
  select source_language, rights_status, translation_permission,
         translation_generation_policy, content_classification
    into v_source_language, v_rights_status, v_translation_permission,
         v_generation_policy, v_classification
  from public.books
  where id = new.book_id;

  if not found then
    raise exception 'Cannot create/process translation job: book not found';
  end if;

  if new.language = v_source_language then
    raise exception 'Cannot create/process translation job: target language matches source language';
  end if;

  if v_classification='religious' or v_generation_policy='source_only' then
    raise exception 'Cannot create/process translation job: Religious/source-only books do not use AI-generated translations';
  end if;

  if new.status in ('pending','processing','awaiting_review','published') then
    if v_rights_status <> 'approved' then
      raise exception 'Cannot create/process translation job: book rights review is not approved';
    end if;
    if coalesce(v_translation_permission,false)=false then
      raise exception 'Cannot create/process translation job: translation is not permitted by the book rights record';
    end if;
  end if;
  return new;
end;
$$;

-- Source-language chunks are always readable. Religious verified editions are
-- always readable. General translated editions may require the account-wide
-- monthly subscription when monetization is enabled.
create or replace function public.book_chunk_readable(
  p_book_id uuid,
  p_language text,
  p_chunk_index integer
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_book record;
  v_edition_access text;
begin
  select source_language, content_classification into v_book
  from public.books where id=p_book_id;
  if v_book is null then return false; end if;

  if p_language = v_book.source_language then
    return true;
  end if;

  select access_type into v_edition_access
  from public.book_editions
  where book_id=p_book_id and language=p_language;

  if v_edition_access is null then return false; end if;

  if v_book.content_classification='religious' then
    return true;
  end if;

  -- Opening page remains a preview for paid translated editions.
  if p_chunk_index=0 then return true; end if;

  return v_edition_access <> 'paid'
    or not public.is_monetization_enabled()
    or public.has_active_plan_subscription(auth.uid());
end;
$$;

revoke all on function public.check_translation_job_rights() from public, anon, authenticated;
revoke all on function public.book_chunk_readable(uuid,text,integer) from public;
grant execute on function public.book_chunk_readable(uuid,text,integer) to anon, authenticated, service_role;

commit;
