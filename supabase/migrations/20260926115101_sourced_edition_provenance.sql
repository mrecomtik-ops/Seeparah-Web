-- Provenance metadata for verified sourced translated editions.
-- Used especially for Religious books, where Seeparah never generates the
-- translation and must preserve the exact sourced edition's identity.

begin;

alter table public.book_editions
  add column if not exists edition_title text,
  add column if not exists translator text,
  add column if not exists source_url text,
  add column if not exists source_edition_id text,
  add column if not exists rights_basis text,
  add column if not exists rights_evidence_url text;

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
    if new.provenance_type='ai_assisted' then
      raise exception 'Religious translated editions must be verified sourced editions, not AI-assisted editions';
    end if;
  elsif tg_op='INSERT' and new.access_type is null then
    new.access_type := 'paid';
  end if;

  return new;
end;
$$;

commit;
