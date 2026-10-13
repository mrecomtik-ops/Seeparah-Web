alter table public.book_editions drop constraint if exists book_editions_provenance_type_check;
alter table public.book_editions add constraint book_editions_provenance_type_check
  check (provenance_type = any(array[
    'source_text'::text,
    'ai_assisted'::text,
    'human_translation'::text,
    'licensed_translation'::text,
    'public_domain_translation'::text
  ]));
