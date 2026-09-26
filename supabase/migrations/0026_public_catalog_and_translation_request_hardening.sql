-- Close public/internal metadata leakage and harden reader translation requests.
-- Forward-only migration after 0025.

begin;

-- Published books are no longer readable directly from public.books by
-- anonymous/authenticated clients. Public catalog reads now go through a
-- server-side safe projection that returns only reader-facing columns.
drop policy if exists books_read_access on public.books;
create policy books_read_access
on public.books
for select
using (
  author_id = auth.uid()
  or public.is_admin(array['owner','administrator','editor'])
);

-- Direct client inserts cannot create requests for archived/unpublished,
-- Religious/source-only, disallowed, or source-language editions.
drop policy if exists translation_requests_insert_own on public.translation_requests;
create policy translation_requests_insert_own
on public.translation_requests
for insert
with check (
  requester_id = auth.uid()
  and status = 'requested'
  and job_id is null
  and decision_reason is null
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1
    from public.books b
    where b.id = book_id
      and b.status = 'published'
      and b.rights_status = 'approved'
      and b.translation_permission = true
      and b.content_classification <> 'religious'
      and b.translation_generation_policy = 'ai_allowed'
      and b.source_language <> language
  )
);

commit;
