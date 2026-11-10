-- Seeparah reader freehand marks: per-user, edition-language and physical
-- layout page. Never stores/changes book text, source assets or highlights.
create table if not exists public.book_page_ink (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  language text not null check (length(language) between 1 and 80),
  page_key text not null check (length(page_key) between 1 and 180),
  strokes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(strokes)='array'
           and jsonb_array_length(strokes)<=250
           and pg_column_size(strokes)<=131072),
  updated_at timestamptz not null default now(),
  primary key(user_id,book_id,language,page_key)
);
create index if not exists book_page_ink_book_idx on public.book_page_ink(book_id);
alter table public.book_page_ink enable row level security;
revoke all on public.book_page_ink from public,anon,authenticated;
grant select,insert,update,delete on public.book_page_ink to authenticated;
create policy page_ink_read_own on public.book_page_ink
  for select to authenticated using (user_id=(select auth.uid()));
create policy page_ink_insert_own on public.book_page_ink
  for insert to authenticated with check (user_id=(select auth.uid()));
create policy page_ink_update_own on public.book_page_ink
  for update to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
create policy page_ink_delete_own on public.book_page_ink
  for delete to authenticated using (user_id=(select auth.uid()));
