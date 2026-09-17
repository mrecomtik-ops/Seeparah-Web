-- Seeparah — translation pipeline, editorial review, author profiles, and
-- reporting. Additive and backward compatible.

alter table public.books
  add column if not exists source_version integer not null default 1;

alter table public.book_chunks
  add column if not exists status text not null default 'published',
  add column if not exists source_version integer not null default 1,
  add column if not exists job_id uuid,
  add column if not exists model text,
  add column if not exists prompt_version text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'book_chunks_status_check'
  ) then
    alter table public.book_chunks
      add constraint book_chunks_status_check
      check (status in ('processing', 'published', 'failed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'book_chunks_unique_edition_section'
  ) then
    alter table public.book_chunks
      add constraint book_chunks_unique_edition_section
      unique (book_id, language, chunk_index, source_version);
  end if;
end $$;

create index if not exists book_chunks_job_id_idx on public.book_chunks (job_id);
create index if not exists book_chunks_lookup_idx
  on public.book_chunks (book_id, language, status);

create table if not exists public.book_translation_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  language text not null,
  source_version integer not null default 1,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'failed', 'awaiting_review', 'published', 'canceled')),
  model text,
  prompt_version text not null default 'v1',
  total_sections integer not null default 0,
  completed_sections integer not null default 0,
  failed_sections integer not null default 0,
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz,
  requested_by uuid,
  human_reviewed boolean not null default false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, language, source_version)
);

grant select on public.book_translation_jobs to authenticated;
grant all on public.book_translation_jobs to service_role;

create index if not exists book_translation_jobs_status_idx
  on public.book_translation_jobs (status, next_attempt_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'book_chunks_job_id_fkey') then
    alter table public.book_chunks
      add constraint book_chunks_job_id_fkey
        foreign key (job_id) references public.book_translation_jobs (id) on delete set null;
  end if;
end $$;

create table if not exists public.book_translation_sections (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.book_translation_jobs (id) on delete cascade,
  chunk_index integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (job_id, chunk_index)
);

grant select on public.book_translation_sections to authenticated;
grant all on public.book_translation_sections to service_role;

create index if not exists book_translation_sections_claim_idx
  on public.book_translation_sections (job_id, status, next_attempt_at);

create table if not exists public.book_translation_guides (
  book_id uuid primary key references public.books (id) on delete cascade,
  voice_and_register text,
  character_notes text,
  terminology jsonb not null default '{}'::jsonb,
  setting_context text,
  target_conventions text,
  tone_instructions text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

grant select on public.book_translation_guides to authenticated;
grant all on public.book_translation_guides to service_role;

create table if not exists public.author_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pen_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.author_profiles to anon;
grant select, insert, update on public.author_profiles to authenticated;
grant all on public.author_profiles to service_role;

alter table public.author_profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'author_profiles' and policyname = 'author_profiles_public_read'
  ) then
    create policy author_profiles_public_read on public.author_profiles
      for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'author_profiles' and policyname = 'author_profiles_owner_write'
  ) then
    create policy author_profiles_owner_write on public.author_profiles
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'author_profiles' and policyname = 'author_profiles_owner_update'
  ) then
    create policy author_profiles_owner_update on public.author_profiles
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.translation_reports (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  language text not null,
  chunk_index integer not null,
  reporter_id uuid not null,
  reason text not null,
  status text not null default 'open'
    check (status in ('open', 'triaged', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

grant select, insert on public.translation_reports to authenticated;
grant all on public.translation_reports to service_role;

alter table public.translation_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'translation_reports' and policyname = 'translation_reports_insert_own'
  ) then
    create policy translation_reports_insert_own on public.translation_reports
      for insert with check (auth.uid() = reporter_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'translation_reports' and policyname = 'translation_reports_read_own_or_author'
  ) then
    create policy translation_reports_read_own_or_author on public.translation_reports
      for select using (
        auth.uid() = reporter_id
        or exists (
          select 1 from public.books b
          where b.id = translation_reports.book_id and b.author_id = auth.uid()
        )
      );
  end if;
end $$;

alter table public.book_translation_jobs enable row level security;
alter table public.book_translation_sections enable row level security;
alter table public.book_translation_guides enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'book_translation_jobs' and policyname = 'book_translation_jobs_owner_read'
  ) then
    create policy book_translation_jobs_owner_read on public.book_translation_jobs
      for select using (
        exists (select 1 from public.books b where b.id = book_translation_jobs.book_id and b.author_id = auth.uid())
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'book_translation_sections' and policyname = 'book_translation_sections_owner_read'
  ) then
    create policy book_translation_sections_owner_read on public.book_translation_sections
      for select using (
        exists (
          select 1 from public.book_translation_jobs j
          join public.books b on b.id = j.book_id
          where j.id = book_translation_sections.job_id and b.author_id = auth.uid()
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'book_translation_guides' and policyname = 'book_translation_guides_owner_read'
  ) then
    create policy book_translation_guides_owner_read on public.book_translation_guides
      for select using (
        exists (select 1 from public.books b where b.id = book_translation_guides.book_id and b.author_id = auth.uid())
      );
  end if;
end $$;
