-- Seeparah — revoke stray DELETE/TRUNCATE grants on books/book_chunks that
-- survived 0000 and 0007.
--
-- ROOT CAUSE: Supabase provisions every new project with platform-level
-- default privileges (`alter default privileges ... grant ... to anon,
-- authenticated`) that apply automatically to any table created in the
-- `public` schema — configured outside this repo's migration files
-- entirely, at the project level, not something any file here ever ran.
-- That default set includes DELETE and TRUNCATE. `0000_hotfix_current_
-- books_rls.sql` and `0007_finalize_access_policies.sql` both carefully
-- scope INSERT/UPDATE down to specific columns and revoke INSERT/UPDATE/
-- DELETE from `anon` entirely, but neither ever revokes TRUNCATE (from
-- anyone, on either table), and neither revokes DELETE from `authenticated`
-- on `books` specifically (0007 line "revoke insert, update on public.books
-- from authenticated" — delete was never included in that list; book_chunks
-- DID get its authenticated-delete revoked, by contrast, which is why the
-- gap found live was asymmetric: books.authenticated.DELETE,
-- plus TRUNCATE for anon+authenticated on both tables).
--
-- FOUND: live, read-only, against wxldqxuxpjurttspbxok, 2026-09-20, via
-- information_schema.role_table_grants after 0007 was applied and verified:
--   book_chunks | anon          | TRUNCATE
--   book_chunks | authenticated | TRUNCATE
--   books       | anon          | TRUNCATE
--   books       | authenticated | DELETE
--   books       | authenticated | TRUNCATE
--
-- SCOPE: table-level DELETE/TRUNCATE only. Does not touch the column-level
-- INSERT/UPDATE grants 0007 already scoped correctly (REVOKE DELETE/
-- TRUNCATE is a distinct privilege type from INSERT/UPDATE and cannot
-- affect them). Does not touch `service_role` (not named in any REVOKE
-- below — service-role access is unaffected by design, same as every prior
-- migration in this sequence). Revoking from `public` (the pseudo-role
-- every role implicitly inherits from) is included defensively, even
-- though the live check above did not show any PUBLIC-role row — a REVOKE
-- of a privilege that was never granted is a safe no-op in Postgres.
--
-- APPLY AFTER 0007, without rerunning 0000-0007. Safe to run more than
-- once (REVOKE of an already-revoked privilege is a no-op, not an error).

begin;

do $$
begin
  if to_regclass('public.books') is null then
    raise exception 'Precondition failed: public.books does not exist — aborting';
  end if;
  if to_regclass('public.book_chunks') is null then
    raise exception 'Precondition failed: public.book_chunks does not exist — aborting';
  end if;
end $$;

revoke delete, truncate on public.books from anon;
revoke delete, truncate on public.books from authenticated;
revoke delete, truncate on public.books from public;

revoke delete, truncate on public.book_chunks from anon;
revoke delete, truncate on public.book_chunks from authenticated;
revoke delete, truncate on public.book_chunks from public;

do $$
begin
  if has_table_privilege('anon', 'public.books', 'DELETE') then
    raise exception 'Postcondition failed: anon still has DELETE on public.books';
  end if;
  if has_table_privilege('anon', 'public.books', 'TRUNCATE') then
    raise exception 'Postcondition failed: anon still has TRUNCATE on public.books';
  end if;
  if has_table_privilege('authenticated', 'public.books', 'DELETE') then
    raise exception 'Postcondition failed: authenticated still has DELETE on public.books';
  end if;
  if has_table_privilege('authenticated', 'public.books', 'TRUNCATE') then
    raise exception 'Postcondition failed: authenticated still has TRUNCATE on public.books';
  end if;
  if has_table_privilege('anon', 'public.book_chunks', 'DELETE') then
    raise exception 'Postcondition failed: anon still has DELETE on public.book_chunks';
  end if;
  if has_table_privilege('anon', 'public.book_chunks', 'TRUNCATE') then
    raise exception 'Postcondition failed: anon still has TRUNCATE on public.book_chunks';
  end if;
  if has_table_privilege('authenticated', 'public.book_chunks', 'DELETE') then
    raise exception 'Postcondition failed: authenticated still has DELETE on public.book_chunks';
  end if;
  if has_table_privilege('authenticated', 'public.book_chunks', 'TRUNCATE') then
    raise exception 'Postcondition failed: authenticated still has TRUNCATE on public.book_chunks';
  end if;
  -- Confirm 0007's column-level INSERT/UPDATE grants are untouched by this
  -- file (same counts it postconditioned on: books INSERT 12 cols, books
  -- UPDATE 11 cols, book_chunks INSERT 5 cols, book_chunks UPDATE 0 cols).
  if (
    select count(*) from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'books'
      and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) <> 12 then
    raise exception 'Postcondition failed: books authenticated INSERT column-grant count changed unexpectedly';
  end if;
  if (
    select count(*) from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'books'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ) <> 11 then
    raise exception 'Postcondition failed: books authenticated UPDATE column-grant count changed unexpectedly';
  end if;
  if (
    select count(*) from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'book_chunks'
      and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) <> 5 then
    raise exception 'Postcondition failed: book_chunks authenticated INSERT column-grant count changed unexpectedly';
  end if;
  if exists (
    select 1 from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'book_chunks'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ) then
    raise exception 'Postcondition failed: book_chunks authenticated unexpectedly has an UPDATE column grant';
  end if;
  raise notice 'Postconditions passed: no DELETE/TRUNCATE grant remains for anon/authenticated on books or book_chunks; 0007 column grants unchanged.';
end $$;

commit;
