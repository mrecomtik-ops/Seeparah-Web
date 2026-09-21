-- Seeparah — add an 'unverified' rights_status value, and use it to correct
-- one specific book whose rights review was approved over placeholder
-- text with no real evidence.
--
-- BACKGROUND (from the live preview, reported directly by the project
-- owner, not assumed): book 3e7b81ec-4e97-42d7-82ea-f0b2fa8ff102 ("How to
-- Win Friends and Influence People") is currently published with
-- rights_status='approved', rights_basis='hh' (a placeholder the owner
-- typed in themselves while testing the upload form — not real rights
-- evidence), and rights_evidence_url=null. It was reviewed and approved by
-- the same owner account 28 seconds after creation
-- (reviewed_by=f810cc7c-f615-4596-b481-e90d64b83ebd), i.e. self-approved
-- over a value that was plainly visible in the review UI at the time
-- (src/routes/admin/books/$bookId.tsx renders rights_basis and
-- rights_evidence_url directly above the Approve/Reject buttons) — a
-- process gap, not purely a technical one, but compounded by a real
-- technical gap: neither the submission form
-- (src/lib/admin/catalog.functions.ts's rightsInputShape,
-- rightsBasis: z.string().min(1)) nor reviewRights() in
-- src/lib/admin/catalog.server.ts inspected the CONTENT of rights_basis/
-- rights_evidence_url at all — any non-empty string could be approved.
-- The uploaded manuscript itself identifies as a REVISED edition with
-- later copyright notices, so even if the original 1936 work were public
-- domain, that does not by itself establish this specific edition/printing
-- is too — a revised edition can carry its own separate copyright. No
-- license, permission, or public-domain confirmation for THIS edition has
-- been recorded. Per instruction: do not invent one, and preserve every
-- existing record (rights_basis, chunks, the book row itself) rather than
-- delete or silently overwrite it — the 'hh' value stays, annotated, as
-- the honest history of what happened.
--
-- application-code companion change (same commit): reviewRights() in
-- src/lib/admin/catalog.server.ts now refuses an 'approved' decision
-- outright when rights_basis reads as a placeholder (too short, a
-- single repeated character, or a known placeholder token) or
-- rights_evidence_url isn't a real http(s) URL — so placeholder text alone
-- can never satisfy rights review again, at the actual approval gate, not
-- just the submission form.

begin;

do $$
begin
  if to_regclass('public.books') is null then
    raise exception 'Precondition failed: public.books does not exist — aborting';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'books_rights_status_check') then
    raise exception 'Precondition failed: expected the original books_rights_status_check constraint from migration 0005 to still exist under that name — aborting rather than guess';
  end if;
  if not exists (
    select 1 from public.books
    where id = '3e7b81ec-4e97-42d7-82ea-f0b2fa8ff102'
      and rights_status = 'approved' and rights_basis = 'hh' and status = 'published'
  ) then
    raise exception 'Precondition failed: book 3e7b81ec-4e97-42d7-82ea-f0b2fa8ff102 is not in the exact state (rights_status=approved, rights_basis=hh, status=published) this migration was written to fix — aborting rather than assume this file''s reasoning still matches live state';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Widen books_rights_status_check to add 'unverified' — a real, first-
--    class state distinct from 'pending' (never reviewed) and 'rejected'
--    (reviewed and refused): "was reviewed, the review turned out to be
--    invalid, now needs a real re-review." The publish-gate trigger from
--    0005 (check_book_publish_gate) already requires rights_status =
--    'approved' to transition INTO 'published', so a book sitting at
--    'unverified' can never be (re-)published until a real review happens
--    — no trigger change needed, the existing gate already covers this new
--    value correctly by simply not being 'approved'.
-- ---------------------------------------------------------------------------
alter table public.books drop constraint books_rights_status_check;
alter table public.books
  add constraint books_rights_status_check
  check (rights_status in ('pending', 'approved', 'rejected', 'unverified'));

-- ---------------------------------------------------------------------------
-- 2. Correct this one book: rights_status -> 'unverified', unpublish
--    (status -> 'unpublished', NOT deleted — book row, chunks, and the
--    original rights_basis value are all preserved), annotate why in
--    review_notes. rights_basis is intentionally left as 'hh' rather than
--    cleared — it's the honest record of what was actually entered, and
--    clearing it would erase the evidence of the gap this migration exists
--    to fix.
-- ---------------------------------------------------------------------------
update public.books
set
  rights_status = 'unverified',
  status = 'unpublished',
  review_notes = concat_ws(
    ' | ',
    nullif(review_notes, ''),
    'Rights re-flagged unverified ' || now()::date ||
      ': prior approval was over placeholder text (rights_basis=''hh'', no evidence URL) and is not valid. ' ||
      'This edition''s manuscript identifies later copyright notices, so public-domain status of the ' ||
      'original 1936 work does not by itself establish rights to this specific revised edition. ' ||
      'Needs: confirmation of this exact edition/printing''s copyright status (public domain, with its ' ||
      'specific publication date and renewal history), OR a real license/permission reference naming this ' ||
      'edition, before republishing.'
  )
where id = '3e7b81ec-4e97-42d7-82ea-f0b2fa8ff102';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'books_rights_status_check'
      and pg_get_constraintdef(oid) like '%unverified%'
  ) then
    raise exception 'Postcondition failed: books_rights_status_check does not include unverified — rolling back';
  end if;
  if not exists (
    select 1 from public.books
    where id = '3e7b81ec-4e97-42d7-82ea-f0b2fa8ff102'
      and rights_status = 'unverified' and status = 'unpublished' and rights_basis = 'hh'
  ) then
    raise exception 'Postcondition failed: book 3e7b81ec-4e97-42d7-82ea-f0b2fa8ff102 was not corrected as expected — rolling back';
  end if;
  raise notice 'Migration 0012 complete: unverified rights_status added; book 3e7b81ec-4e97-42d7-82ea-f0b2fa8ff102 unpublished pending real rights documentation.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (read-only):
-- ---------------------------------------------------------------------------
-- select rights_status, status, rights_basis, rights_evidence_url, review_notes
-- from public.books where id = '3e7b81ec-4e97-42d7-82ea-f0b2fa8ff102';
-- -- expect rights_status='unverified', status='unpublished', rights_basis='hh' (unchanged),
-- -- review_notes containing the annotation above
--
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conname = 'books_rights_status_check';
-- -- expect the definition to include 'unverified'
--
-- select count(*) from public.book_chunks where book_id = '3e7b81ec-4e97-42d7-82ea-f0b2fa8ff102';
-- -- expect unchanged from before this migration (475) — nothing deleted
