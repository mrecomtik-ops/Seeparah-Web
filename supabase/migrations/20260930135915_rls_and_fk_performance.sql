-- Query-plan hardening for launch scale. No access semantics change:
-- covering indexes for currently unindexed foreign keys and init-plan
-- friendly auth.uid() references in existing RLS policies.
begin;

create index if not exists admin_users_granted_by_idx on public.admin_users(granted_by);
create index if not exists admin_users_revoked_by_idx on public.admin_users(revoked_by);
create index if not exists book_highlights_book_id_idx on public.book_highlights(book_id);
create index if not exists book_shelves_book_id_idx on public.book_shelves(book_id);
create index if not exists books_reviewed_by_idx on public.books(reviewed_by);
create index if not exists books_rights_risk_ack_by_idx on public.books(rights_risk_acknowledged_by);
create index if not exists content_settings_updated_by_idx on public.content_settings(updated_by);
create index if not exists content_settings_history_updated_by_idx on public.content_settings_history(updated_by);
create index if not exists error_events_book_id_idx on public.error_events(book_id);
create index if not exists error_events_job_id_idx on public.error_events(job_id);
create index if not exists error_events_resolved_by_idx on public.error_events(resolved_by);
create index if not exists error_events_user_id_idx on public.error_events(user_id);
create index if not exists reading_progress_book_id_idx on public.reading_progress(book_id);
create index if not exists research_papers_published_version_idx on public.research_papers(published_version_id);
create index if not exists support_ticket_notes_author_id_idx on public.support_ticket_notes(author_id);
create index if not exists support_tickets_related_book_idx on public.support_tickets(related_book_id);
create index if not exists support_tickets_related_job_idx on public.support_tickets(related_job_id);
create index if not exists support_tickets_related_paper_idx on public.support_tickets(related_paper_id);
create index if not exists translation_reports_book_id_idx on public.translation_reports(book_id);
create index if not exists translation_requests_job_id_idx on public.translation_requests(job_id);
create index if not exists translation_requests_requester_id_idx on public.translation_requests(requester_id);
create index if not exists translation_requests_reviewed_by_idx on public.translation_requests(reviewed_by);
create index if not exists user_subscriptions_book_id_idx on public.user_subscriptions(book_id);

alter policy admin_users_self_read on public.admin_users
  using (user_id = (select auth.uid()));

alter policy author_profiles_owner_write on public.author_profiles
  with check ((select auth.uid()) = user_id);
alter policy author_profiles_owner_update on public.author_profiles
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy book_highlights_owner_all on public.book_highlights
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy book_shelves_owner_all on public.book_shelves
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy reading_progress_owner_all on public.reading_progress
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy books_author_insert on public.books
  with check (
    author_id = (select auth.uid())
    and status = any(array['draft'::text,'in_review'::text,'unpublished'::text])
  );
alter policy books_author_update on public.books
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and status = any(array['draft'::text,'in_review'::text,'unpublished'::text])
  );
alter policy books_read_access on public.books
  using (
    author_id = (select auth.uid())
    or public.is_admin(array['owner','administrator','editor'])
  );

alter policy book_chunks_author_insert on public.book_chunks
  with check (
    exists (
      select 1 from public.books b
      where b.id=book_chunks.book_id
        and b.author_id=(select auth.uid())
        and b.status <> 'published'
    )
  );
alter policy book_chunks_read_access on public.book_chunks
  using (
    status='published'
    and exists (
      select 1 from public.books b
      where b.id=book_chunks.book_id
        and (
          b.status='published'
          or b.author_id=(select auth.uid())
          or public.is_admin(array['owner','administrator','editor'])
        )
    )
    and (
      exists (
        select 1 from public.books b
        where b.id=book_chunks.book_id and b.author_id=(select auth.uid())
      )
      or public.is_admin(array['owner','administrator','editor'])
      or public.book_chunk_readable(book_chunks.book_id,book_chunks.language,book_chunks.chunk_index)
    )
  );

alter policy book_translation_guides_owner_read on public.book_translation_guides
  using (
    exists (
      select 1 from public.books b
      where b.id=book_translation_guides.book_id and b.author_id=(select auth.uid())
    )
  );
alter policy book_translation_jobs_owner_read on public.book_translation_jobs
  using (
    exists (
      select 1 from public.books b
      where b.id=book_translation_jobs.book_id and b.author_id=(select auth.uid())
    )
  );
alter policy book_translation_sections_owner_read on public.book_translation_sections
  using (
    exists (
      select 1
      from public.book_translation_jobs j
      join public.books b on b.id=j.book_id
      where j.id=book_translation_sections.job_id and b.author_id=(select auth.uid())
    )
  );
alter policy category_suggestions_author_insert on public.category_suggestions
  with check (
    suggested_by=(select auth.uid())
    and (
      (
        content_type='book'
        and exists (
          select 1 from public.books b
          where b.id=category_suggestions.content_id and b.author_id=(select auth.uid())
        )
      )
      or (
        content_type='research_paper'
        and exists (
          select 1 from public.research_papers rp
          where rp.id=category_suggestions.content_id and rp.author_id=(select auth.uid())
        )
      )
    )
  );
alter policy category_suggestions_author_read_own on public.category_suggestions
  using (suggested_by=(select auth.uid()));

alter policy research_papers_author_insert on public.research_papers
  with check (
    author_id=(select auth.uid())
    and status=any(array['draft'::text,'submitted'::text])
  );
alter policy research_papers_author_select on public.research_papers
  using (
    author_id=(select auth.uid())
    or public.is_admin(array['owner','administrator','editor'])
  );
alter policy research_papers_author_update on public.research_papers
  using (author_id=(select auth.uid()))
  with check (
    author_id=(select auth.uid())
    and status=any(array['draft'::text,'submitted'::text,'changes_requested'::text])
  );

alter policy support_ticket_notes_owner_read_public on public.support_ticket_notes
  using (
    visibility='public'
    and exists (
      select 1 from public.support_tickets t
      where t.id=support_ticket_notes.ticket_id and t.user_id=(select auth.uid())
    )
  );
alter policy support_tickets_owner_read on public.support_tickets
  using (user_id=(select auth.uid()));
alter policy translation_reports_insert_own on public.translation_reports
  with check ((select auth.uid())=reporter_id);
alter policy translation_reports_read_own_or_author on public.translation_reports
  using (
    (select auth.uid())=reporter_id
    or exists (
      select 1 from public.books b
      where b.id=translation_reports.book_id and b.author_id=(select auth.uid())
    )
  );

alter policy translation_requests_insert_own on public.translation_requests
  with check (
    requester_id=(select auth.uid())
    and status='requested'
    and job_id is null
    and decision_reason is null
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from public.books b
      where b.id=translation_requests.book_id
        and b.status='published'
        and b.rights_status='approved'
        and b.translation_permission=true
        and b.content_classification <> 'religious'
        and b.translation_generation_policy='ai_allowed'
        and b.source_language <> translation_requests.language
    )
  );
alter policy translation_requests_owner_read on public.translation_requests
  using (requester_id=(select auth.uid()));
alter policy user_subscriptions_owner_read on public.user_subscriptions
  using (user_id=(select auth.uid()));

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and (
        coalesce(qual,'') like '%auth.uid()%'
        or coalesce(with_check,'') like '%auth.uid()%'
      )
      and (
        coalesce(qual,'') not like '%( SELECT auth.uid() AS uid)%'
        and coalesce(with_check,'') not like '%( SELECT auth.uid() AS uid)%'
      )
  ) then
    raise notice 'Some policies still contain auth.uid(); review Supabase advisor after apply.';
  end if;
end $$;

commit;
