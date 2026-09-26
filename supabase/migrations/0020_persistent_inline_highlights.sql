-- Persist exact inline highlight anchors for Reader V2.
-- Existing highlights remain valid: offsets are nullable and legacy rows can
-- still be rendered by matching highlight_text.

begin;

alter table public.book_highlights
  add column if not exists start_offset integer,
  add column if not exists end_offset integer;

alter table public.book_highlights
  drop constraint if exists book_highlights_offsets_check;

alter table public.book_highlights
  add constraint book_highlights_offsets_check
  check (
    (start_offset is null and end_offset is null)
    or
    (
      start_offset is not null
      and end_offset is not null
      and start_offset >= 0
      and end_offset > start_offset
    )
  );

commit;
