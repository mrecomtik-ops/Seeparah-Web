## Seeparah QA security and remaining source-audit handoff — November 11, 2026

### Author account privacy (QA-031)

A read-only production inspection found `anon` could select `public.author_profiles.user_id` and the table had a public-read RLS policy. Public book author pages now call a service-role-backed server function that (1) first verifies a published `books.author_id` reference and (2) returns ONLY `pen_name`, `bio`, and `avatar_url`. An author editing their own profile continues using their authenticated RLS path. The companion migration removes anonymous table privileges and replaces the public SELECT policy with owner-only authenticated SELECT. Apply **after** Cloudflare deploys the server implementation, and verify both anonymous denial and owner access.

### Accurate outstanding count (last verified at start of this batch)

* 881 published books; 1,028 catalogue records. Importer disabled; 10,000 target and 100-book batch size already configured.
* 663 unverified historical first-publication years retained as NULL with backups. Do not substitute Gutenberg issue dates or single Open Library values.
* 66 manuscripts in source-structure review, plus 34 repaired navigation records still needing reader/browser acceptance.
* 676 medium-resolution Gutenberg cover JPEGs: native-resolution rendering fixed; real higher-resolution source art remains unverified.

### Continuing safeguards

Production changes must be checked against the repository and audited live database. Do not bulk-replace rights-approved editions, generate historically false bibliography, redraw scriptures, unpublish books without evidence, reset user highlights/reading progress, remove Cloudflare secrets, or enable automatic acquisition while integrity review remains pending. The original 35-finding QA register is not 100% closed until the outstanding source, artwork, performance and device checks are actually verified.

### Source-verbatim reader navigation repaired in this follow-up

Three published Gutenberg works had an exact, complete Chapter I heading and substantive original prose in archived chunks, but their TOC began at Chapter II. A fully guarded single PostgreSQL transaction took one JSON snapshot of all existing navigation nodes per work (in `qa_20261111_structure_repair_backups`), verified each original book UUID/status/source version and the following Chapter II node, clipped wrongly spanning front-matter only where necessary, added a single source-backed Chapter I navigation entry, and marked the QA entry `navigation_repaired_pending_visual_qa`. **No source text, rights status, reading progress or user data was changed.**

- *The Monk: A Romance* `5e5e7c06-dc42-4ab8-8efa-a0bdf6c98cda`: real CHAPTER I at original chunk 1, following Chapter II at chunk 18, now 12 chapter navigation entries.
- *Shoulder-Straps* `2c77926a-9d73-42a2-ab04-61f27484e821`: real CHAPTER I at chunk 8 (not the table of contents at chunk 3), following Chapter II at chunk 16, now 30 chapter navigation entries.
- *The Coming Wave* `e9b7d986-2a1d-4da1-88d1-43f84c96877d`: real CHAPTER I at chunk 6 (not the table of contents at chunk 3), following Chapter II at chunk 11, now 18 chapter entries.

The current audited nav register totals **34 books with 681 recovered navigation links** and **66 original source candidates awaiting review**. Physical and mobile reader acceptance remains unverified.

### Future source importer guard

`src/lib/manuscript.ts` now refuses to suppress early headings as a supposed printed TOC when average words per heading indicate substantial real narrative even if the total first-volume passage is below 1,500 words. Two tests cover a short multi-volume first chapter and a genuine terse printed contents list.

### Public description display

For the 663 uncertainty-labelled Gutenberg records, public prose presents known catalogue-author names in reader order (including correctly positioned Jr./Sr. suffixes) without changing stored catalogue attribution or reintroducing unverified historical publication years. Independent editorial summaries of the source work remain outstanding.
