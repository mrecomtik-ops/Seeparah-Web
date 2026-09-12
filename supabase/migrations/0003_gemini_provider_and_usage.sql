-- Explicit provider tracking + usage/cost visibility for the translation
-- pipeline, switching the primary provider to Gemini (called directly via
-- the official @google/genai SDK, not proxied through a third party).
-- Additive only; existing rows default to provider='gemini' as a label,
-- but nothing pre-existing is reprocessed or reinterpreted — see the
-- launch report for why (no live translated editions existed yet).

alter table public.book_chunks
  add column if not exists provider text;

alter table public.book_translation_jobs
  add column if not exists provider text not null default 'gemini',
  add column if not exists total_prompt_tokens bigint not null default 0,
  add column if not exists total_output_tokens bigint not null default 0;

alter table public.book_translation_sections
  add column if not exists prompt_tokens integer,
  add column if not exists output_tokens integer;

comment on column public.book_translation_jobs.provider is
  'Explicit provider label (e.g. gemini). Provider changes are recorded per job, never silently substituted at read time.';
