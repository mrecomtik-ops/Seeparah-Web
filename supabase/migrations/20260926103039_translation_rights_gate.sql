-- Seeparah translation-rights enforcement.
-- Forward-only migration after 0021.
--
-- The application already checks these conditions before approving/queueing
-- translation work. This trigger is the database backstop so a direct
-- service-role write cannot accidentally create or advance a translation
-- job for a book whose current rights record forbids translation.

begin;

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
begin
  select source_language, rights_status, translation_permission
    into v_source_language, v_rights_status, v_translation_permission
  from public.books
  where id = new.book_id;

  if not found then
    raise exception 'Cannot create/process translation job: book not found';
  end if;

  if new.language = v_source_language then
    raise exception 'Cannot create/process translation job: target language matches source language';
  end if;

  if new.status in ('pending', 'processing', 'awaiting_review', 'published') then
    if v_rights_status <> 'approved' then
      raise exception 'Cannot create/process translation job: book rights review is not approved';
    end if;

    if coalesce(v_translation_permission, false) = false then
      raise exception 'Cannot create/process translation job: translation is not permitted by the book rights record';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists book_translation_jobs_rights_gate on public.book_translation_jobs;
create trigger book_translation_jobs_rights_gate
  before insert or update of status, book_id, language
  on public.book_translation_jobs
  for each row execute function public.check_translation_job_rights();

revoke all on function public.check_translation_job_rights() from public;
revoke all on function public.check_translation_job_rights() from anon;
revoke all on function public.check_translation_job_rights() from authenticated;

commit;
