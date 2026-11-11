# Seeparah QA remediation — third batch (2026-11-11)

## Production database actions

**QA-001 — unverified historical dates.** Using a transaction and a strict cohort check, saved the original 663 imported, uncorroborated first-publication years in `qa_20261111_unverified_publication_year_backups`, then set only those 663 `books.original_publication_year` values to NULL. No print year was invented. Published content, status, original work sources and translations were untouched. Follow-up check: 663 backed up = 663 NULL, zero published Gutenberg books remain with the unverified 1800 field. The independent bibliographic re-verification required to restore accurate publication years remains open.

**QA-002 — Hard Times navigation.** Source-backed examination found Book One chapter headings I–XVI inside the existing archived 200 source chunks, while navigation exposed only Book Two's XII and Book Three's IX chapters. A transaction saved all 28 old structure nodes for rollback in `qa_20261111_structure_repair_backups`, inserted 16 exact source chapter headings plus two `BOOK THE FIRST/SECOND` titles, clipped the erroneous front-matter range and renumbered navigation. Postflight confirmed 37 chapters and 3 parts, and all chunk indexes valid. The QA candidate is `navigation_repaired_pending_visual_qa`; do not mark its reader acceptance complete before browsing the reader.

**QA-031 (partial) — public settings actor ID.** RLS-preserving column grants replaced `SELECT *` privilege for `anon`/`authenticated`: `key,value,is_public,version,updated_at` remain readable, `updated_by` is no longer readable publicly. Server service_role access remains unchanged. Author-profile public IDs need a separate route/API compatibility review.

## Code under this PR

- QA-021: display only the **verified** 112 unnumbered Arabic Basmala preludes as an independently styled source heading, with Surah 1:1 and 9:1 left untouched. Ayah 2:1's Copy text omits that unnumbered prelude; the archived canonical source is **unchanged**, DOM text offsets/reading source remain reconstructible, and the app preserves translations and ayah numbers.
- QA-022 (partial): label cumulative `last_chunk_index` data as *source sections reached*, never physical pages; change Dashboard's misleading all-time-as-weekly progress to device-local reading days in last seven days; mark weekly page-goal tracking pending. A real page-level activity ledger is still needed.
- QA-010 (partial): remove large description payloads from full Library facet/search index, continue to fetch full metadata for the 24 visible cards, and separately load one featured description. Server still pages at 500 rows (no Supabase silent 1000 truncation). Full server-side search/facet query remains a scaling follow-up.
- Version both production-applied Supabase migrations in source control.

## Validation

- Source bytes, sacred translations, Quran numbering, copyright/rights review, existing books, progress and Cloudflare env vars remain unchanged.
- GNU importer remains paused pending date, chapter, source-rights and CPU safeguards.
- CI, architecture checks and reader QA must pass before merge and Cloudflare deployment.
- Never report QA-001, QA-002, QA-010, QA-022 or QA-031 wholly closed until their explicit remaining acceptance items pass.

## Safe rollback notes (operator-controlled, no automatic rollback)

For the 663 date records, restore each `books.original_publication_year` from `qa_20261111_unverified_publication_year_backups.old_original_publication_year` only if that title has not subsequently received an approved independently reviewed date.

For *Hard Times*, the original 28 node JSON rows are stored in `qa_20261111_structure_repair_backups.original_nodes` with the exact 18 inserted node keys in `repaired_node_keys`. Restore within a transaction only after checking the book's `source_version=1`, then delete the added QA nodes; never remove newer legitimate editorial edits.

## Critical post-deployment reconciliation — 2026-11-11 11:02 UTC

The existing `books_auto_unpublish_invalid_gate` trigger required a non-NULL `original_publication_year` on ANY published book UPDATE. Neutralizing the 663 incorrect years unexpectedly changed all 663 from `published` to `unpublished`. The metadata values stayed truthful but the live catalogue temporarily lost those books. This was detected by an independent recount and remediated immediately rather than masking the loss.

Production migration `20261111110219_qa_20261111_scoped_legacy_publication_year_exemption` changes only the two year-null branches in `auto_unpublish_invalid_published_book` and `check_book_publish_gate`: for a book already in the private QA-001 backup cohort, with the EXACT original Gutenberg `source_scan_id` and explicit unverified-year notice, an unknown first-publication year is accepted. ALL other publication/rights/structure/cleanup checks continue to apply. No new book can use that grandfathered exemption. After a strict 663-row preflight confirmed all original four reviews approved, a single transaction restored the 663 books to `published` without reintroducing erroneous years.

Verified after: 663 grandfathered source IDs published with NULL years, 663 private backups retained, no spurious year 1800, Gutenberg importer still paused. Overall live published count had risen to 869 due to other catalogue activity. A true year-by-year independent provenance review remains open. Future metadata schema cleanups must account for trigger-side publication transitions and validate before/after published counts in the SAME transaction.
