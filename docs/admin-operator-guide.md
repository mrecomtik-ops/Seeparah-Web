# Seeparah admin operator guide

This covers the admin backend added in this change: schema, roles, and the
`/admin` dashboard. Read this before granting anyone a role or applying the
migrations.

## 1. Apply the migrations

**Read `docs/security-verification-2026-09.md` first, including its
"Correction pass" section.** It documents two issues found live in the
CURRENT (pre-`0001`) production schema — an anonymous REST client could
read a draft book's full manuscript text, and an author could self-publish
directly — and the standalone hotfix (`0000_hotfix_current_books_rls.sql`)
written to close them, independent of everything else in this section.

**Take a backup before anything else — including before applying `0000`.**
See §8.1 below. The hotfix's urgency is a reason to schedule the backup
promptly, never a reason to skip it. `0000` and `0007` are also both
**written but not yet locally or live tested** (no database environment
was available while writing them — see their own headers, and
`supabase/tests/rls_hotfix_tests.sql` for the prepared, not-yet-run test
suite) — run that test suite against a real local or staging database
before applying either to production, per §8.3.

None of `supabase/migrations/0001_*.sql` through `0007_*.sql` have been
applied to the live project — this is what querying the live schema over
REST is **consistent with** (a `PGRST205`/schema-cache-miss response shows
what PostgREST currently exposes, which is strong but not definitive
evidence of complete migration history; see the verification doc's §5 for
that distinction). Before applying, run `supabase/inspect_current_access.sql`
and re-confirm this is still true for your project at deploy time (§8.0 in
the deployment plan explains why this check matters even though this
codebase's own migration history looks clean). Then review each file, and
apply **in full numeric order including `0000` and `0007`** via the
Supabase SQL editor, or `supabase db push` once the project is linked
locally (`supabase link --project-ref <project-id>`, using the project id
from `supabase/config.toml`). Full sequence:
`0000 → 0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007`.

Apply in a maintenance window. Most of these are purely additive (new
tables/columns/triggers), but `0005` adds a publish-gate trigger on `books`
and a status check constraint — read its header before running it, since it
changes what `status` values are accepted going forward. `0000` and `0007`
actively DROP and replace **every existing policy on `books` and
`book_chunks`, for every command** (a policy defined `FOR ALL` is not
missed — see either file's header for why this matters) and adjust table/
column grants — this is deliberate and required, not optional follow-up
work. Each is wrapped in an explicit transaction with precondition and
postcondition checks: if anything is missing or wrong, the whole file
rolls back and changes nothing, rather than leaving a partially-replaced
policy set. See §8 of the deployment plan below for the full procedure,
staging checklist, and recovery guidance (do not treat a policy/trigger
rejection as a reason to drop the check — see §8.1).

## 2. Grant the first owner

There is no in-app way to become an owner — by design (no first-registrant
bootstrap, no hardcoded email, no public admin registration). The account
must have already signed in at least once (Google or email) so it exists as
a real `auth.users` row.

```
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npx tsx scripts/seed-owner.ts <email-or-user-id> --confirm
```

This is a one-time, human-run script — it is not wired into any build step,
CI job, or UI button. It writes an `audit_log` row for itself.

Once granted, sign in as that account, go to `/admin`, and enroll an MFA
factor (TOTP) — admin actions require the session to be at Supabase's
`aal2` level, enforced server-side in `src/lib/admin/require-admin.server.ts`
on every single admin server function, not just in the UI.

## 3. Roles and the permission matrix

Roles: `owner` > `administrator` > `editor` > `support` (documented fully in
`src/lib/admin/permissions.ts`, which is the single source of truth both
sides read from).

| Capability | owner | administrator | editor | support |
| --- | --- | --- | --- | --- |
| Manage admin roles | ✓ | | | |
| User search / support actions | ✓ | ✓ | | ✓ |
| Read unpublished manuscripts | ✓ | ✓ | ✓ | |
| Catalog upload / review / publish | ✓ | ✓ | ✓ | |
| Translation job & request management | ✓ | ✓ | ✓ | |
| Support tickets (read/manage/public reply) | ✓ | ✓ | | ✓ |
| Content settings / secrets status | ✓ | ✓ | | |
| Health + recovery actions | ✓ | ✓ | ✓ (read only) | |
| Audit log read | ✓ | ✓ | | |

Only `owner`/`administrator` can grant/revoke roles (owner-only in the UI —
`/admin/roles` requires `roles.manage`, which only owner has). The last
active owner can never be revoked or deleted — enforced both by a DB
trigger (`prevent_last_owner_removal`) and by an application-level check.
The trigger takes a transaction-scoped Postgres advisory lock
(`pg_advisory_xact_lock`) before counting remaining owners, so two
concurrent requests revoking two different owners at the same instant
can't both succeed and leave zero owners — the second serializes behind
the first and re-counts against its already-committed result. The
application-level check in `roles.server.ts` is not itself
concurrency-safe (it's a plain count-then-act) and is intentionally only a
"nicer error message" fast path; the trigger is the real backstop.

## 4. What each admin section actually does

- **Overview** (`/admin`) — real counts from the DB: published/awaiting
  books, pending rights/edition reviews, open translation requests, open
  tickets, stalled/failed jobs. No fabricated numbers.
- **Users** (`/admin/users`) — search (best-effort scan; see limitation
  below), suspend/restore (via `auth.admin.updateUserById` `ban_duration`),
  send recovery email (refused for Google-only accounts — they have no
  password), resend verification email, repair a missing author profile.
  Every action requires a reason, is rate-limited per admin per hour, and
  is audited.
- **Catalog** (`/admin/books`) — list all books regardless of status,
  review rights and edition quality separately, publish (gated — see
  below), unpublish, archive, upload one book (text or EPUB) or a CSV
  batch with dry-run validation.
  - **Publish gate**: only `rights_status = 'approved'` AND
    `edition_review_status = 'approved'` are required. A missing English or
    Urdu edition is shown as "pending" (`pendingTranslations` in the gate
    result) and never blocks publishing the original — this is enforced
    both in `evaluatePublishGate`/`publishBook` and, as an unbypassable
    backstop against a direct SQL update, in the `check_book_publish_gate`
    trigger in migration 0005. English/Urdu remain the standard translation
    targets; queue one from the book detail page ("Start English/Urdu
    translation") using `adminQueueTranslationJob` — this is the only way
    to produce a standard-language edition for an admin-uploaded book,
    since those have no author account to use the author-facing request
    flow.
- **Translation requests** (`/admin/translation-requests`) — reader
  requests for Hindi/Arabic access. Approving grants immediately if a
  reviewed edition exists; otherwise it queues (or reuses) one production
  job and the request becomes `approved_awaiting_edition`, auto-granting
  only once that job publishes.
- **Support** (`/admin/support`) — tickets from signed-in users and the
  public "can't sign in" report form (`/legal#support`), with internal
  notes vs public replies kept separate.
- **Content settings** (`/admin/settings`) — versioned JSON config
  (home collections, featured books, announcements, maintenance message,
  language availability, translation budgets, `monetization_enabled`),
  with publish + rollback to any prior version.
- **Health** (`/admin/health`) — stalled/failed translation jobs, pending
  reviews, open tickets, unresolved error events, Gemini configured status.
  Recovery actions are a fixed allowlist: retry failed sections, resume a
  batch, mark an error resolved. No SQL console, no shell access.
- **Audit log** (`/admin/audit`) — every privileged mutation. Read-only in
  the UI; only ever written by service-role server code.
- **Admin roles** (`/admin/roles`) — owner-only.

## 5. Known, documented limitations (not fake capability)

- **User search has no server-side email filter.** The Supabase Auth admin
  API doesn't expose one (confirmed against current docs/issues). The
  search scans up to 25 pages (5,000 users) and filters client-side; a
  `truncated: true` result means the scan hit its cap before finishing.
  Fine at launch scale; revisit if the user base grows past a few thousand.
- **"Send recovery email" uses Supabase's own configured mailer**
  (`resetPasswordForEmail`), not a separate email provider — there isn't
  one in this codebase. If Supabase's Auth SMTP isn't configured in the
  dashboard, the call succeeds but no email actually arrives; this is a
  Supabase-dashboard configuration issue, not something the button can fix.
- **Session revocation**: suspending an account blocks future sign-in and
  token refresh, but does not instantly invalidate an already-issued access
  token (Supabase JWTs are stateless) — the bound is the token's remaining
  lifetime (default up to 1 hour). This is disclosed in the UI copy, not
  hidden.
- **PDF upload is not supported.** No extraction pipeline exists; uploading
  a PDF is refused with an explanation rather than silently mis-extracting
  it. Scanned/image-only EPUB content is detected and refused with an
  "needs OCR" message rather than pretending it worked.
- **CSV parsing is simple** (comma-split, no quoted-comma support) —
  documented in the upload page itself. A manuscript with commas in a
  field needs the single-book upload path instead.
- **The book/edition/chapter data model is not fully re-architected.**
  `books` + `book_chunks` (per language) remains the storage shape; EPUB
  chapters map 1:1 onto the existing chunk-splitting logic
  (`splitManuscript`), which does preserve chapter boundaries for EPUB
  imports specifically, but there's no separate `editions`/`chapters`
  table. A deeper remodel was judged too risky to do silently inside this
  change — flag it if you need first-class multi-volume/omnibus support.
- **This is no longer a documented-but-unverified gap — it was confirmed
  live and is now fixed by `0000`/`0007`, not left as follow-up work.**
  Direct testing against the actual project (anon REST calls, no
  service-role key — see `docs/security-verification-2026-09.md`) showed a
  draft book's full row AND its `book_chunks.content` (the actual
  manuscript text, not just metadata) were both readable with no
  authentication at all, and that an author could `PATCH` their own book's
  `status` straight to `'published'` directly, bypassing review entirely.
  `src/lib/reader.server.ts`'s `resolveReaderAccess` already refused to
  serve gated content through the app's own server function, which is why
  the earlier draft of this document under-called this "metadata-only" —
  that was true of what the *app* returns, not of what the *database*
  allowed a direct REST client to read, and the two are not the same
  boundary. Apply `0000` (immediately, standalone) and `0007` (as part of
  the full sequence) — see §1 and §8.

## 6. Environment variables (names only — set actual values in your secret manager)

New, all server-only (never prefix with `VITE_`):

- `SUPPORT_RATE_LIMIT_PEPPER` — optional. A pepper mixed into the hashed IP
  used for the public support-report rate limit. Safe to leave unset (the
  hash still works, just without a pepper); set one if you want the hashes
  to not be reproducible outside this deployment.

Everything else needed by the admin surface (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) already existed — see
`.env.example`.

## 7. If a Gemini or Supabase key was ever pasted into chat, a commit, or a log

Rotate it in the provider's own dashboard (Google AI Studio for Gemini,
Supabase project settings for the service role key) and update it through
your secret manager / hosting platform's environment variables — never by
editing a tracked file. This guide can't do that for you; it's an owner
action.

## 8. Deployment plan (production is untouched until you run this)

Nothing in `0001`-`0007` has been applied to the live project. Section
5's last bullet and `docs/security-verification-2026-09.md` describe two
gaps in the CURRENT, already-live schema (an anonymous client can read a
draft's full manuscript text; an author can self-publish directly) that
are independent of this plan and covered by `0000` below — read that
document before this section; it changes what "safe to skip" means here.

**Order of operations, before touching anything else: take the backup in
§8.1 FIRST — even for `0000`, even though it's urgent, even though it's
additive.** Then run the schema-capture checks in §8.0. Only after both of
those, apply anything. "Urgent" is a reason to schedule the backup
promptly, never a reason to skip straight to applying the fix.

### 8.0 Check current state before applying anything

Do **not** assume 0001-0006 have never touched this database just because
this repo has no local migration history for them — that history not
existing here is not proof nothing was ever run by hand. Before applying
anything, in the SQL editor:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'books' order by 1;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'book_chunks' order by 1;

select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('admin_users', 'audit_log', 'translation_requests',
                      'book_translation_jobs', 'content_settings');
```

- If `books`/`book_chunks` already have columns like `rights_status` or
  `source_version`, or any of the new tables already exist, STOP and
  diff the live schema against these migration files column-by-column
  before proceeding — something was already partially applied, by hand or
  otherwise, and blindly replaying `0001`-`0007` risks a constraint
  conflict (harmless — the `if not exists`/existence-check guards in every
  file make a true re-run a no-op) or, worse, silently skipping a
  correction this change makes to something already there under the same
  name (a guard sees "already exists" and moves on — it does not check
  that the existing thing matches what the file would have created).
- Also run `supabase/inspect_current_access.sql` in full and keep the
  output — it's the baseline you compare against after `0000`/`0007` to
  confirm the old policy is actually gone, not just shadowed.
- As verified live on 2026-09-13 (see the verification doc), the current
  state of THIS project specifically is: `books`/`book_chunks` have only
  their pre-`0001` columns, and none of the new tables exist yet — so a
  full, in-order `0001`→`0007` apply is expected to be clean. Re-confirm
  this yourself at deploy time rather than trusting that it's still true.

### 8.1 Backup and recovery

- Before touching anything: take a fresh Supabase backup (Dashboard →
  Database → Backups → "Create backup" on paid plans, or
  `pg_dump` via the connection string on any plan) and note its timestamp.
- Every `create table`/`add column` in `0001`-`0007` is additive and
  guarded (`if not exists`), which means a *second* run of the same file is
  safe — but "additive" does not mean "cannot require recovery." A trigger
  or policy can still reject legitimate traffic if its logic is wrong for
  data you have that the design didn't anticipate, and a `security
  definer` function can still have a bug. Recovery for that is **not**
  "drop the trigger/policy" — that removes the exact protection you are
  deploying (e.g. `books_publish_gate`, `prevent_last_owner_removal`,
  `books_read_access`) and leaves the gap this change exists to close, wide
  open, silently, until someone notices. Instead:
  - Identify which specific check is firing and why (the trigger/policy
    functions all raise descriptive exceptions, or reject rows outright —
    check `error_events`/application logs first, not just "it errored").
  - If it's rejecting something that should legitimately be allowed, fix
    the check's *condition* (a new migration correcting the logic) rather
    than removing the check — apply the fix, re-verify with
    `inspect_current_access.sql`, and confirm the specific staging test
    from §8.3 that covers that check still passes.
  - A trigger/policy may be disabled **only** as a last-resort, time-boxed
    emergency measure (e.g. `alter table ... disable trigger <name>`) with
    an explicit plan to re-enable it in the same incident, never left off
    as a standing workaround — and never for `books_read_access`,
    `book_chunks_read_access`, `books_author_update`,
    `prevent_last_owner_removal`, or `check_book_publish_gate`
    specifically, since each one is the sole thing stopping a documented,
    now-verified exploit path. If one of these needs to come off to
    unblock a legitimate operation, that is itself a sign the policy's
    condition is wrong and needs a fix, not a sign the policy should stay
    off.
  - A full point-in-time restore from the §8.1 backup is only needed if
    data was actually corrupted/lost — which nothing in `0000`-`0007` does
    (no `drop`, `truncate`, or destructive `update` against existing rows
    anywhere in these files).
  - `0000` and `0007` specifically are each wrapped in one transaction with
    an explicit precondition check (aborts before changing anything if the
    schema doesn't match what the file expects) and a postcondition check
    (rolls back the WHOLE file if the expected policies don't exist
    afterward). A failed apply of either one means the transaction rolled
    back and the previous policy state is fully intact — there is no
    partial-replacement state to recover from for these two files
    specifically; the recovery step is "read the `RAISE EXCEPTION`
    message, fix the file or the schema mismatch it names, and re-run,"
    not a database-level recovery at all. This has not been tested end to
    end against a real database (no environment was available while
    writing it) — `supabase/tests/rls_hotfix_tests.sql` group 10 is the
    prepared, not-yet-run test for exactly this.

### 8.2 Exact migration order

```
(backup — §8.1 — and the schema check — §8.0 — happen before any of this)
0000  →  apply on its own, as soon as practical after backup+staging — it
          closes a live exposure in the CURRENT schema and does not depend
          on or wait for anything below, but it is NOT a substitute for
          the backup, and it has not itself been tested (§8.1, §8.3).
0001  →  0002  →  0003  →  0004  →  0005  →  0006  →  0007
```

Review each file's own header first. `0005` has real behavioral
consequences (the publish gate trigger and the `books.status` check
constraint) — read its header and run the
`select conname, pg_get_constraintdef(oid) ...` query it specifies
*before* applying it, in case a differently-named status constraint already
exists on the live `books` table (see §8.0). `0007` is **not** optional and
is **not** a "recommended, review later" suggestion — it is a required part
of this migration set, applied last because it's the only one that
references `is_admin()` (`0004`), the rights/edition columns (`0005`), and
`translation_requests` (`0006`) together. `0000` and `0007` both drop
**every existing policy on `books`/`book_chunks`, for every command**
(including one defined `FOR ALL`, which an earlier draft of both files
missed — see either file's header) before creating the correct one,
specifically so this does not depend on knowing an existing policy's name
or shape in advance, and so an old, more-permissive policy of any kind
can't quietly keep working alongside the new one (Postgres ORs together
every permissive policy for the same command). Both also adjust table/
column grants — see either file's step 2 — because a row-level policy
cannot, by itself, protect a column it never mentions.

### 8.3 Staging validation procedure

A real staging environment (a copy of this project with `0000`-`0007`
applied) was **not available to prepare this change** — no project the
available Supabase CLI session could reach shares this project's data, and
provisioning one requires the project owner's dashboard access, not
something obtainable from this environment alone. The anonymous/
authenticated REST tests in `docs/security-verification-2026-09.md` were
run against the real project directly (using only the anon key, with every
test row created and deleted within the same session) because they don't
require the new migrations to exist; the tests below DO require them, and
are written as an exact, ready-to-run procedure for whoever has staging
access — not yet executed.

1. **Existing behavior is unchanged**: `listBooks`/`getBook` still return
   the same published catalog; existing readers can still read published
   books in their existing languages; existing author dashboards still
   load.
2. **Owner bootstrap works** (§8.5) and `/admin` becomes reachable with a
   role + MFA.
3. **Publish gate**: create a test book via `/admin/books/new`, approve
   rights and edition, publish it — confirm it publishes without any
   English/Urdu translation existing, and that `pendingTranslations` shows
   both (see `computePublishGate`'s unit tests in
   `src/lib/admin/catalog.test.ts` for the same claim, implemented and
   passing locally — this staging step is the live-database confirmation
   the unit tests can't provide). Then confirm a raw SQL
   `update books set status='published' ...` on a book with
   `rights_status <> 'approved'` OR `edition_review_status <> 'approved'`
   is rejected by the trigger.
4. **Reader gate, via the website AND via direct REST** (not just the app
   UI, which can't be relied on as the boundary — see `0000`'s findings):
   - as an anonymous REST client, `GET /rest/v1/books?id=eq.<draft-id>`
     and `GET /rest/v1/book_chunks?book_id=eq.<draft-id>` both return
     empty/no rows for a draft/in_review/rejected/unpublished/archived
     book;
   - `/read/$bookId` for that same book returns "not available" for a
     signed-in non-author and for an anonymous visitor;
   - the book's own author can still open it, both via `/read/$bookId`
     and via `GET /rest/v1/books?id=eq.<own-draft-id>`;
   - a published original with no reviewed English/Urdu edition still
     renders normally at `/read/$bookId` in its own source language.
5. **Run the full `supabase/tests/rls_hotfix_tests.sql` suite** (currently
   marked NOT RUN in that file) against this staging database, both before
   `0000`/`0007` are applied (to see the vulnerable groups — 1, 4, 5, 6, 7
   — actually fail, confirming the test itself is meaningful) and after
   (to see every group pass). In particular:
   - **group 8** (a deliberately broad pre-existing `FOR ALL` policy):
     create a `for all using (true) with check (true)` policy on `books`
     first, confirm it produces the SAME leak as the original findings,
     THEN apply `0000`/`0007` and confirm the leak is gone and the
     `FOR ALL` policy no longer exists — this is the specific scenario an
     earlier draft of the hotfix would have missed;
   - **group 4** (insert a book already `status='published'`) and
     **group 5** (update/upsert a draft to `published`) — both must be
     rejected, not just the update path;
   - **group 6** (an author changing their own book's `author_id` to
     someone else) — must be rejected;
   - **group 7** (the owning author adding/replacing a chunk on their OWN
     already-published book) — must be rejected;
   - **group 10** (interrupt the migration mid-way, e.g. by breaking a
     precondition in a scratch copy) — confirm the transaction rolls back
     completely, never leaving some policies dropped and none recreated.
6. **Hindi/Arabic request → grant → revoke, via REST and via the app**:
   - as reader R, request Hindi access for a book (`requestTranslationAccess`
     or `POST /rest/v1/translation_requests`) — confirm the row lands as
     `status='requested'`, and that R **cannot** insert it pre-set to
     `status='granted'` or with a fabricated `reviewed_by`/`job_id`
     (`POST` with those fields should be rejected by the `0006` insert
     policy fixed in this change — 403 expected);
   - as an editor/admin, approve it — if no reviewed edition exists yet,
     confirm it becomes `approved_awaiting_edition` and exactly one
     production job is queued (a second reader requesting the same
     book+language should reuse that job, not start a second one);
   - process that job with a **small, bounded** batch (a short test book,
     `TRANSLATION_BATCH_SIZE` left at its small default) and a real but
     budget-capped `GEMINI_API_KEY` — confirm `book_translation_sections`
     rows move `pending → processing → done`, and the job reaches
     `awaiting_review` without ever setting `book_chunks.status='published'`
     before an admin explicitly reviews it;
   - review-and-publish the edition — confirm `available_languages` gains
     the language, and R's request (and only R's) flips to `granted`;
   - as R, confirm `/read/$bookId?lang=Hindi` now renders content, and
     `GET /rest/v1/book_chunks?book_id=eq.<id>&language=eq.Hindi` returns
     content for R's authenticated session but **not** for a different
     reader S who never requested it, and **not** for anon;
   - revoke R's access (`revokeTranslationAccess`) — confirm R immediately
     gets `translation_access_required` again from both the app and a
     direct REST call;
   - retry path: force one section to fail (e.g. a transient network
     error, or temporarily point `GEMINI_API_KEY` at an invalid value for
     one batch), confirm it's marked `failed` with a `last_error` and a
     bounded `next_attempt_at`, then confirm the health-page "retry" action
     clears it and processing resumes — never re-charges for a
     already-`done` section on retry.
   - **What could not be run from this environment**: any step above that
     calls the real Gemini API. `isGeminiConfigured()`/
     `processTranslationJobBatch` were reviewed and unit-tested for their
     branching logic only; no live Gemini call was made. Budget a single
     short (1-2 page) test book and watch `total_prompt_tokens`/
     `total_output_tokens` on the job row to confirm the "bounded" claim
     before running anything larger.
7. **Last-owner protection under real concurrency** (unit tests cover the
   pure logic; this specifically exercises the `pg_advisory_xact_lock` added
   to the trigger, which no unit test can): with two owners in staging,
   fire two `adminRevokeRole` calls at the same instant (e.g. two terminal
   tabs, or a small script issuing both requests without awaiting the
   first) targeting the two different owners. Expect exactly one to
   succeed and the other to fail with "Cannot remove the last active
   owner" — never both succeeding. Repeat a few times; a race is
   probabilistic, and one clean pass is not proof the lock works, only that
   it didn't fail that time.
8. **Admin operations require role + MFA**, tested directly against the
   server functions, not just the UI: call any `admin.*` server function
   (e.g. `adminPublishCatalogBook`) with a valid access token for an
   account that (a) holds no admin role, and separately (b) holds a role
   but has not completed an MFA challenge this session (`aal1`). Both must
   be rejected (`forbidden` / `mfa_required` respectively) — confirm by
   reading the response, not by trusting the UI never shows the button.
9. **Editors can preview an admin-uploaded book with no `author_id`**:
   as an editor (not owner/administrator), open an admin-uploaded book's
   detail page and confirm `catalog.read_unpublished` lets them see it
   despite `author_id is null` — this is exactly the case `0007`'s
   `books_read_access` policy's `is_admin(...)` clause exists for, since
   the `author_id = auth.uid()` clause can never match a null author.
10. Run `npm run test` and `npx tsc --noEmit` against the staging branch of
    the code — both pass cleanly locally against this branch (see
    `docs/seeparah-current-state-handoff.md` §6 for exact commands and
    output). `npm run lint`'s real exit code is **1** (not 0) against this
    branch, same as before any of this session's changes — almost all of
    it is pre-existing Windows CRLF line-ending noise across the whole
    repository, not new errors from this work (see the handoff report for
    the exact breakdown of CRLF vs. substantive issues) — but report the
    actual exit code and count from whatever the staging deploy builds,
    don't assume it matches this session's numbers.

Only after all of the above pass on staging, repeat the same migration
apply against production in the same maintenance window used for backup.

### 8.4 (removed — folded into §8.2)

There is no longer a separate "apply the recommended RLS policy" step.
`0007` is a required, ordinary part of the migration sequence in §8.2, not
a follow-up you might defer.

### 8.5 Secure owner bootstrap

1. Apply `0000` through `0007` to production (§8.2).
2. Have the intended owner sign in at least once (Google or email) so their
   `auth.users` row exists.
3. From a trusted machine (never from a browser, never committed anywhere):
   run `scripts/seed-owner.ts` per §2 above, with
   `SUPABASE_SERVICE_ROLE_KEY` set only in that shell's environment for the
   duration of the command.
4. Sign in as that account, go to `/admin`, and enroll MFA immediately —
   until MFA is enrolled, every admin server function refuses with
   `mfa_required`.
5. Grant any additional owners/administrators through `/admin/roles` (never
   by running `seed-owner.ts` again) so each grant is tied to a real actor
   and produces a normal audit-log entry with a reason.

### 8.6 Required environment variables

Set these in the hosting platform's secret manager, never in a committed
file:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — existing, required.
- `GEMINI_API_KEY` — existing, required for any translation processing;
  the app runs fine without it (uploads/reviews/publishing all still work),
  but `processTranslationJobBatch` refuses clearly instead of silently
  failing sections.
- `SUPPORT_RATE_LIMIT_PEPPER` — new, optional (see §6).
- Whatever `VITE_`-prefixed public config the existing `.env.example`
  already documents for the client bundle — unchanged by this work. Never
  put `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` behind a `VITE_`
  prefix; that would ship them to the browser.

### 8.7 Deployment order and post-deployment checks

0. **If nothing else in this plan can happen yet, apply `0000` on its own
   first anyway** (§8.0's checks still apply to it — it only touches
   `books`/`book_chunks`, which are confirmed to already exist with their
   pre-`0001` shape). It closes a verified, currently-live exposure and
   does not wait on anything else in this change.
1. Take the backup (§8.1).
2. Apply migrations `0000` through `0007` to production (§8.2), during a
   maintenance window, having completed §8.0's checks and §8.3's staging
   pass first.
3. Deploy the application code (this branch) — the code already tolerates
   the new columns/tables existing or not (falls back safely), but should
   not be live in production *before* the migrations that back it, or the
   new admin surface will error against missing tables.
4. Run the owner bootstrap (§8.5).
5. Post-deployment checks, in this order:
   - `/admin` loads and prompts for MFA enrollment for the new owner.
   - The public catalog (`/library`) still shows exactly the previously-
     published books — no count change, no missing covers.
   - A real (non-demo) `/read/$bookId` page for an existing published book
     still renders content.
   - As anonymous REST, `GET /rest/v1/books` and `GET /rest/v1/book_chunks`
     no longer return anything for a non-published book — re-run the exact
     checks in `docs/security-verification-2026-09.md` and confirm they now
     come back empty instead of exposing content.
   - `getPublicContentSettings` (or the equivalent public
     `content_settings` read) returns `monetization_enabled: false` (or
     whatever it was already) — never `true` by surprise.
   - Trigger one real end-to-end admin action (e.g. upload a small test
     book, approve it, publish it, then archive it) and confirm a
     corresponding `audit_log` row appears for each step.

## 9. Mobile app

See `docs/mobile-api-contract.md` for exactly what the (separate, not
present in this repository) mobile app needs to consume: the public content
settings shape, the reader access-check contract, and the translation
request/access state machine.
