-- Seeparah — translation pipeline, editorial review, author profiles, and
-- reporting. Additive and backward compatible: every existing row keeps
-- working under its current implicit meaning (see defaults below).
--
-- HOW TO APPLY
--   Review this file, then run it against the project's Supabase database
--   (SQL editor, or `supabase db push` if the project is linked locally).
--   This repo has no supabase/migrations history and is not linked to a
--   local Postgres instance, so this file has NOT been applied. Apply it in
--   a maintenance window; it only adds columns/tables/indexes, it does not
--   drop or rewrite existing data.
--
-- WHAT THIS DOES NOT DO
--   It does not touch existing Row Level Security policies on `books`,
--   `book_chunks`, `book_shelves`, `reading_progress`, or
--   `user_subscriptions` — those policies are defined outside this repo
--   (no migration history exists to introspect them safely from here) and
--   must be reviewed directly in the Supabase dashboard. See the
--   RECOMMENDED POLICY section at the bottom of this file for the specific
--   change needed to stop premium/unpublished chunk content from being
--   directly selectable by the anon/authenticated REST role.

-- ---------------------------------------------------------------------------
-- 1. Immutable source versions
-- ---------------------------------------------------------------------------
-- A book's manuscript can be revised. Existing translations stay valid for
-- the source_version they were made from; a source edit bumps this counter
-- so new translation jobs know which revision they're translating and old
-- published editions are never silently mixed with new source text.
alter table public.books
  add column if not exists source_version integer not null default 1;

-- ---------------------------------------------------------------------------
-- 2. book_chunks: status + provenance
-- ---------------------------------------------------------------------------
-- Every row that already exists represents content that was already being
-- served to readers, so it defaults to 'published' — this migration does
-- not hide anything that was already visible.
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

-- One row per (book, language, chunk, source_version): lets a resumed job
-- upsert its own in-progress rows without colliding with the currently
-- published edition of the same page.
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

-- ---------------------------------------------------------------------------
-- 3. Translation jobs (one per book+language+source_version edition)
-- ---------------------------------------------------------------------------
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
  -- Unique job identity: prevents duplicate work for the same edition.
  unique (book_id, language, source_version)
);

create index if not exists book_translation_jobs_status_idx
  on public.book_translation_jobs (status, next_attempt_at);

alter table public.book_chunks
  add constraint book_chunks_job_id_fkey
    foreign key (job_id) references public.book_translation_jobs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. Section-level checkpoints (bounded-concurrency worker resumes from here)
-- ---------------------------------------------------------------------------
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

create index if not exists book_translation_sections_claim_idx
  on public.book_translation_sections (job_id, status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- 5. Book-level translation guide (voice, terminology, cultural context)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 6. Author profiles (pen name, bio, avatar — public author page)
-- ---------------------------------------------------------------------------
create table if not exists public.author_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pen_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- ---------------------------------------------------------------------------
-- 7. Reader-reported translation issues
-- ---------------------------------------------------------------------------
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

-- book_translation_jobs / book_translation_sections / book_translation_guides:
-- readable by the owning author, writable only by service-role server code
-- (the worker and review endpoints run with the service role and therefore
-- bypass RLS by design — see src/lib/translation.server.ts).
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

-- ---------------------------------------------------------------------------
-- RECOMMENDED POLICY CHANGE (review before applying — see header note)
-- ---------------------------------------------------------------------------
-- The app's own server functions now enforce the paywall server-side
-- (src/lib/reader.server.ts) and only ever request status = 'published'
-- rows. That closes the gap where this app fetched full premium chunk
-- content to the browser before checking access. It does NOT stop someone
-- from querying the public Supabase REST endpoint directly with the
-- publishable key, because RLS is the only real boundary there.
--
-- Run this once you've confirmed it doesn't conflict with an existing
-- policy of the same purpose (`select * from pg_policies where
-- tablename = 'book_chunks'` first):
--
--   drop policy if exists "<existing permissive select policy name>" on public.book_chunks;
--
--   create policy book_chunks_read_access on public.book_chunks
--   for select
--   using (
--     status = 'published'
--     and (
--       chunk_index = 0
--       or exists (
--         select 1 from public.books b
--         where b.id = book_chunks.book_id and b.access_type <> 'paid'
--       )
--       or exists (
--         select 1 from public.user_subscriptions s
--         where s.book_id = book_chunks.book_id
--           and s.user_id = auth.uid()
--           and s.status = 'active'
--           and (s.expires_at is null or s.expires_at > now())
--       )
--       or exists (
--         select 1 from public.books b
--         where b.id = book_chunks.book_id and b.author_id = auth.uid()
--       )
--     )
--   );
