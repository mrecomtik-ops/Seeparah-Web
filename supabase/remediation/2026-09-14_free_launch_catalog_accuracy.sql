-- DATA REMEDIATION — requires human sign-off with service-role/dashboard
-- access. NOT applied automatically by this file, and NOT applied by this
-- session. Read the whole file, especially the "WHAT THIS SCRIPT CANNOT
-- VERIFY" and "DEPENDENCY CHECK" sections, before running anything below.
--
-- Revision 3 (2026-09-14, third pass) — supersedes Revision 2 after review
-- found it overclaimed evidence it didn't actually have. What changed:
--   1. Confirmed, with live schema probes (not assumed from migration
--      files), that migrations 0001/0005/0006/0007 are NOT applied to the
--      connected production database. See "SCHEMA REALITY CHECK" below.
--      Revision 2 didn't check this and implicitly assumed columns that
--      don't exist yet in production.
--   2. The completeness test is now explicitly labeled a heuristic
--      required by that schema gap, not authoritative editorial evidence.
--      The source language is NO LONGER auto-included when its own chunks
--      are incomplete — an inconsistent original is now flagged for
--      review instead of papered over.
--   3. The "zero dependent rows" claim in Revision 2 was wrong. It was
--      based on anon-key REST reads returning empty results for
--      reading_progress / book_highlights / book_shelves /
--      user_subscriptions — but live probing (below) shows anon gets an
--      EMPTY result from those tables UNCONDITIONALLY (no book_id filter
--      needed to get zero rows back), because RLS blocks anon from
--      reading them at all. That is proof RLS is doing its job, not proof
--      the tables are empty. Revision 3 marks these counts UNKNOWN and
--      gives the owner exact service-role queries to run instead.
--   4. Revision 2's "cannot represent anyone's actual authorship" language
--      about the null-author_id row, and its single "RECOMMENDED" option,
--      are removed. Presence or absence of author_id proves nothing about
--      legitimacy on its own. Both rows are presented neutrally; this
--      script picks neither, and does not retire either automatically.
--   5. Rollback values are no longer hardcoded from this file's own
--      2026-09-14 read of the data — STEP 1 now snapshots each row's real
--      pre-update value into a temp table INSIDE the same transaction, so
--      rollback never depends on this comment staying in sync with reality.
--   6. Documents the migration-0005 publish-gate trigger and what it means
--      for un-retiring a row after that migration is applied (see STEP 3).
--
-- ---------------------------------------------------------------------------
-- SCHEMA REALITY CHECK — live-probed against production via anon-key REST
-- on 2026-09-14, not inferred from the migration files in this repo:
-- ---------------------------------------------------------------------------
--
--   book_chunks.status         -> "column book_chunks.status does not exist"
--   book_chunks.source_version -> "column book_chunks.source_version does not exist"
--   book_translation_jobs      -> "Could not find the table 'public.book_translation_jobs'"
--   translation_requests       -> "Could not find the table 'public.translation_requests'"
--   content_settings           -> "Could not find the table 'public.content_settings'"
--   books.source_version       -> "column books.source_version does not exist"
--
-- Conclusion: migrations 0001, 0005, 0006, 0007 (in supabase/migrations/)
-- are NOT applied to this production database. This is not new — it was
-- already flagged as a pending owner action in the prior launch report —
-- but it directly bounds what THIS script can safely assume:
--
--   * There is no `book_chunks.status` to filter on ('published' vs
--     'processing'/'failed') — every row in the table today is presumed
--     live/served content, same as it was before that column existed.
--   * There is no `source_version` anywhere, so this script CANNOT tell
--     whether a given book_chunks row was translated from the manuscript's
--     CURRENT text or a since-revised one. A "complete" chunk count below
--     is therefore a heuristic (do enough rows with content exist to cover
--     every page?), not proof that those pages reflect the current
--     manuscript or went through human review.
--   * `book_translation_jobs` (human_reviewed, status='published') does
--     not exist yet, so the one authoritative signal for "this is a
--     reviewed, published edition" is unavailable. Once migration 0001 is
--     applied, prefer that table over this script's heuristic — see
--     "ONGOING SYNCHRONIZATION" below.
--   * `content_settings` doesn't exist, so src/lib/reader.server.ts's
--     isMonetizationEnabled() is hitting its catch block and returning
--     false on every call in production right now. That fails safe (free
--     launch stays free) but means the monetization gate is untested
--     against real data — unrelated to this script, noted for completeness.
--
-- If the schema had the columns needed for authoritative evidence, this
-- script would use them instead of a heuristic. It doesn't, so the honest
-- move is to say so here rather than manufacture confidence this database
-- can't currently back up.
--
-- ---------------------------------------------------------------------------
-- ONGOING SYNCHRONIZATION — this script is a ONE-TIME BACKFILL, not a
-- recurring job, and must never be re-run on a schedule or treated as a
-- substitute for applying migration 0001.
-- ---------------------------------------------------------------------------
-- Once migration 0001 is applied, `available_languages` is already kept in
-- sync going forward by existing application code — no new tooling is
-- needed: see src/lib/translation.server.ts around the human-review-
-- approval function (the block that sets book_translation_jobs.status =
-- 'published', human_reviewed = true, and appends the job's language to
-- books.available_languages if it isn't already there). That code path is
-- the authoritative mechanism for future editions. This script exists ONLY
-- to correct rows that predate that pipeline (seed/fixture data inserted
-- directly, never routed through review).
--
-- ---------------------------------------------------------------------------
-- WHAT "AVAILABLE" MEANS HERE — three different, separately-tracked
-- concepts that this script (and the app) must not conflate:
-- ---------------------------------------------------------------------------
--   1. "Available edition"   — books.available_languages. A PUBLIC catalog
--      claim: "a complete, presumed-reviewed edition exists in this
--      language." This is the only column STEP 1 below touches.
--   2. "Requestable language" — Hindi/Arabic today (REQUESTABLE_TRANSLATION_
--      LANGUAGES in src/lib/data.ts). A reader can ask for an edition in
--      one of these even when it has zero content yet. This script does
--      not touch this list and does not need to — src/lib/reader.server.ts
--      never reads `available_languages` to decide whether a translation
--      is requestable.
--   3. "Reader has access" — a per-reader grant, tracked in
--      `translation_requests.status = 'granted'` (table not yet in
--      production; see above). Completely independent of #1: a book can
--      show no Hindi edition in its public list while a specific reader
--      who requested and was granted Hindi access can still read it, and
--      vice versa a public "available" language never bypasses a paid-tier
--      subscription gate. Nothing in this script writes to that table.
--
-- ---------------------------------------------------------------------------
-- CATALOG EVIDENCE — the full live `books` table and every `book_chunks`
-- row with non-empty content, read via anon-key REST on 2026-09-14 (5
-- books, 31 book_chunks rows total — small enough to check exhaustively).
-- ---------------------------------------------------------------------------
--
-- select id, title, author_id, status, source_language, total_chunks,
--        available_languages, access_type, subscription_price_usd
-- from books;
--
--  id          | title                    | author_id | status    | source  | total | declared available_languages                                          | access_type | price
--  11111111... | Pride and Prejudice      | null      | published | English | 4     | English,Urdu,Hindi,Arabic,French,German,Spanish,Russian,Chinese,Pashto | free        | -
--  22222222... | The Lantern in the Rain  | null      | published | English | 10    | English,Urdu,French,Arabic                                            | paid        | 4.99
--  33333333... | Moby-Dick                | null      | published | English | 3     | English,French,Spanish                                                | free        | -
--  44444444... | The Prophet              | null      | published | English | 3     | English,Arabic,Urdu,French                                            | free        | -
--  c144e57c... | The Lantern in the Rain  | 4578aa11..| published | English | 10    | English                                                               | free        | -
--
-- select book_id, language, count(*) as chunks_with_content
-- from book_chunks where length(trim(content)) > 0
-- group by book_id, language;
--
--  book_id     | language | chunks with content (of total_chunks) | verdict
--  11111111... | English  | 4 of 4   | COMPLETE (source language)
--  11111111... | Urdu     | 1 of 4   | incomplete (chunk 0 only)
--  11111111... | French   | 1 of 4   | incomplete (chunk 0 only)
--  22222222... | English  | 10 of 10 | COMPLETE (source language)
--  33333333... | English  | 3 of 3   | COMPLETE (source language)
--  44444444... | English  | 3 of 3   | COMPLETE (source language)
--  c144e57c... | English  | 10 of 10 | COMPLETE (source language)
--
-- No book_chunks rows exist for Hindi, Arabic, German, Spanish, Russian,
-- Chinese, or Pashto, for ANY book. Every non-English entry in every
-- book's declared `available_languages` above is unbacked by any content
-- at all except Pride and Prejudice's single-page Urdu/French chunks,
-- which still fail the completeness test (4 pages exist, 1 has content).
--
-- Every book's own declared source language happens to have complete
-- content today, so there is no "inconsistent original" to flag as of
-- this read — STEP 0 re-checks this live, in case that has changed, and
-- will surface it explicitly (not silently include the source language)
-- if it hasn't.
--
-- ---------------------------------------------------------------------------
-- STEP 0 — READ-ONLY. Re-run this immediately before STEP 1, separately,
-- outside any transaction. It computes the proposed value the same way
-- STEP 1 will, PLUS an explicit flag for a published book whose own
-- source language fails the completeness test (which STEP 1 will NOT
-- silently fix — that's a data-integrity problem for editorial review,
-- not something this script decides on its own).
-- ---------------------------------------------------------------------------
select
  b.id,
  b.title,
  b.source_language,
  b.total_chunks,
  b.available_languages as current_value,
  (
    select array_agg(distinct lang order by lang)
    from (
      select bc.language as lang, count(*) as n
      from public.book_chunks bc
      where bc.book_id = b.id and length(trim(bc.content)) > 0
      group by bc.language
      having count(*) = b.total_chunks
    ) complete_languages
  ) as proposed_value,
  not exists (
    select 1
    from public.book_chunks bc
    where bc.book_id = b.id
      and bc.language = b.source_language
      and length(trim(bc.content)) > 0
    group by bc.book_id
    having count(*) = b.total_chunks
  ) as source_language_incomplete_FLAG_FOR_REVIEW
from public.books b
where b.status = 'published'
order by b.title;

-- If any row comes back with source_language_incomplete_FLAG_FOR_REVIEW =
-- true: STOP. That means a published book's own original-language content
-- is incomplete, which is a more serious problem (how did it get
-- published?) than this script is scoped to fix. Send it back through
-- editorial review instead of running STEP 1 against it. As of the
-- 2026-09-14 read above, no book was in this state.

-- ---------------------------------------------------------------------------
-- STEP 1 — the actual update, transaction-scoped and separated from the
-- read-only inspection above. Snapshots the REAL pre-update value of every
-- affected row into a temp table before writing anything, so rollback
-- never depends on a comment (including the EVIDENCE table above) staying
-- accurate — it reads back exactly what was there a moment ago, in this
-- same session.
--
-- Uses the SAME heuristic as STEP 0 (complete chunk-content coverage), and
-- deliberately does NOT fall back to including the source language when
-- it's incomplete — an incomplete source language is excluded from
-- available_languages just like any other language would be, surfacing
-- the problem in the output rather than hiding it.
-- ---------------------------------------------------------------------------
begin;

create temp table _catalog_remediation_snapshot on commit drop as
select id, title, available_languages, access_type, subscription_price_usd
from public.books
where status = 'published';

update public.books b
set available_languages = coalesce(
  (
    select array_agg(distinct lang order by lang) from (
      select bc.language as lang
      from public.book_chunks bc
      where bc.book_id = b.id and length(trim(bc.content)) > 0
      group by bc.language
      having count(*) = b.total_chunks
    ) complete_languages
  ),
  array[]::text[]
)
where b.status = 'published';

-- Verify against the snapshot before deciding to commit:
select
  s.id,
  s.title,
  s.available_languages as was,
  b.available_languages as now
from _catalog_remediation_snapshot s
join public.books b on b.id = s.id
order by s.title;

-- If a row's `now` is an empty array: that book's own source language
-- failed the completeness check at the moment this ran (a race with STEP
-- 0, or new data). Do not commit until you've re-run STEP 0 and understood
-- why — an empty available_languages on a published book means nothing is
-- shown as readable in that book's language pills.

-- If everything above matches what you expect: COMMIT;
-- If not: ROLLBACK; — nothing has taken effect either way until COMMIT
-- runs, and the snapshot table is dropped automatically at the end of this
-- transaction either way (on commit drop).

-- ---------------------------------------------------------------------------
-- STEP 2 — remove the fake premium price from "The Lantern in the Rain"
-- (id 22222222-2222-2222-2222-222222222222). Verified above: access_type =
-- 'paid', subscription_price_usd = 4.99, author_id is null, and there is no
-- real translated content backing the price claim (no non-English chunks
-- exist for this book at all) — this was never a functioning paid title.
-- Run this as its own transaction, separate from STEP 1, so a problem with
-- one never blocks or gets bundled with the other.
-- ---------------------------------------------------------------------------
begin;

create temp table _pricing_remediation_snapshot on commit drop as
select id, title, access_type, subscription_price_usd
from public.books
where id = '22222222-2222-2222-2222-222222222222';

update public.books
set access_type = 'free', subscription_price_usd = null
where id = '22222222-2222-2222-2222-222222222222'
  and access_type = 'paid';

select s.title, s.access_type as was, s.subscription_price_usd as was_price,
       b.access_type as now, b.subscription_price_usd as now_price
from _pricing_remediation_snapshot s
join public.books b on b.id = s.id;

-- COMMIT; or ROLLBACK;

-- ---------------------------------------------------------------------------
-- STEP 3 — the duplicate "The Lantern in the Rain" rows. NOT decided or
-- applied by this script. Presented as verified structural facts only —
-- this script does not conclude which row is "the real one."
-- ---------------------------------------------------------------------------
--
--                          | 22222222-...                      | c144e57c-...
--   author_id              | null                               | 4578aa11-4cfa-4762-9788-934bc04a0e19 (a real signed-up account)
--   created_at              | 2026-02-01                        | 2026-09-11
--   description             | "A luminous debut novel about..." (distinct marketing copy) | "A lighthouse keeper's daughter finds a storm lantern..." (matches SAMPLE_MANUSCRIPT_SUMMARY in src/lib/data.ts verbatim)
--   access_type             | paid (fixed to free in STEP 2)   | free
--   cover_url               | null                               | null
--
-- What this table deliberately does NOT claim, per review of Revision 2:
--   * It does NOT treat author_id presence or absence as proof of
--     legitimate authorship. A null author_id could mean a seed row
--     inserted directly (bypassing src/lib/library.ts's publishBook,
--     which always sets author_id to the calling user) — or it could mean
--     something this script's author doesn't know about the data's
--     history. Absence of proof of legitimacy is not proof of
--     illegitimacy, and the reverse is equally true: having a real
--     account attached does not by itself prove the account holder wrote
--     the book, only that an authenticated account submitted it.
--   * It does NOT treat the description matching SAMPLE_MANUSCRIPT_SUMMARY
--     as proof that row is "the fake one" — it proves that account used
--     the publish form's "Load sample book" button at some point, nothing
--     more. Either row could be demo-derived; treat BOTH as unverified
--     until an actual rights/provenance check happens (see DEPENDENCY
--     CHECK below for what "verified" would require).
--   * It does NOT recommend retiring either row. Revision 2's single
--     "RECOMMENDED" option is removed. Retiring either is an editorial /
--     legal decision requiring rights verification this script cannot
--     perform from structural metadata alone.
--
-- MIGRATION-0005 PUBLICATION-TRIGGER WARNING — read before retiring
-- either row, even after resolving the above: migration 0005 (not yet
-- applied to production; see SCHEMA REALITY CHECK) adds a trigger that
-- BLOCKS any UPDATE moving a book's status back to 'published' unless
-- rights_status = 'approved' AND edition_review_status = 'approved' on
-- that same row (both new columns, defaulting to 'pending'). Concretely:
-- if a row is set to status = 'unpublished' NOW (pre-migration, which
-- works fine), and migration 0005 is applied LATER, a future plain
-- `update ... set status = 'published'` to restore it will FAIL at the
-- database level until an admin explicitly sets both review columns to
-- 'approved' first — restoring will no longer be the one-line operation
-- it is today. If retiring a row is decided on, do it with this in mind:
-- either retire before applying 0005 and document that a future restore
-- needs those two columns set, or retire after 0005 is applied and set
-- rights_status/edition_review_status to 'approved' in the same
-- transaction that restores status if that's ever needed.
--
-- DEPENDENCY CHECK — see the separate section below. Do not retire either
-- row until dependency counts are confirmed with service-role access, not
-- assumed from anon-key reads.
--
-- IF a decision is made to retire one of these rows (after the above is
-- resolved), the mechanical, reversible step (status only, deletes
-- nothing) is:
--
--   begin;
--   update public.books
--   set status = 'unpublished'
--   where id = '<the chosen id>'
--     and status = 'published';
--   select id, title, status from public.books where id = '<the chosen id>';
--   commit; -- or rollback;
--
-- `status = 'unpublished'` removes the row from the public catalog (per
-- the books_read_access policy referenced in 0000/0007, and the current
-- client-side filtering in src/lib/library.ts's listBooks) without
-- deleting anything. Restoring it later is a one-line UPDATE ONLY as long
-- as migration 0005 has not been applied — see the warning above for what
-- changes once it is.
--
-- ---------------------------------------------------------------------------
-- DEPENDENCY CHECK — corrected. Revision 2 claimed reading_progress,
-- book_highlights, book_shelves, and user_subscriptions were confirmed
-- empty for both Lantern book ids via anon-key REST reads. That claim was
-- wrong, and here is the live proof it was wrong:
-- ---------------------------------------------------------------------------
--
-- Probing each table via anon-key REST with NO book_id filter at all
-- (2026-09-14):
--
--   reading_progress    -> Content-Range: */0  (zero rows, unfiltered)
--   book_highlights     -> Content-Range: */0  (zero rows, unfiltered)
--   user_subscriptions  -> Content-Range: */0  (zero rows, unfiltered)
--   book_shelves        -> Content-Range: */0  (zero rows, unfiltered)
--   books (control)     -> Content-Range: 0-0/5 (5 rows — anon CAN read this table)
--
-- Anon returns zero rows from all four dependency tables regardless of
-- which book (or no book at all) is asked about — proof that Row Level
-- Security blocks the anon role from reading these tables entirely (an
-- owner-only `user_id = auth.uid()` policy, most likely), not evidence
-- that zero rows exist for any particular book. `books` returning real
-- rows in the same probe confirms anon key access itself is working — the
-- zeros above are RLS doing its job, not an empty table.
--
-- This session had no service-role key available, so it cannot verify the
-- real counts. `translation_requests` and `book_translation_jobs` don't
-- exist in production yet either way (see SCHEMA REALITY CHECK), so their
-- counts are trivially zero today — but must be rechecked once those
-- migrations are applied, before ever retiring a row at that point.
--
-- Run these with a service-role key (Supabase dashboard SQL editor, or the
-- service_role key locally — never the anon/publishable key) before
-- treating either Lantern row as dependency-free:
--
--   select
--     (select count(*) from reading_progress where book_id = '22222222-2222-2222-2222-222222222222') as progress_seed,
--     (select count(*) from book_highlights where book_id = '22222222-2222-2222-2222-222222222222') as highlights_seed,
--     (select count(*) from book_shelves where book_id = '22222222-2222-2222-2222-222222222222') as shelves_seed,
--     (select count(*) from user_subscriptions where book_id = '22222222-2222-2222-2222-222222222222') as subs_seed;
--
--   select
--     (select count(*) from reading_progress where book_id = 'c144e57c-2065-4e0f-a8d2-8548774f026e') as progress_real,
--     (select count(*) from book_highlights where book_id = 'c144e57c-2065-4e0f-a8d2-8548774f026e') as highlights_real,
--     (select count(*) from book_shelves where book_id = 'c144e57c-2065-4e0f-a8d2-8548774f026e') as shelves_real,
--     (select count(*) from user_subscriptions where book_id = 'c144e57c-2065-4e0f-a8d2-8548774f026e') as subs_real;
--
-- Once migrations 0001/0006 are applied, also check (translation requests,
-- grants, and jobs — these don't exist yet, so skip until then):
--
--   select count(*) from translation_requests where book_id = '<id>';
--   select count(*) from book_translation_jobs where book_id = '<id>';
--
-- If ANY of these come back non-zero for a row that's about to be
-- retired: stop and treat that as a real reader/author who interacted
-- with that specific record — status='unpublished' still doesn't delete
-- their data, but retiring at that point is a bigger decision than "this
-- looked like a duplicate."
--
-- ---------------------------------------------------------------------------
-- VALIDATION — this file has NOT been executed against any Postgres
-- instance, local or production, in this session. Local validation
-- (`supabase start`) was attempted and is unavailable: Docker is not
-- installed in this environment, and `supabase start` requires it. Before
-- applying to production, run this against a disposable Supabase branch,
-- a local instance on a machine with Docker, or at minimum STEP 0 alone
-- (pure read-only) against production directly, and confirm STEP 1/2's
-- verification SELECTs match expectations before ever issuing COMMIT.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ROLLBACK AFTER COMMIT — if STEP 1 or STEP 2 already ran and committed in
-- a past session and the snapshot temp tables are gone (they are
-- session-scoped, `on commit drop`), restore from whichever of these you
-- still have: (a) the verification SELECT output you should have saved
-- before committing, (b) Supabase's point-in-time recovery / backups if
-- enabled for this project, or (c) as a last resort, the specific values
-- this file's 2026-09-14 read captured (STEP 1 and STEP 2's own in-
-- transaction snapshots are strictly more trustworthy than this — prefer
-- those any time this script is actually run):
--
--   update public.books set available_languages = array['English','Urdu','Hindi','Arabic','French','German','Spanish','Russian','Chinese','Pashto'] where id = '11111111-1111-1111-1111-111111111111';
--   update public.books set available_languages = array['English','Urdu','French','Arabic'], access_type = 'paid', subscription_price_usd = 4.99 where id = '22222222-2222-2222-2222-222222222222';
--   update public.books set available_languages = array['English','French','Spanish'] where id = '33333333-3333-3333-3333-333333333333';
--   update public.books set available_languages = array['English','Arabic','Urdu','French'] where id = '44444444-4444-4444-4444-444444444444';
--   -- c144e57c-...'s available_languages was already ['English'] before this script — no change to roll back.
