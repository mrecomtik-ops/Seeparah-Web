-- Seeparah 113-cover book batch: source-repair rollback snapshots.
-- Mirrors the guarded production migration applied 2026-11-11.
-- This private table contains full original text/metadata for four recovered editions.
-- Do not expose it to anon, authenticated, reader functions, or public REST.
-- The actual manuscript repairs were applied separately using source-specific,
-- guarded transactions with before/after MD5 assertions and author/edition checks.
create table if not exists public.qa_20261111_source_repair_backups (
  book_id uuid primary key references public.books(id),
  import_key text not null,
  original_book jsonb not null,
  original_chunks jsonb not null,
  original_nodes jsonb not null,
  original_text_md5 text not null,
  source_evidence_url text not null,
  backed_up_at timestamptz not null default now()
);

alter table public.qa_20261111_source_repair_backups enable row level security;

revoke all on public.qa_20261111_source_repair_backups from public, anon, authenticated;
grant select, insert on public.qa_20261111_source_repair_backups to service_role;
