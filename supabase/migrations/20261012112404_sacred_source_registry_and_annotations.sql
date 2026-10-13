begin;

create table if not exists public.sacred_source_editions (
  id uuid primary key default gen_random_uuid(),
  edition_key text not null unique,
  tradition text not null,
  collection_title text,
  work_title text not null,
  edition_title text not null,
  language text,
  content_role text not null
    check (content_role in ('scripture','translation','commentary','subcommentary','scan','catalogue','other')),
  translator_editor text,
  publisher text,
  version_label text,
  source_url text not null,
  rights_evidence_url text,
  reuse_status text not null,
  source_revision text,
  package_filename text,
  package_library_id text,
  package_sha256 text,
  publication_status text not null
    check (publication_status in ('published','ready','scan_only','source_link_only','unpublished_rights','unpublished_structure')),
  unpublished_reason text,
  book_id uuid references public.books(id) on delete set null,
  reader_language text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sacred_source_files (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.sacred_source_editions(id) on delete cascade,
  source_path text not null,
  source_url text,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint check (bytes is null or bytes >= 0),
  file_role text not null default 'source',
  preservation_encoding text,
  source_bytes_preserved boolean not null default true,
  authoritative_text boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (edition_id, source_path)
);

create table if not exists public.sacred_annotations (
  book_id uuid not null references public.books(id) on delete cascade,
  language text not null,
  canonical_ref text not null,
  annotation_type text not null
    check (annotation_type in ('footnote','commentary','subcommentary','editorial_note')),
  ordinal integer not null default 0 check (ordinal >= 0),
  content text not null,
  source_version integer not null default 1,
  source_path text,
  source_file_sha256 text,
  created_at timestamptz not null default now(),
  primary key (book_id, language, canonical_ref, annotation_type, ordinal)
);

create index if not exists sacred_source_editions_tradition_idx
  on public.sacred_source_editions(tradition, publication_status);
create index if not exists sacred_source_editions_book_idx
  on public.sacred_source_editions(book_id);
create index if not exists sacred_source_files_edition_idx
  on public.sacred_source_files(edition_id);
create index if not exists sacred_annotations_ref_idx
  on public.sacred_annotations(book_id, language, canonical_ref);

alter table public.sacred_source_editions enable row level security;
alter table public.sacred_source_files enable row level security;
alter table public.sacred_annotations enable row level security;

alter table public.books
  add column if not exists source_revision text,
  add column if not exists reuse_notice text,
  add column if not exists source_file_path text,
  add column if not exists source_file_sha256 text,
  add column if not exists editor text;

alter table public.book_editions
  add column if not exists publisher text,
  add column if not exists editor text,
  add column if not exists version_label text,
  add column if not exists reuse_notice text,
  add column if not exists source_file_path text,
  add column if not exists source_file_sha256 text;

alter table public.books drop constraint if exists books_typography_profile_check;
alter table public.books add constraint books_typography_profile_check
  check (typography_profile = any(array[
    'standard'::text, 'scripture_arabic'::text, 'scripture_urdu'::text,
    'scripture_hebrew'::text, 'scripture_indic'::text, 'scripture_greek'::text,
    'scripture_pali'::text, 'scripture_tibetan'::text, 'facsimile_preserving'::text
  ]));

alter table public.book_editions drop constraint if exists book_editions_typography_profile_check;
alter table public.book_editions add constraint book_editions_typography_profile_check
  check (typography_profile = any(array[
    'standard'::text, 'scripture_arabic'::text, 'scripture_urdu'::text,
    'scripture_hebrew'::text, 'scripture_indic'::text, 'scripture_greek'::text,
    'scripture_pali'::text, 'scripture_tibetan'::text, 'facsimile_preserving'::text
  ]));

commit;
