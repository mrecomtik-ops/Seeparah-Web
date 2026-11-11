# Seeparah QA follow-up — November 11, 2026

## Scope and source integrity

**Live production state after this batch's DB work:** 881 published books, 1,028 catalogue records; Gutenberg importer disabled; 663 previously neutralized first-publication years awaiting independent historical evidence; 69 structure records needing manual source review; 31 repaired structures awaiting browser visual acceptance. Across all previous batches, 31 books have 678 added navigation links preserved in private rollback records. This document is an evidence handoff, not a claim that the whole QA register is complete.

### Four newly repaired source-backed books

These repairs are **already applied** via fully guarded PostgreSQL transactions to live Supabase, not repeatable migrations to run automatically on deploy. For each, the previous node structure was backed up in `qa_20261111_structure_repair_backups` (one row per book), and no `books` rows, source chunks, user notes, rights decisions or translations were edited:

| Book | UUID | Source-based headings newly navigable | Exact original chunk indexes |
| --- | --- | --- | --- |
| The Lost Kitty | `818795de-1ce7-4434-a8e7-f19ef1825fde` | CHAPTER I. (The Maltese Kitty) | 2; following II at 6 |
| The Gold Thread: A Story for the Young | `32cb0d76-95a5-4e3c-b3f3-40a5a958effc` | CHAPTER I. (The Wanderer—Wolf the Swineherd) | 2; following II at 5 |
| Jack Sheppard: A Romance | `a9b799fa-a043-4662-a711-d690faa753ab` | Early CHAPTER I–VI of epoch one | 2, 8, 18, 21, 29, 36; following epoch II Chapter I at 47 |
| The Last Man | `000f2d4d-9b6f-4067-a93c-d7ab0eef1e48` | Volume I CHAPTER I–III | 2, 6, 12; following Chapter IV at 23 |

The printed TOC/Introduction node ranges were clipped to the original opening material where they had incorrectly extended across real chapters; every original structure node is recoverable from the JSON backup. The original Gutenberg content and chapter numbering were not rewritten. The four audit records were advanced to `navigation_repaired_pending_visual_qa` **only**; they are not yet fully accepted.

## Code change: bounded SEO and admin integrity

- Split `/sitemap.xml` into a tiny sitemap index and independently fetched `/sitemaps/static.xml`, `/sitemaps/books-N.xml`, `/sitemaps/research-N.xml`, with no more than 500 source rows per request. This avoids one entire 10,000-title metadata scan on each crawler request, preserves published-only book URLs and canonical religious URL policy, and excludes unpublished/withdrawn papers.
- Add index/page bounds, malformed origin rejection, 10k-count coverage and tests.
- Display **real read-only** quality backlogs on the authenticated admin Health panel, including unverified years, source-chapter reviews, navigation fixes awaiting visual acceptance, and low-resolution Gutenberg JPEG covers. No automatic publication or source changes.

## Remaining acceptance boundaries

- All 663 historical publication years need at least two reliable bibliographic sources; do not infer them from Gutenberg upload timestamps or one Open Library field, or restore the false 1800/1656 values.
- 69 chapter-structure candidates need source inspection. 31 already restored still need browser/device navigation verification. Never automatically assume printed TOC references are real in-body chapter headings.
- 676 Gutenberg 200x300 source JPEG covers need genuinely higher-quality authorized artwork. UI image scaling alone cannot create resolution.
- 3 confirmed duplicate work-title clusters now show explicit alternate Gutenberg source-edition badges in Library, with no deletions or hidden published records. Final edition equivalence/rights reconciliation remains an editorial review item.
- Full 10k scaling load test, true paged server-side Library search/filter, reader cold-load performance, source-level description summaries, nonce-based CSP, author-profile IDs/privacy migration, end-to-end account/device tests, historical bibliographic provenance and remaining lint remediation are not silently considered complete.
- Importer stays paused until historical accuracy, rights eligibility, complete text and chapter integrity permit safe publication.

## Safety checks before closing the PR

Require CI, architecture gate, independent reader checks, Cloudflare successful rollout of the exact main SHA, sitemap index/page HTTP 200 and XML content, and a fresh Supabase count and importer-enabled check. Never remove existing environment variables including `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
