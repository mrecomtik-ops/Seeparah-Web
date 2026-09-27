-- Ensure a book cannot remain publicly published after a required
-- publication approval, provenance field, or review signal becomes invalid.
-- Forward-only migration after 0032.
--
-- New publication attempts are still rejected by check_book_publish_gate().
-- This trigger handles the separate case where an already-published row is
-- edited into an invalid state while its status would otherwise remain live.

begin;

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

revoke all on function public.auto_unpublish_invalid_published_book()
  from public, anon, authenticated, service_role;

drop trigger if exists books_auto_unpublish_invalid_gate on public.books;
create trigger books_auto_unpublish_invalid_gate
  before update on public.books
  for each row
  execute function public.auto_unpublish_invalid_published_book();

commit;
