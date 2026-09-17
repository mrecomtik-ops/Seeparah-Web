do $$
begin
  if to_regclass('public.books') is null then
    raise exception 'Precondition failed: public.books does not exist — aborting';
  end if;
  if to_regclass('public.book_chunks') is null then
    raise exception 'Precondition failed: public.book_chunks does not exist — aborting';
  end if;
  if to_regprocedure('public.is_admin(text[])') is null then
    raise exception 'Precondition failed: public.is_admin(text[]) does not exist — apply 0004 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'rights_status'
  ) then
    raise exception 'Precondition failed: public.books.rights_status does not exist — apply 0005 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'book_chunks' and column_name = 'status'
  ) then
    raise exception 'Precondition failed: public.book_chunks.status does not exist — apply 0001 first';
  end if;
  if to_regclass('public.translation_requests') is null then
    raise exception 'Precondition failed: public.translation_requests does not exist — apply 0006 first';
  end if;
  if to_regclass('public.user_subscriptions') is null then
    raise exception 'Precondition failed: public.user_subscriptions does not exist (expected to predate this change)';
  end if;
end $$;

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
    raise notice 'Dropping existing policy: table=%.% name=% cmd=%',
      pol.schemaname, pol.tablename, pol.policyname, pol.cmd;
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    dropped_count := dropped_count + 1;
  end loop;
  raise notice 'Dropped % existing polic(ies) on books/book_chunks.', dropped_count;
end $$;

revoke insert, update, delete on public.books from anon;
revoke insert, update, delete on public.book_chunks from anon;

revoke insert, update on public.books from authenticated;
grant insert (
  title, author, author_id, cover_url, available_languages, total_chunks,
  source_language, description, genre, status, access_type,
  subscription_price_usd
) on public.books to authenticated;
grant update (
  title, author, cover_url, available_languages, total_chunks,
  source_language, description, genre, status, access_type,
  subscription_price_usd
) on public.books to authenticated;

revoke insert, update, delete on public.book_chunks from authenticated;
grant insert (
  book_id, language, chunk_index, content, status
) on public.book_chunks to authenticated;

alter table public.books enable row level security;
alter table public.book_chunks enable row level security;

create policy books_read_access on public.books
for select
using (
  status = 'published'
  or author_id = auth.uid()
  or public.is_admin(array['owner', 'administrator', 'editor'])
);

create policy books_author_insert on public.books
for insert
with check (
  author_id = auth.uid()
  and status in ('draft', 'in_review', 'unpublished')
);

create policy books_author_update on public.books
for update
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and status in ('draft', 'in_review', 'unpublished')
);

create policy book_chunks_read_access on public.book_chunks
for select
using (
  status = 'published'
  and exists (
    select 1 from public.books b
    where b.id = book_chunks.book_id
      and (
        b.status = 'published'
        or b.author_id = auth.uid()
        or public.is_admin(array['owner', 'administrator', 'editor'])
      )
  )
  and (
    chunk_index = 0
    or exists (
      select 1 from public.books b
      where b.id = book_chunks.book_id and b.access_type <> 'paid'
    )
    or exists (
      select 1 from public.books b
      where b.id = book_chunks.book_id and b.author_id = auth.uid()
    )
    or exists (
      select 1 from public.user_subscriptions s
      where s.book_id = book_chunks.book_id
        and s.user_id = auth.uid()
        and s.status = 'active'
        and (s.expires_at is null or s.expires_at > now())
    )
  )
  and (
    book_chunks.language not in ('Hindi', 'Arabic')
    or exists (
      select 1 from public.books b
      where b.id = book_chunks.book_id and b.source_language = book_chunks.language
    )
    or exists (
      select 1 from public.books b
      where b.id = book_chunks.book_id and b.author_id = auth.uid()
    )
    or exists (
      select 1 from public.translation_requests tr
      where tr.book_id = book_chunks.book_id
        and tr.language = book_chunks.language
        and tr.requester_id = auth.uid()
        and tr.status = 'granted'
    )
  )
);

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
      raise exception 'Postcondition failed: expected policy %.% is missing', tbl, pname;
    end if;
  end loop;
  if exists (
    select 1 from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'books'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
      and column_name in ('rights_status', 'edition_review_status', 'reviewed_by', 'reviewed_at', 'review_notes', 'rejection_reason')
  ) then
    raise exception 'Postcondition failed: authenticated still has UPDATE on a protected rights/review column';
  end if;
  raise notice 'Postconditions passed.';
end $$;
