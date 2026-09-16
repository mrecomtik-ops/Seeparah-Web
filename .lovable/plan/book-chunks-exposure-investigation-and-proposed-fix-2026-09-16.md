# book_chunks exposure — investigation and proposed fix

## 1. What I checked (live, read-only)

Connected backend: project `unxbomcifoqfqqwpifbe` (the single Lovable Cloud instance
serving preview and production). Verified by connecting directly and by an
anonymous public-key REST call against the same project.

Current rules on the two tables, exactly as they exist right now:

| Table | Policy | Command | Roles | Condition |
|---|---|---|---|---|
| books | Books are publicly readable | SELECT | anon, authenticated | `true` |
| books | Authors can publish books | INSERT | authenticated | `auth.uid() = author_id` |
| books | Authors can update their own books | UPDATE | authenticated | `auth.uid() = author_id` (both sides) |
| books | Authors can delete their own books | DELETE | authenticated | `auth.uid() = author_id` |
| book_chunks | Chunks are publicly readable | SELECT | anon, authenticated | `true` |
| book_chunks | Book authors can add chunks | INSERT | authenticated | parent book owned by caller |

Grants: `anon`, `authenticated` and `service_role` each hold full
`SELECT/INSERT/UPDATE/DELETE` on both tables. There are no other policies,
no `FOR ALL` policy, and no views over these tables.

## 2. Is the finding current? Yes — but the framing is wrong

Live evidence, no private text displayed:

- An anonymous caller with only the public key can list all 32 stored pages.
- It can fetch a page of the one `access_type='paid'` book (returned
  `book_id` + `chunk_index` only; content deliberately not printed).

So the *mechanism* the scanner describes is real. The *conclusion* is not: the
paid flag is dormant during the free launch, and the server-side reader already
refuses to treat anything as paywalled while monetization is off. Payment
gating is not the fix and will not be added.

The actual risk the same `USING (true)` creates is different and worse:
**any book whose `status` is not `published` — a draft manuscript, one awaiting
review, an unpublished or withdrawn title — is fully readable by anyone who has
or guesses its id.** Today the catalog happens to contain only published books
(4 free, 1 paid), so nothing private is exposed at this moment; the first
manuscript an author drafts is exposed the second it is saved.

## 3. Database vs. repository state

The live database is at the pre-migration baseline: only `books`,
`book_chunks`, `book_highlights`, `book_shelves`, `reading_progress`,
`user_subscriptions`. `book_chunks` still has only
`book_id, language, chunk_index, content`. None of `0000`–`0007` have been
applied, so there is no `translation_requests`, no per-edition chunk status,
no admin role tables.

This matters for scope: reader-specific translation grants and edition review
state cannot be enforced in the database yet, because the columns and tables
they depend on do not exist there. They are enforced today in
`src/lib/reader.server.ts`, which runs privileged and does its own checks
(catalog gate first, then monetization, then per-reader translation grant).

## 4. Proposed fix: apply the existing `0000` hotfix, unchanged

`supabase/migrations/0000_hotfix_current_books_rls.sql` is already written for
exactly this and matches the live schema. No competing migration, no rewrite,
no blanket "apply everything".

What it does:

- Logs and drops **every** existing policy on both tables (so the permissive
  `USING (true)` is removed, not shadowed), then recreates a complete set.
- `books` SELECT: `status = 'published' OR author_id = auth.uid()`.
- `book_chunks` SELECT: parent book is published, or owned by the caller.
- Revokes write grants from `anon`; narrows author `UPDATE` on `books` to
  content columns only; removes `UPDATE`/`DELETE` on `book_chunks` from
  `authenticated`.
- Blocks self-publishing: authors may only insert/move a book to
  `draft`/`in_review`/`unpublished`.
- Preconditions abort and postconditions roll back the whole file if the
  resulting policy set is not exactly the intended one.

Effect against the stated goals: free-launch public reading of the 5 published
books is unchanged for anonymous visitors; drafts and in-review work stop being
publicly readable; authors keep access to their own material; the privileged
server path (reader, translation, admin) bypasses RLS and continues to rely on
its own checks in `reader.server.ts`, which already gate unpublished books and
Hindi/Arabic translation grants.

## 5. Two blockers I found that are not fixed by this migration

1. **Publishing is already broken in production.** `publishBook` in
   `src/lib/library.ts` inserts chunk rows with a `status` column that does not
   exist in the live database, so saving a manuscript fails today, before any
   policy change. Needs fixing separately (drop that field, or apply `0001`).
2. Per-reader translation grants have no database-level enforcement until
   `0001`/`0005`/`0007` are applied; until then they hold only on the
   privileged server path.

## 6. Verification plan before and after applying

Before: take the backup described in the operator guide §8.1.

After applying, re-run and confirm:
- policy list on both tables matches the 5 expected policies;
- anonymous REST still returns the 5 published books and their pages;
- a temporary non-published book row is invisible to anonymous REST, and its
  pages return zero rows (row created and removed in the same check, no
  manuscript text printed);
- the reader page for a published book still loads.

Recovery if anything regresses: the migration runs in a single transaction and
rolls itself back on a failed postcondition; if a later problem appears, the
prior policy set is recorded verbatim in section 1 above and can be restored.

## 7. What I need from you

Confirm and I will apply `0000` as written, run the verification above, and
report the results. I will not mark the scanner finding resolved on the
paid-content reasoning — the honest resolution note is "free launch, public
reading intentional; unpublished content now gated".
