-- Move policy-only SECURITY DEFINER helpers out of the exposed public API
-- schema, then consolidate overlapping SELECT policies without changing
-- effective access. Forward-only launch hardening.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_admin(min_roles text[])
returns boolean
language sql
security definer
set search_path=pg_catalog, public
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and revoked_at is null
      and role = any(min_roles)
  );
$$;

create or replace function private.is_paper_version_published(
  p_paper_id uuid,
  p_version_id uuid
)
returns boolean
language sql
security definer
set search_path=pg_catalog, public
stable
as $$  select exists (
    select 1
    from public.research_papers rp
    where rp.id = p_paper_id
      and rp.published_version_id = p_version_id
  );
$$;

create or replace function private.book_chunk_readable(
  p_book_id uuid,
  p_language text,
  p_chunk_index integer
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog, public, private
stable
as $$
declare
  v_book record;
  v_edition_access text;
begin
  select status, author_id, source_language, content_classification
    into v_book
  from public.books
  where id=p_book_id;

  if v_book is null then return false; end if;

  if v_book.status <> 'published'
     and not (
       auth.uid() is not null
       and v_book.author_id = auth.uid()
     )     and not private.is_admin(array['owner','administrator','editor'])
  then
    return false;
  end if;

  if p_language = v_book.source_language then return true; end if;

  select access_type into v_edition_access
  from public.book_editions
  where book_id=p_book_id and language=p_language;

  if v_edition_access is null then return false; end if;
  if v_book.content_classification='religious' then return true; end if;
  if p_chunk_index=0 then return true; end if;

  return v_edition_access <> 'paid'
    or not public.is_monetization_enabled()
    or public.has_active_plan_subscription(auth.uid());
end;
$$;

revoke all on function private.is_admin(text[]) from public;
revoke all on function private.is_paper_version_published(uuid,uuid) from public;
revoke all on function private.book_chunk_readable(uuid,text,integer) from public;
grant execute on function private.is_admin(text[]) to anon, authenticated, service_role;
grant execute on function private.is_paper_version_published(uuid,uuid) to anon, authenticated, service_role;
grant execute on function private.book_chunk_readable(uuid,text,integer) to anon, authenticated, service_role;

-- The content-policy trigger is invoker-security and therefore must call the
-- private helper directly once public.is_admin is no longer browser-executable.
create or replace function public.enforce_book_content_policy()returns trigger
language plpgsql
set search_path=public,private
as $$
declare
  v_becoming_religious boolean;
  v_religious_tag_added boolean;
  v_allowed_categories text[];
  v_category text;
  v_is_privileged boolean;
begin
  new.access_type := 'free';

  v_is_privileged :=
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.role() = 'service_role', false)
    or private.is_admin(array['owner','administrator','editor']);

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
    end if;    select coalesce(array_agg(category), array[]::text[])
      into v_allowed_categories
    from jsonb_array_elements_text(
      coalesce(
        (select value from public.content_settings where key='categories'),
        '[]'::jsonb
      )
    ) as category;

    foreach v_category in array coalesce(new.categories, array[]::text[]) loop
      if not (v_category = any(v_allowed_categories)) then
        raise exception 'Category "%" is not in the controlled category list.', v_category;
      end if;
    end loop;
  end if;

  v_religious_tag_added :=
    tg_op='UPDATE'
    and old.content_classification is distinct from 'religious'
    and new.content_classification is distinct from 'religious'
    and not ('Religious'=any(coalesce(old.categories,array[]::text[])))
    and 'Religious'=any(coalesce(new.categories,array[]::text[]));

  if v_religious_tag_added and not v_is_privileged then
    raise exception 'Religious is a protected classification. Use the explicit content-policy workflow instead of adding it as an ordinary category.';
  end if;

  v_becoming_religious :=
    new.content_classification='religious'
    or 'Religious'=any(coalesce(new.categories,array[]::text[]));  if v_becoming_religious then
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

-- Replace policy references with private helpers.
drop policy if exists audit_log_owner_admin_read on public.audit_log;
create policy audit_log_owner_admin_read on public.audit_log for select
  using (private.is_admin(array['owner','administrator']));drop policy if exists books_read_access on public.books;
