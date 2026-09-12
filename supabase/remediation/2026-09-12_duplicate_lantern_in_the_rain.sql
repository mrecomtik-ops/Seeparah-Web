-- DATA REMEDIATION — requires human sign-off. Not applied automatically.
--
-- FINDING (verified live against the connected Supabase project on
-- 2026-09-12, read-only queries, no data changed):
--
-- The live "books" table has two rows for the same work:
--   1. id 22222222-2222-2222-2222-222222222222 — the seeded canonical
--      entry. author_id is null (seed data). access_type = 'paid',
--      $4.99/month. created_at 2026-02-01.
--   2. id c144e57c-2065-4e0f-a8d2-8548774f026e — same title ("The Lantern
--      in the Rain"), same author name ("Amina Rahman"), byte-identical
--      description to the app's built-in "Load sample book" text
--      (SAMPLE_MANUSCRIPT_SUMMARY in src/lib/data.ts). author_id is a real
--      auth user (4578aa11-4cfa-4762-9788-934bc04a0e19), access_type =
--      'free' (no premium label). created_at 2026-09-11, i.e. created by
--      someone using the real publish flow with the sample-manuscript
--      shortcut, one day before this audit.
--
-- This is the exact "duplicate catalog entry, different cover treatment,
-- different premium label" bug reported. It is real production data, not a
-- demo-mode artifact — the app-level fix (see src/lib/catalog.ts,
-- dedupeAgainstSeed) only prevents this from happening in the local/demo
-- fallback path going forward; it does not touch this existing live row.
--
-- Verified before proposing this fix (all read-only, run 2026-09-12):
--   - book_chunks for c144e57c...: 10 rows, English only.
--   - user_subscriptions, book_shelves, book_highlights, reading_progress
--     referencing c144e57c...: zero rows in every table.
-- So no reader has any saved state pointing at this row.
--
-- RECOMMENDATION: unpublish, don't delete. This preserves the row (and its
-- chunks) in case the owning author actually meant to publish their own
-- draft and just reused the sample text/title by mistake — an admin or the
-- author can rename/republish it, or delete it outright, once confirmed.
-- This script does NOT delete anything.
--
-- Before running: confirm SELECT above still shows zero dependent rows
-- (a reader could have interacted with it since 2026-09-12), and confirm
-- with the account owner (4578aa11-4cfa-4762-9788-934bc04a0e19) if
-- possible.

update public.books
set status = 'unpublished'
where id = 'c144e57c-2065-4e0f-a8d2-8548774f026e'
  and status = 'published';
