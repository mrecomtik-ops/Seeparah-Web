-- Seeparah Reader V2 — semantic book structure and edition-quality metadata.
--
-- Forward-only migration. Do not edit/reapply migrations 0000–0016.
--
-- WHY
-- The original reader was built around book_chunks as anonymous numbered
-- pages. That makes a 400+ section book difficult to navigate and loses the
-- literary hierarchy already present in EPUBs/source files. Reader V2 keeps
-- book_chunks as the stable text/progress/highlight unit for compatibility,
-- while adding a semantic navigation layer over those chunks:
--
-- Book -> Part/Book/Volume -> Chapter/Story/Poem -> Section -> chunk range.
--
-- This is additive. Existing books keep working through the legacy fallback
-- navigation until semantic nodes are imported for them.

begin;

-- ---------------------------------------------------------------------------
-- 1. Edition/discovery/quality metadata that was previously missing.
-- ---------------------------------------------------------------------------
alter table public.books
  add column if not exists edition_title text,
  add column if not exists edition_year integer,
  add column if not exists publisher text,
  add column if not exists isbn text,
  add column if not exists source_scan_id text,
  add column if not exists original_publication_year integer,
  add column if not exists word_count integer,
  add column if not exists estimated_reading_minutes integer,
  add column if not exists structure_review_status text not null default 'pending',
  add column if not exists cleanup_review_status text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'books_edition_year_check'
  ) then
    alter table public.books add constraint books_edition_year_check
      check (edition_year is null or edition_year between 1 and 3000);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'books_original_publication_year_check'
  ) then
    alter table public.books add constraint books_original_publication_year_check
      check (original_publication_year is null or original_publication_year between 1 and 3000);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'books_word_count_check'
  ) then
    alter table public.books add constraint books_word_count_check
      check (word_count is null or word_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'books_estimated_reading_minutes_check'
  ) then
    alter table public.books add constraint books_estimated_reading_minutes_check
      check (estimated_reading_minutes is null or estimated_reading_minutes >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'books_structure_review_status_check'
  ) then
    alter table public.books add constraint books_structure_review_status_check
      check (structure_review_status in ('pending', 'approved', 'changes_requested', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'books_cleanup_review_status_check'
  ) then
    alter table public.books add constraint books_cleanup_review_status_check
      check (cleanup_review_status in ('pending', 'approved', 'changes_requested', 'rejected'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Semantic structure overlay.
--
-- start/end_chunk_index point into the existing book_chunks edition. This
-- preserves every current progress/highlight reference while giving the
-- reader real Part/Chapter/Section names.
-- ---------------------------------------------------------------------------
create table if not exists public.book_structure_nodes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  language text not null,
  source_version integer not null default 1,
  node_key text not null,
  parent_node_key text,
  node_type text not null,
  title text,
  ordinal integer not null,
  depth integer not null default 0,
  start_chunk_index integer not null,
  end_chunk_index integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint book_structure_nodes_type_check check (
    node_type in (
      'front_matter',
      'part',
      'book',
      'volume',
      'chapter',
      'story',
      'section',
      'act',
      'scene',
      'poem',
      'canto',
      'stanza',
      'paragraph',
      'footnote',
      'endnote',
      'back_matter'
    )
  ),
  constraint book_structure_nodes_ordinal_check check (ordinal >= 0),
  constraint book_structure_nodes_depth_check check (depth >= 0),
  constraint book_structure_nodes_chunk_range_check check (
    start_chunk_index >= 0 and end_chunk_index >= start_chunk_index
  ),
  unique (book_id, language, source_version, node_key)
);

create index if not exists book_structure_nodes_reader_idx
  on public.book_structure_nodes (
    book_id,
    language,
    source_version,
    ordinal
  );

create index if not exists book_structure_nodes_chunk_range_idx
  on public.book_structure_nodes (
    book_id,
    language,
    source_version,
    start_chunk_index,
    end_chunk_index
  );

-- Server functions use the service role and therefore bypass RLS. Keep the
-- table closed to direct anon/authenticated REST reads for now; the reader
-- receives only the safe navigation projection from reader.server.ts.
alter table public.book_structure_nodes enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Touch updated_at automatically on structure edits.
-- ---------------------------------------------------------------------------
create or replace function public.touch_book_structure_node_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists book_structure_nodes_touch_updated_at
  on public.book_structure_nodes;
create trigger book_structure_nodes_touch_updated_at
  before update on public.book_structure_nodes
  for each row execute function public.touch_book_structure_node_updated_at();

commit;

-- VERIFY AFTER APPLYING:
--
-- select column_name
-- from information_schema.columns
-- where table_schema='public' and table_name='books'
--   and column_name in (
--     'edition_title','edition_year','publisher','isbn','source_scan_id',
--     'original_publication_year','word_count','estimated_reading_minutes',
--     'structure_review_status','cleanup_review_status'
--   )
-- order by column_name;
--
-- select to_regclass('public.book_structure_nodes');
--
-- Existing books intentionally have zero structure rows until their exact
-- source hierarchy is reviewed/imported. Reader V2 falls back safely rather
-- than inventing semantic chapter boundaries.
