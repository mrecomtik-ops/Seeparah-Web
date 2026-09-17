alter table public.books
  add column if not exists rights_basis text,
  add column if not exists rights_evidence_url text,
  add column if not exists attribution text,
  add column if not exists permitted_territories text[] not null default '{}',
  add column if not exists translation_permission boolean not null default false,
  add column if not exists source_url text,
  add column if not exists source_edition_id text,
  add column if not exists translator text,
  add column if not exists categories text[] not null default '{}',
  add column if not exists import_key text,
  add column if not exists checksum text,
  add column if not exists rights_status text not null default 'pending',
  add column if not exists edition_review_status text not null default 'pending',
  add column if not exists rejection_reason text,
  add column if not exists review_notes text,
  add column if not exists reviewed_by uuid references auth.users (id),
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_rights_status_check') then
    alter table public.books
      add constraint books_rights_status_check
      check (rights_status in ('pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'books_edition_review_status_check') then
    alter table public.books
      add constraint books_edition_review_status_check
      check (edition_review_status in ('pending', 'approved', 'changes_requested', 'rejected'));
  end if;
end $$;

create unique index if not exists books_import_key_unique
  on public.books (import_key) where import_key is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_status_check') then
    alter table public.books
      add constraint books_status_check
      check (status in (
        'draft', 'in_review', 'changes_requested', 'approved',
        'published', 'rejected', 'unpublished', 'archived'
      ));
  end if;
end $$;

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
  end if;
  return new;
end;
$$;

drop trigger if exists books_publish_gate on public.books;
create trigger books_publish_gate
  before update on public.books
  for each row execute function public.check_book_publish_gate();
