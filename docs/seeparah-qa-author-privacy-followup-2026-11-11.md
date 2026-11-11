## Seeparah QA security and remaining source-audit handoff — November 11, 2026

### Author account privacy (QA-031)

A read-only production inspection found `anon` could select `public.author_profiles.user_id` and the table had a public-read RLS policy. Public book author pages now call a service-role-backed server function that (1) first verifies a published `books.author_id` reference and (2) returns ONLY `pen_name`, `bio`, and `avatar_url`. An author editing their own profile continues using their authenticated RLS path. The companion migration removes anonymous table privileges and replaces the public SELECT policy with owner-only authenticated SELECT. Apply **after** Cloudflare deploys the server implementation, and verify both anonymous denial and owner access.

### Accurate outstanding count (last verified at start of this batch)

* 881 published books; 1,028 catalogue records. Importer disabled; 10,000 target and 100-book batch size already configured.
* 663 unverified historical first-publication years retained as NULL with backups. Do not substitute Gutenberg issue dates or single Open Library values.
* 69 manuscripts in source-structure review, plus 31 repaired navigation records still needing reader/browser acceptance.
* 676 medium-resolution Gutenberg cover JPEGs: native-resolution rendering fixed; real higher-resolution source art remains unverified.

### Continuing safeguards

Production changes must be checked against the repository and audited live database. Do not bulk-replace rights-approved editions, generate historically false bibliography, redraw scriptures, unpublish books without evidence, reset user highlights/reading progress, remove Cloudflare secrets, or enable automatic acquisition while integrity review remains pending. The original 35-finding QA register is not 100% closed until the outstanding source, artwork, performance and device checks are actually verified.
