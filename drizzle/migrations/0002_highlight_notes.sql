alter table public.book_highlights
  add column if not exists note text;
