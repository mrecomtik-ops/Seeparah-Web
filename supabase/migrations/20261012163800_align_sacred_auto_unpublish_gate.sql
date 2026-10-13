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
       or new.description is null
       or length(btrim(new.description)) < 40
       or new.description ilike '%awaiting Seeparah editorial review before publication%'
       or new.rights_basis is null
       or length(btrim(new.rights_basis)) < 20
       or new.rights_basis ~* '\m(pending|do[[:space:]]+not[[:space:]]+approve|not[[:space:]]+verified|awaiting[[:space:]]+rights|rights[[:space:]]+unknown)\M'
       or new.rights_evidence_url is null
       or new.rights_evidence_url !~* '^https?://'
       or new.edition_title is null
       or btrim(new.edition_title) = ''
       or new.publisher is null
       or btrim(new.publisher) = ''
       or new.word_count is null
       or new.word_count <= 0
       or new.estimated_reading_minutes is null
       or new.estimated_reading_minutes <= 0
       or (
         new.content_classification = 'religious'
         and (
           new.source_url is null or new.source_url !~* '^https?://'
           or ((new.source_edition_id is null or btrim(new.source_edition_id) = '')
               and (new.source_scan_id is null or btrim(new.source_scan_id) = ''))
           or new.reuse_notice is null or length(btrim(new.reuse_notice)) < 10
           or (
             not (new.source_file_sha256 ~ '^[0-9a-f]{64}$'
                  and nullif(btrim(coalesce(new.source_file_path,'')), '') is not null)
             and not exists (
               select 1
               from public.sacred_source_editions e
               join public.sacred_source_files f on f.edition_id = e.id
               where e.book_id = new.id
                 and f.authoritative_text = true
                 and f.source_bytes_preserved = true
                 and f.sha256 ~ '^[0-9a-f]{64}$'
             )
           )
           or not exists (
             select 1
             from public.book_structure_nodes n
             where n.book_id = new.id
               and n.language = new.source_language
               and n.source_version = new.source_version
               and nullif(btrim(coalesce(n.metadata->>'canonical_ref','')), '') is not null
           )
         )
       )
       or (
         new.content_classification <> 'religious'
         and (
           new.edition_year is null
           or ((new.isbn is null or btrim(new.isbn) = '')
               and (new.source_scan_id is null or btrim(new.source_scan_id) = ''))
           or new.original_publication_year is null
         )
       )
       or (public.book_has_rights_risk_signal(new.id) and new.rights_risk_acknowledged_at is null)
    then
      new.status := 'unpublished';
    end if;
  end if;
  return new;
end;
$$;
