-- DATA REMEDIATION — requires human sign-off. Not applied automatically.
--
-- FINDING (from a manual QA pass of the live site, 2026-09-14): the public
-- catalog currently overclaims in three ways, all confirmed against this
-- codebase's own review of the connected project (no service-role access
-- was available to re-run these exact counts live — the queries below are
-- the read-only checks to run first, before applying anything):
--
--   1. `available_languages` on several books lists languages with NO
--      actual `book_chunks` content — e.g. "Pride and Prejudice" (id
--      11111111-1111-1111-1111-111111111111) lists all 10 launch
--      languages but the site only ever renders 4 pages in whichever
--      language actually has rows. A language badge that doesn't
--      correspond to real, readable content misleads readers before they
--      ever open the book.
--   2. "The Lantern in the Rain" (id 22222222-2222-2222-2222-222222222222)
--      is seeded with `access_type = 'paid'`, `subscription_price_usd =
--      4.99` — a fake price on a manuscript that only ever existed to
--      demonstrate the "Load sample book" button in the publish form
--      (see SAMPLE_MANUSCRIPT_TITLE/SUMMARY/CHAPTERS in src/lib/data.ts).
--      It has no real author_id. This is inconsistent with the free
--      launch and with every other seed book being free.
--   3. Two catalog rows exist for "The Lantern in the Rain": this seed
--      row (22222222-...) and a real submission by a real author
--      (4578aa11-4cfa-4762-9788-934bc04a0e19) at id
--      c144e57c-2065-4e0f-a8d2-8548774f026e, created by using the "Load
--      sample book" shortcut on the real publish form. Both are visible
--      in the public library side by side.
--
-- ---------------------------------------------------------------------------
-- STEP 0 — read-only checks. Run these first and read the output before
-- applying anything below; the UPDATE in step 1 is intentionally dynamic
-- (derives the correct value from real book_chunks rows rather than a
-- hardcoded guess) specifically so it stays correct as real content is
-- added, but you should still see what it's about to change.
-- ---------------------------------------------------------------------------
select
  b.id, b.title, b.status, b.available_languages as current_available_languages,
  (
    select array_agg(distinct bc.language order by bc.language)
    from public.book_chunks bc
    where bc.book_id = b.id and length(trim(bc.content)) > 0
  ) as languages_with_real_content
from public.books b
where b.status = 'published'
order by b.title;

-- ---------------------------------------------------------------------------
-- STEP 1 — correct `available_languages` to match real content, for every
-- published book (not just the four seed rows) — this is a general
-- correctness fix, not a one-off patch for specific IDs, so it stays
-- correct going forward without needing to be re-run by hand for every
-- new book. A language only ever appears here if a book_chunks row for
-- it actually has non-empty content.
-- ---------------------------------------------------------------------------
update public.books b
set available_languages = coalesce((
  select array_agg(distinct bc.language order by bc.language)
  from public.book_chunks bc
  where bc.book_id = b.id and length(trim(bc.content)) > 0
), array[]::text[])
where b.status = 'published';

-- ---------------------------------------------------------------------------
-- STEP 2 — remove the fake premium price from the seed "Lantern in the
-- Rain" manuscript. It was never a real paid title; the free-launch
-- catalog should not show it as one regardless of what
-- monetization_enabled is set to later.
-- ---------------------------------------------------------------------------
update public.books
set access_type = 'free', subscription_price_usd = null
where id = '22222222-2222-2222-2222-222222222222'
  and access_type = 'paid';

-- ---------------------------------------------------------------------------
-- STEP 3 — the duplicate. TWO OPTIONS — pick one, this script does NOT
-- decide for you. This supersedes the recommendation in the earlier
-- 2026-09-12_duplicate_lantern_in_the_rain.sql (also in this directory,
-- also never applied), which proposed unpublishing the REAL author's
-- duplicate (c144e57c-...) and keeping the seed row as canonical. Given
-- this is a fake demo manuscript with no real author behind it, and the
-- other row is a genuine account's actual submission, the more defensible
-- default is the other way around — but this is an editorial call, not a
-- purely technical one, and either is safe to apply (neither deletes
-- anything).
--
-- OPTION A (recommended): retire the fake seed row, let the real
-- submission be the one real readers see (and, once the admin review
-- system in this branch is deployed, go through normal review like any
-- other author submission).
--
--   update public.books
--   set status = 'unpublished'
--   where id = '22222222-2222-2222-2222-222222222222'
--     and status = 'published';
--
-- OPTION B: keep the seed row canonical (matches the 2026-09-12 script's
-- original direction) and unpublish the real duplicate instead, pending
-- that author renaming/republishing their own distinct work:
--
--   update public.books
--   set status = 'unpublished'
--   where id = 'c144e57c-2065-4e0f-a8d2-8548774f026e'
--     and status = 'published';
--
-- Before running either: re-check for dependent rows on whichever id you
-- are about to unpublish (a reader may have interacted with either row
-- since 2026-09-12):
--
--   select
--     (select count(*) from public.user_subscriptions where book_id = '<id>') as subs,
--     (select count(*) from public.book_shelves where book_id = '<id>') as shelves,
--     (select count(*) from public.book_highlights where book_id = '<id>') as highlights,
--     (select count(*) from public.reading_progress where book_id = '<id>') as progress;
