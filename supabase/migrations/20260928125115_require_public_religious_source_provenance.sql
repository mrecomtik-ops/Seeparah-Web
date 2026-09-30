-- Require reader-visible authentic source provenance before a Religious
-- book can become (or remain) publicly published.
--
-- The legal/right-to-publish evidence stays internal in rights_evidence_url.
-- source_url + source_edition_id/source_scan_id are the separate reader-facing
-- provenance record shown on the public book and Sacred Text pages.
--
-- Forward-only migration after 0035.

begin;

create or replace function public.check_book_publish_gate()
returns trigger
language plpgsql
security definer
set search_path=public
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

    if new.content_classification = 'religious' then
      if new.source_url is null or new.source_url !~* '^https?://' then
        raise exception 'Cannot publish Religious book: a valid reader-visible authentic source URL is required';
      end if;

      if (new.source_edition_id is null or btrim(new.source_edition_id) = '')
         and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
      then
        raise exception 'Cannot publish Religious book: an authentic source edition identifier is required';
      end if;
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

create or replace function public.auto_unpublish_invalid_published_book()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.status='published' and new.status='published' then
    if new.rights_status <> 'approved'
       or new.edition_review_status <> 'approved'
       or new.structure_review_status <> 'approved'
       or new.cleanup_review_status <> 'approved'
       or new.rights_basis is null
       or length(btrim(new.rights_basis)) < 20
       or new.rights_basis ~* '\m(pending|do[[:space:]]+not[[:space:]]+approve|not[[:space:]]+verified|awaiting[[:space:]]+rights|rights[[:space:]]+unknown)\M'
       or new.rights_evidence_url is null
       or new.rights_evidence_url !~* '^https?://'
       or new.edition_title is null
       or btrim(new.edition_title) = ''
       or new.edition_year is null
       or new.publisher is null
       or btrim(new.publisher) = ''
       or (
         (new.isbn is null or btrim(new.isbn) = '')
         and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
       )
       or new.original_publication_year is null
       or new.word_count is null
       or new.word_count <= 0
       or new.estimated_reading_minutes is null
       or new.estimated_reading_minutes <= 0
       or (
         new.content_classification = 'religious'
         and (
           new.source_url is null
           or new.source_url !~* '^https?://'
           or (
             (new.source_edition_id is null or btrim(new.source_edition_id) = '')
             and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
           )
         )
       )
       or (
         public.book_has_rights_risk_signal(new.id)
         and new.rights_risk_acknowledged_at is null
       )
    then
      new.status := 'unpublished';
    end if;
  end if;

  return new;
end;
$$;

commit;