create policy books_read_access on public.books for select
  using (
    author_id = (select auth.uid())
    or private.is_admin(array['owner','administrator','editor'])
  );

drop policy if exists book_chunks_read_access on public.book_chunks;
create policy book_chunks_read_access on public.book_chunks for select
  using (
    status='published'
    and exists (
      select 1 from public.books b
      where b.id=book_chunks.book_id
        and (
          b.status='published'
          or b.author_id=(select auth.uid())
          or private.is_admin(array['owner','administrator','editor'])
        )
    )
    and (
      exists (
        select 1 from public.books b
        where b.id=book_chunks.book_id
          and b.author_id=(select auth.uid())
      )
      or private.is_admin(array['owner','administrator','editor'])
      or private.book_chunk_readable(book_id,language,chunk_index)
    )
  );drop policy if exists content_settings_history_staff_read on public.content_settings_history;
create policy content_settings_history_staff_read on public.content_settings_history for select
  using (private.is_admin(array['owner','administrator']));

drop policy if exists error_events_staff_read on public.error_events;
create policy error_events_staff_read on public.error_events for select
  using (private.is_admin(array['owner','administrator']));

drop policy if exists research_papers_author_select on public.research_papers;
create policy research_papers_author_select on public.research_papers for select
  using (
    author_id=(select auth.uid())
    or private.is_admin(array['owner','administrator','editor'])
  );

-- Consolidate owner/public and staff SELECT policies into one permissive
-- policy per table/action so Postgres evaluates only one predicate.
drop policy if exists admin_users_owner_admin_read on public.admin_users;
drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_read on public.admin_users for select
  using (
    user_id=(select auth.uid())
    or private.is_admin(array['owner','administrator'])
  );drop policy if exists content_settings_public_read on public.content_settings;
drop policy if exists content_settings_staff_read_all on public.content_settings;
create policy content_settings_read on public.content_settings for select
  using (
    is_public=true
    or private.is_admin(array['owner','administrator','editor','support'])
  );

drop policy if exists research_paper_versions_admin_read on public.research_paper_versions;
drop policy if exists research_paper_versions_public_read on public.research_paper_versions;
create policy research_paper_versions_read on public.research_paper_versions for select
  using (
    private.is_admin(array['owner','administrator','editor'])
    or private.is_paper_version_published(paper_id,id)
  );

drop policy if exists support_ticket_notes_owner_read_public on public.support_ticket_notes;
drop policy if exists support_ticket_notes_staff_read on public.support_ticket_notes;
create policy support_ticket_notes_read on public.support_ticket_notes for select
  using (
    (
      visibility='public'
      and exists (
        select 1 from public.support_tickets t
        where t.id=support_ticket_notes.ticket_id
          and t.user_id=(select auth.uid())
      )
    )
    or private.is_admin(array['owner','administrator','support'])
  );drop policy if exists support_tickets_owner_read on public.support_tickets;
drop policy if exists support_tickets_staff_read on public.support_tickets;
create policy support_tickets_read on public.support_tickets for select
  using (
    user_id=(select auth.uid())
    or private.is_admin(array['owner','administrator','support'])
  );

drop policy if exists translation_requests_owner_read on public.translation_requests;
drop policy if exists translation_requests_staff_read on public.translation_requests;
create policy translation_requests_read on public.translation_requests for select
  using (
    requester_id=(select auth.uid())
    or private.is_admin(array['owner','administrator','editor'])
  );

-- The legacy public helpers remain for migration compatibility but are no
-- longer part of browser policy execution and must not be callable as RPCs.
revoke all on function public.is_admin(text[]) from public, anon, authenticated;
revoke all on function public.book_chunk_readable(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.is_paper_version_published(uuid,uuid) from public, anon, authenticated;
grant execute on function public.is_admin(text[]) to service_role;
grant execute on function public.book_chunk_readable(uuid,text,integer) to service_role;
grant execute on function public.is_paper_version_published(uuid,uuid) to service_role;

commit;
