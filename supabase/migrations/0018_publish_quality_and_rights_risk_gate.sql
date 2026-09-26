-- Seeparah Reader V2 — publication quality and rights-risk gate.
--
-- Forward-only migration after 0017. Do not edit/reapply migrations 0000–0017.
-- This migration makes the database backstop match the stricter admin/app
-- publication checklist introduced after production Reader V2 QA.

begin;

alter table public.books
  add column if not exists rights_risk_acknowledged_at timestamptz,
  add column if not exists rights_risk_acknowledged_by uuid references auth.users(id);

-- Conservative clue detector. This is NOT a legal conclusion; it merely
-- tells the publish gate that the manuscript contains text which requires
-- explicit human review before rights can be approved/published.
create or replace function public.book_has_rights_risk_signal(p_book_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.book_chunks c
    join public.books b on b.id = c.book_id
    where c.book_id = p_book_id
      and c.language = b.source_language
      and c.source_version = b.source_version
      and c.chunk_index < 30
      and c.content ~* (
        'copyright|©|\(c\)|all[[:space:]]+rights[[:space:]]+reserved|' ||
        'revised[[:space:]]+edition|' ||
        'copyright.{0,80}renew|renewed.{0,80}copyright|' ||
        '(^|[^[:alpha:]])(first|second|third|new|revised)[[:space:]]+edition'
      )
  );
$$;

revoke all on function public.book_has_rights_risk_signal(uuid) from public;
grant execute on function public.book_has_rights_risk_signal(uuid) to service_role;

-- Replace the older 0005 publish gate with the Reader V2 publication gate.
-- English/Urdu translations remain NON-BLOCKING by design.
create or replace function public.check_book_publish_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    if new.rights_status <> 'approved' then
      raise exception 'Cannot publish: rights review is not approved';
    end if;

    if new.edition_review_status <> 'approved' then
      raise exception 'Cannot publish: edition quality review is not approved';
    end if;

    if new.structure_review_status <> 'approved' then
      raise exception 'Cannot publish: book structure review is not approved';
    end if;

    if new.cleanup_review_status <> 'approved' then
      raise exception 'Cannot publish: text cleanup review is not approved';
    end if;

    if new.rights_basis is null
       or length(btrim(new.rights_basis)) < 20
       or new.rights_basis ~* '\m(pending|do[[:space:]]+not[[:space:]]+approve|not[[:space:]]+verified|awaiting[[:space:]]+rights|rights[[:space:]]+unknown)\M'
    then
      raise exception 'Cannot publish: rights basis is unresolved or looks like placeholder/review text';
    end if;

    if new.rights_evidence_url is null
       or new.rights_evidence_url !~* '^https?://'
    then
      raise exception 'Cannot publish: a valid rights evidence URL is required';
    end if;

    if new.edition_title is null or btrim(new.edition_title) = '' then
      raise exception 'Cannot publish: edition title is required';
    end if;

    if new.edition_year is null then
      raise exception 'Cannot publish: edition year is required';
    end if;

    if new.publisher is null or btrim(new.publisher) = '' then
      raise exception 'Cannot publish: publisher is required';
    end if;

    if (new.isbn is null or btrim(new.isbn) = '')
       and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
    then
      raise exception 'Cannot publish: ISBN or source edition ID is required';
    end if;

    if new.original_publication_year is null then
      raise exception 'Cannot publish: original publication year is required';
    end if;

    if new.word_count is null or new.word_count <= 0 then
      raise exception 'Cannot publish: word count must be calculated';
    end if;

    if new.estimated_reading_minutes is null or new.estimated_reading_minutes <= 0 then
      raise exception 'Cannot publish: estimated reading time must be calculated';
    end if;

    if public.book_has_rights_risk_signal(new.id)
       and new.rights_risk_acknowledged_at is null
    then
      raise exception 'Cannot publish: manuscript rights-risk clues have not been reviewed and acknowledged';
    end if;
  end if;

  return new;
end;
$$;

-- Any edit to the CURRENT original-language source text invalidates the
-- reader-quality approvals and rights-risk acknowledgement. If the book is
-- live, it is automatically unpublished before the changed source can remain
-- publicly visible. Translation chunk changes do not trigger this.
create or replace function public.invalidate_book_reviews_on_source_chunk_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book_id uuid;
  v_language text;
  v_source_version integer;
  v_source_language text;
  v_current_source_version integer;
begin
  v_book_id := coalesce(new.book_id, old.book_id);
  v_language := coalesce(new.language, old.language);
  v_source_version := coalesce(new.source_version, old.source_version);

  select source_language, source_version
    into v_source_language, v_current_source_version
  from public.books
  where id = v_book_id;

  if not found
     or v_language is distinct from v_source_language
     or v_source_version is distinct from v_current_source_version
  then
    return coalesce(new, old);
  end if;

  -- An UPDATE that changes only translation metadata/status but not source
  -- content does not invalidate editorial review.
  if tg_op = 'UPDATE'
     and new.content is not distinct from old.content
  then
    return new;
  end if;

  update public.books
  set
    rights_risk_acknowledged_at = null,
    rights_risk_acknowledged_by = null,
    structure_review_status = 'pending',
    cleanup_review_status = 'pending',
    edition_review_status = case
      when edition_review_status = 'approved' then 'changes_requested'
      else edition_review_status
    end,
    status = case
      when status = 'published' then 'unpublished'
      when status = 'approved' then 'changes_requested'
      else status
    end
  where id = v_book_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists book_chunks_invalidate_source_reviews on public.book_chunks;
create trigger book_chunks_invalidate_source_reviews
  after insert or update or delete on public.book_chunks
  for each row execute function public.invalidate_book_reviews_on_source_chunk_change();

commit;

-- VERIFY AFTER APPLYING:
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='books'
-- and column_name in ('rights_risk_acknowledged_at','rights_risk_acknowledged_by');
--
-- select public.book_has_rights_risk_signal(id), id, title
-- from public.books;
--
-- select pg_get_functiondef('public.check_book_publish_gate()'::regprocedure);
