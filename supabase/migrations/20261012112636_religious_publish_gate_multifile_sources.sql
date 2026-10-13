create or replace function public.check_book_publish_gate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    if new.rights_status <> 'approved' then raise exception 'Cannot publish: rights review is not approved'; end if;
    if new.edition_review_status <> 'approved' then raise exception 'Cannot publish: edition quality review is not approved'; end if;
    if new.structure_review_status <> 'approved' then raise exception 'Cannot publish: book structure review is not approved'; end if;
    if new.cleanup_review_status <> 'approved' then raise exception 'Cannot publish: text cleanup review is not approved'; end if;
    if new.description is null or length(btrim(new.description)) < 40
       or new.description ilike '%awaiting Seeparah editorial review before publication%'
    then raise exception 'Cannot publish: a real reader-facing book summary is required'; end if;
    if new.rights_basis is null or length(btrim(new.rights_basis)) < 20
       or new.rights_basis ~* '\m(pending|do[[:space:]]+not[[:space:]]+approve|not[[:space:]]+verified|awaiting[[:space:]]+rights|rights[[:space:]]+unknown)\M'
    then raise exception 'Cannot publish: rights basis is unresolved or looks like placeholder/review text'; end if;
    if new.rights_evidence_url is null or new.rights_evidence_url !~* '^https?://'
    then raise exception 'Cannot publish: a valid rights evidence URL is required'; end if;
    if new.edition_title is null or btrim(new.edition_title) = '' then raise exception 'Cannot publish: edition title is required'; end if;
    if new.publisher is null or btrim(new.publisher) = '' then raise exception 'Cannot publish: publisher is required'; end if;
    if new.word_count is null or new.word_count <= 0 then raise exception 'Cannot publish: word count must be calculated'; end if;
    if new.estimated_reading_minutes is null or new.estimated_reading_minutes <= 0 then raise exception 'Cannot publish: estimated reading time must be calculated'; end if;

    if new.content_classification = 'religious' then
      if new.source_url is null or new.source_url !~* '^https?://'
      then raise exception 'Cannot publish Religious book: a valid reader-visible authentic source URL is required'; end if;
      if (new.source_edition_id is null or btrim(new.source_edition_id) = '')
         and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
      then raise exception 'Cannot publish Religious book: an authentic source edition identifier is required'; end if;
      if new.reuse_notice is null or length(btrim(new.reuse_notice)) < 10
      then raise exception 'Cannot publish Religious book: a reader-visible reuse notice is required'; end if;
      if not (
        new.source_file_sha256 ~ '^[0-9a-f]{64}$'
        and nullif(btrim(coalesce(new.source_file_path,'')), '') is not null
      ) and not exists (
        select 1
        from public.sacred_source_editions e
        join public.sacred_source_files f on f.edition_id = e.id
        where e.book_id = new.id
          and f.authoritative_text = true
          and f.source_bytes_preserved = true
          and f.sha256 ~ '^[0-9a-f]{64}$'
      ) then
        raise exception 'Cannot publish Religious book: exact preserved source-file checksum records are required';
      end if;
      if not exists (
        select 1 from public.book_structure_nodes n
        where n.book_id = new.id
          and n.language = new.source_language
          and n.source_version = new.source_version
          and nullif(btrim(coalesce(n.metadata->>'canonical_ref','')), '') is not null
      ) then raise exception 'Cannot publish Religious book: canonical reference structure has not been imported'; end if;
    else
      if new.edition_year is null then raise exception 'Cannot publish: edition year is required'; end if;
      if (new.isbn is null or btrim(new.isbn) = '')
         and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
      then raise exception 'Cannot publish: ISBN or source edition ID is required'; end if;
      if new.original_publication_year is null then raise exception 'Cannot publish: original publication year is required'; end if;
    end if;

    if public.book_has_rights_risk_signal(new.id) and new.rights_risk_acknowledged_at is null
    then raise exception 'Cannot publish: manuscript rights-risk clues have not been reviewed and acknowledged'; end if;
  end if;
  return new;
end;
$function$;
