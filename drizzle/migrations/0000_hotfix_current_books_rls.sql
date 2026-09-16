-- Seeparah — hotfix for the CURRENT production books/book_chunks access
-- rules (supabase/migrations/0000_hotfix_current_books_rls.sql). Applied
-- verbatim except that the file's own begin;/commit; are omitted because
-- the migration runner already wraps this in a single transaction.

do $$
begin
  if to_regclass('public.books') is null then
    raise exception 'Precondition failed: public.books does not exist — aborting, nothing changed';
  end if;
  if to_regclass('public.book_chunks') is null then
    raise exception 'Precondition failed: public.book_chunks does not exist — aborting, nothing changed';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'status'
  ) then
    raise exception 'Precondition failed: public.books.status does not exist — aborting, nothing changed';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'author_id'
  ) then
    raise exception 'Precondition failed: public.books.author_id does not exist — aborting, nothing changed';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'book_chunks' and column_name = 'book_id'
  ) then
    raise exception 'Precondition failed: public.book_chunks.book_id does not exist — aborting, nothing changed';
  end if;
end $$;

-- 1. Log, then drop, EVERY existing policy on books/book_chunks.
do $$
declare
  pol record;
  dropped_count integer := 0;
begin
  for pol in
    select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename in ('books', 'book_chunks')
  loop
    raise notice 'Dropping existing policy: table=%.% name=% cmd=% permissive=% roles=% using=% with_check=%',
      pol.schemaname, pol.tablename, pol.policyname, pol.cmd, pol.permissive, pol.roles, pol.qual, pol.with_check;
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    dropped_count := dropped_count + 1;
  end loop;
  raise notice 'Dropped % existing polic(ies) on books/book_chunks (all commands, including any FOR ALL).', dropped_count;
end $$;

-- 2. Table/column grants.
revoke insert, update, delete on public.books from anon;
revoke insert, update, delete on public.book_chunks from anon;

revoke update on public.books from authenticated;
grant update (
  title, author, cover_url, available_languages, total_chunks,
  source_language, description, genre, status, access_type,
  subscription_price_usd
) on public.books to authenticated;

revoke update, delete on public.book_chunks from authenticated;

alter table public.books enable row level security;
alter table public.book_chunks enable row level security;

-- 3. books: SELECT — public catalog + the owning author.
create policy books_read_access on public.books
for select
using (
  status = 'published'
  or author_id = auth.uid()
);

-- 4. books: INSERT — never already at 'published'.
create policy books_author_insert on public.books
for insert
with check (
  author_id = auth.uid()
  and status in ('draft', 'in_review', 'unpublished')
);

-- 5. books: UPDATE — owner only, status limited to pre-review values.
create policy books_author_update on public.books
for update
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and status in ('draft', 'in_review', 'unpublished')
);

-- 6. book_chunks: SELECT — gated on the parent book.
create policy book_chunks_read_access on public.book_chunks
for select
using (
  exists (
    select 1 from public.books b
    where b.id = book_chunks.book_id
      and (b.status = 'published' or b.author_id = auth.uid())
  )
);

-- 7. book_chunks: INSERT — own, not-yet-published book only.
create policy book_chunks_author_insert on public.book_chunks
for insert
with check (
  exists (
    select 1 from public.books b
    where b.id = book_chunks.book_id
      and b.author_id = auth.uid()
      and b.status <> 'published'
  )
);

-- 8. Postconditions.
do $$
declare
  expected text[] := array[
    'books.books_read_access', 'books.books_author_insert', 'books.books_author_update',
    'book_chunks.book_chunks_read_access', 'book_chunks.book_chunks_author_insert'
  ];
  item text;
  tbl text;
  pname text;
begin
  foreach item in array expected loop
    tbl := split_part(item, '.', 1);
    pname := split_part(item, '.', 2);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl and policyname = pname
    ) then
      raise exception 'Postcondition failed: expected policy %.% is missing after this migration ran — rolling back everything in this file', tbl, pname;
    end if;
  end loop;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'books' and c.relrowsecurity
  ) then
    raise exception 'Postcondition failed: RLS is not enabled on public.books — rolling back';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'book_chunks' and c.relrowsecurity
  ) then
    raise exception 'Postcondition failed: RLS is not enabled on public.book_chunks — rolling back';
  end if;
  raise notice 'Postconditions passed: all 5 expected policies exist, RLS enabled on both tables.';
end $$;
