# Seeparah book text to private Cloudflare R2 — safe rollout

Status: **prepared, not active**. Existing website readers continue to use Supabase until explicit activation. No automatic data removal, no new books imported by this migration worker, no provider spend authorized.

## Why and actual scope

Production Supabase Free is read-only at ~1.57 GB of database content, with book_chunks ~1.27 GB and book_structure_nodes ~159 MB. Do NOT attempt to bypass read-only and resume Gutenberg imports before a safe verified space reclamation. The R2 archival code cannot itself remove PostgreSQL data or restore database writes.

The migration is **not** the same as automatically importing all 78,518 Gutenberg inventory records. Those are metadata candidates, not validated, rights-reviewed, complete Seeparah editions. Keep source authentication, rights checks, TOC quality and publication gates.

## Prerequisite: owner activates R2

- [ ] Owner enables R2 in **Seeparah** Cloudflare account (R2 API currently returns 403 code 10042: `Please enable R2 through the Cloudflare Dashboard`). Adding a payment method or accepting paid/usage-based terms is owner-only.
- [ ] Owner checks the current free allowance, payment terms, usage alerts and any desired hard cost controls. A free allowance does not guarantee zero charges above it.
- [ ] Create private Standard-class bucket named `seeparah-book-archive` with no public r2.dev access and no public/custom domain. Avoid lifecycle expiration on permanent source archives.
- [ ] Add secrets to the **separate** `seeparah-r2-migrator` Worker: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a long random `MIGRATION_ADMIN_TOKEN`. Never paste credentials into GitHub, logs or chat. Use `wrangler secret put` or Cloudflare's secure dashboard.
- [ ] After bucket creation, deploy the separate Worker from `workers/r2-migrator/wrangler.jsonc`. This code deliberately has **no cron**; it only responds to authenticated POST requests.
- [ ] Do not add a binding to the live `seeparah-web` configuration until pilot copies have passed tests. At pilot cutover, add `{ "binding": "SEEPARAH_BOOK_ARCHIVE", "bucket_name": "seeparah-book-archive" }` to `r2_buckets` in the **main** `wrangler.jsonc`, deploy and test on staging before production.

## Phase 1: Mirror only (no cutover)

The separate Worker offers POST `/mirror` with JSON `{"bookId":"<approved published book UUID>"}` and header `Authorization: Bearer <secret token>`. This only accepts general-classification published source-language editions, reads the exact published source version and all chunks in bounded pages of 500, verifies contiguous chunk indices and counts against `books.total_chunks`, rejects unexpected content, stores an immutable private R2 JSON object, and reads it back to verify SHA-256.

It returns an archive key, hash and count. **Mirroring alone does not alter any Seeparah reader, Supabase row or published status.** If a different source checksum already exists at the same key, it fails closed instead of overwriting. Keep the returned checksums in a secure rollout log.

The archive document contains exact source chunk strings and edition identity, but no rights-review notes or user data. The object is private; only the server's bound Worker can access it.

## Phase 2: Explicit pilot activation

Before activating a book, compare the R2 copy against the current Postgres rows and test source, cover, Table of Contents, text search, page navigation, mobile offline download and accessibility. Do not activate editions that are under source revision/edit or are not definitively rights-cleared.

Activation uses POST `/activate` with JSON `{"bookId":"...","expectedSha256":"<64-character hash>","approval":"ACTIVATE_VERIFIED_R2_ARCHIVE"}` and the same Bearer secret. The Worker independently **re-reads and hashes the current published source** before creating an activation marker in R2. Only a valid marker switches the main reader to R2, and only after the usual publication and entitlement checks.

The website's reader functions fall back to Postgres for unactivated versions; if the activated archive is missing or its checksum mismatches, they fail closed rather than serving incorrect or stale text.

After pilot activation, verify source-language and translated editions (only source language is covered by this first Worker), sacred texts and native/mobile offline reading separately. Do not assume this pilot migrates all editions.

## Phase 3: Reclaim Postgres capacity — **not automated yet**

**No deletions are included in this PR.** The next reviewed phase must first provide a complete database backup/restore test, a manifest of every migrated book/version/language, comparisons to `book_chunks`, no incomplete changes or newer source revisions, and a safe incremental deletion process with rollback.

PostgreSQL `DELETE` does not immediately shrink the physical database; space reclamation and read-only recovery must follow Supabase's documented process, and substantial VACUUM operations can require extra disk. Never run blanket `TRUNCATE`, disable RLS, or drop the text table to chase the free-plan limit. For now, **preserve every row**.

Source archives in Supabase Storage are separate from the 1.27 GB PostgreSQL `book_chunks` total. Mirroring them to R2 should be planned after the reader pilot, not treated as a verified substitute before hash reconciliation.

## Phase 4: Gutenberg importer

Only when Supabase reports writable state and the R2 reader is tested:
- Update publication creation to write new immutable book text to R2 with source hashes and manifest checkpoints before final publication.
- Ensure the database stores small bibliographic metadata, source/provenance references and essential navigation without re-growing `book_chunks`.
- Preserve the already merged quota-failure retry guard. Test one candidate end-to-end, check source proof, rights and duplicate gates, then expand with bounded concurrency.
- Continue tracking job counts and Worker errors; stop if unexpected writes, new truncation, source mismatch or DB-space thresholds occur.

## Non-goals / safety

- No public R2 bucket, no unsigned URLs, no bypass of reader entitlement checks.
- No automatic storage deletion, R2 activation, or publishing of unverified source material.
- Do not touch the validated Microsoft Store package or manually held release.
- Do not promise zero costs; review Cloudflare R2 usage periodically.

Cloudflare Docs: https://developers.cloudflare.com/r2/get-started/workers-api/
Supabase recovery: https://supabase.com/docs/guides/platform/database-size
