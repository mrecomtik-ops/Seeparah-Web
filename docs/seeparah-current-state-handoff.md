# Seeparah website — current-state handoff report

Prepared 2026-09-14, for external review (ChatGPT); **revised 2026-09-14
after that review** to correct the issues it found in the hotfix migration
and in this report's own evidence language (see §7's "Confirmed defects
and changes made" for the specific list). This is an inspection report
only: no application code was changed, nothing was committed, pushed,
deployed, or applied to any database as part of producing either version.
Three kinds of evidence appear throughout, labeled explicitly wherever it
matters:

- **Previously recorded** — findings already written down in this repo's
  own docs (`docs/security-verification-2026-09.md`,
  `docs/admin-operator-guide.md`, `docs/mobile-api-contract.md`,
  `supabase/inspect_current_access.sql`) from an earlier session's live
  testing (2026-09-13/14, before this report).
- **Checked now** — re-verified directly while producing this report, via
  read-only commands whose exact output is quoted below.
- **Written, not verified** — code or SQL that exists and was reviewed,
  but has not been run against any database, staging environment, or
  live deployment. This applies to most of the corrections made in this
  revision (see `supabase/migrations/0000_hotfix_current_books_rls.sql`,
  `0007_finalize_access_policies.sql`, and
  `supabase/tests/rls_hotfix_tests.sql`) — do not read "written, not
  verified" as equivalent to "previously recorded" or "checked now."

No credentials, API keys, access tokens, or database passwords appear
anywhere in this document.

---

## 1. Git status

**Repository**: `https://github.com/mrecomtik-ops/Seeparah-Web.git` (remote
`origin`, fetch and push both point here).

**Branch**: `main`, confirmed genuinely up to date with `origin/main` after
a live `git fetch origin` run for this report (not just a stale cached
status) — `git status -sb` → `## main...origin/main` with no `ahead`/
`behind` marker.

**HEAD**: `20d7f448ff272e824b931ab0fc6ba3ce3d0bf4c3`, committed
2026-09-12 08:55:54 +0400, subject "Rework translation pipeline onto
Gemini, fix launch-blocking bugs, add tests".

### Full commit history (22 commits total — fewer than 30 exist)

| Commit | Date | Subject |
|---|---|---|
| `20d7f44` | 2026-09-12 | Rework translation pipeline onto Gemini, fix launch-blocking bugs, add tests |
| `c2746e9` | 2026-09-11 | Add project README |
| `7e6cd8f` | 2026-09-11 | Built Seeparah product depth |
| `cd27f98` | 2026-09-11 | Changes |
| `1a110fa` | 2026-09-11 | Work in progress |
| `f8267e6` | 2026-09-11 | Fixed library imports and UX |
| `c191966` | 2026-09-11 | Changes |
| `d231456` | 2026-09-11 | Changes |
| `12fc082` | 2026-09-11 | Work in progress |
| `968ff55` | 2026-09-11 | Add integration configuration from remix |
| `5c529d5` | 2026-09-11 | Added email auth & library |
| `fee9a47` | 2026-09-11 | Changes |
| `c785029` | 2026-09-11 | Changes |
| `267fc77` | 2026-09-11 | Changes |
| `ded0ef8` | 2026-09-11 | Enabled Supabase and built app |
| `0493 5a8` | 2026-09-11 | Changes |
| `5b147aa` | 2026-09-11 | Changes |
| `f29e469` | 2026-09-11 | Changes |
| `9909eb9` | 2026-09-11 | Changes |
| `0553cae` | 2026-09-11 | Changes |
| `abdc297` | 2026-09-11 | Changes |
| `e0961cf` | 2026-09-11 | Work in progress |
| `5081cd0` | 2026-09-08 | template: tanstack_start_ts_current-7da8770d11d6 |

Most commit messages ("Changes", "Work in progress") are not descriptive —
this is a Lovable-platform-generated history (see §2), not hand-authored
commit hygiene. Categorization below is by actual changed files
(`git show --stat`), not by message.

### Which commits contain which kind of change

- **Admin roles / MFA / audit / catalog review / translation-access /
  support / content settings (the entire `/admin` surface)**: **zero
  commits.** `git log --oneline -- src/lib/admin/` returns nothing —
  `src/lib/admin/`, `src/components/admin/`, `src/routes/admin/`,
  `src/routes/auth/reset-password.tsx`, `scripts/seed-owner.ts`, and all
  four `docs/*.md` files are **entirely untracked**, present only in this
  local working tree. This is the single most important fact in this
  report: the whole admin/security review system described in
  `docs/admin-operator-guide.md` has never been committed, let alone
  deployed.
- **Translation pipeline**: `e0961cf` and `ded0ef8` (2026-09-11) introduced
  the original `translate.functions.ts`. `20d7f44` (2026-09-12) replaced it
  with the current Gemini-based `translation.server.ts` /
  `translation.functions.ts` / `gemini.server.ts`, and added
  `reader.server.ts` / `reader.functions.ts` for server-side access
  checks. Migrations `0001`-`0003` were added in this same commit.
- **Reader access control**: `src/lib/reader.server.ts` was introduced in
  `20d7f44` — its current, uncommitted state (with the `resolveReaderAccess`
  catalog-status gate) is a working-tree modification on top of that
  commit; the committed version does not have that gate.
- **Security / RLS**: the base `books`/`book_chunks`/`book_shelves`/
  `reading_progress`/`user_subscriptions` tables and their original RLS
  policies predate every commit in this repo (created directly in the
  Supabase project, outside git history — stated in migration `0001`'s own
  header and consistent with what querying the live project shows, §4).
  `20d7f44` added migrations `0001`-`0003` (hardening columns, translation
  job/section tables, author-profile policies). Migrations `0004`-`0007`
  and `0000` are all untracked, working-tree-only.
- **Auth UI** (`auth.tsx`, `use-auth.ts`): touched by many of the
  "Changes"/"Work in progress" commits (`f8267e6`, `d231456`, `5c529d5`,
  `c785029`, `9909eb9`, `ded0ef8`, `e0961cf`) — routine sign-in flow work,
  not the admin role/MFA system, which is separate and uncommitted.

### Modified / untracked files (working tree right now)

**Modified (tracked, uncommitted changes)**:
`.env.example`, `package-lock.json`, `package.json`, `roadmap.md`,
`src/components/AppHeader.tsx`, `src/integrations/supabase/types.ts`,
`src/lib/data.ts`, `src/lib/library.ts`, `src/lib/reader.server.ts`,
`src/lib/translation.server.ts`, `src/routeTree.gen.ts`,
`src/routes/author.book.$bookId.tsx`, `src/routes/author/index.tsx`,
`src/routes/legal.tsx`, `src/routes/read.$bookId.tsx`,
`src/routes/subscribe.tsx`,
`supabase/migrations/0001_translation_pipeline_and_hardening.sql`.

**Untracked (new, never committed)**:
`docs/` (3 files), `scripts/seed-owner.ts`, `src/components/admin/`,
`src/lib/admin/` (25 files), `src/lib/error-log.server.ts`,
`src/lib/reader.server.test.ts`, `src/routes/admin/` (10 files across 3
subdirectories), `src/routes/auth/reset-password.tsx`,
`supabase/inspect_current_access.sql`,
`supabase/migrations/0000_hotfix_current_books_rls.sql`,
`supabase/migrations/0004_admin_roles_and_audit.sql`,
`supabase/migrations/0005_catalog_rights_and_review_workflow.sql`,
`supabase/migrations/0006_support_translations_settings.sql`,
`supabase/migrations/0007_finalize_access_policies.sql`.

**Not present as changes**: `.env` itself is untracked and was not
modified — no secret material appears in git status.

### Remote-tracking freshness

**Current, not stale** — checked now via `git fetch origin` immediately
before writing this report; `origin/main` resolves to the same
`20d7f448...` HEAD as local `main`, with zero commits ahead or behind.

---

## 2. Deployment

**Hosting**: this is a [Lovable](https://lovable.dev)-built and -hosted
application (`package.json` depends on `@lovable.dev/cloud-auth-js` and
`@lovable.dev/vite-tanstack-config`; `README.md` describes it as a Lovable
project; commit history is Lovable-platform-generated). The build target
configured by Lovable's shared Vite config is **Cloudflare Workers** —
confirmed by running `npm run build` for this report: it succeeds and
emits `.output/server/wrangler.json` with
`"name": "mrecomtik-ops-seeparah-web"` (matching the GitHub org/repo) and
Cloudflare Worker compatibility settings. `vite.config.ts` itself documents
this: "nitro (build-only using cloudflare as a default target)". No
Cloudflare account/dashboard access was available to confirm this from the
hosting side directly.

**Website URL**: `https://pic-perfect-clone-44.lovable.app` — this exact
URL was independently confirmed twice from two different angles: (a) it is
the `redirect_to` target embedded in this project's own Supabase
email-confirmation links (seen during the earlier live security testing,
`docs/security-verification-2026-09.md`), and (b) checked now, it serves
the live app (see below). No custom domain was found configured or
referenced anywhere in the repo.

**Checked now** — live routing behavior at that URL:

```
GET https://pic-perfect-clone-44.lovable.app/library                              → 200
GET https://pic-perfect-clone-44.lovable.app/read/11111111-1111-1111-1111-111111111111 → 200
GET https://pic-perfect-clone-44.lovable.app/admin                                → 404
GET https://pic-perfect-clone-44.lovable.app/admin/roles                          → 404
GET https://pic-perfect-clone-44.lovable.app/this-route-does-not-exist-xyz        → 404
```

`/admin` and `/admin/roles` return the exact same 404 as a route that does
not exist at all, while known real routes return 200 — this is
**server-side evidence** (this app uses TanStack Start SSR, not a pure
client-side SPA fallback) that **the deployed build does not include the
admin route tree**, consistent with §1's finding that `src/routes/admin/`
has never been committed.

**Latest successful production deployment / deployed commit**: **not
verifiable from here.** The response includes an `x-deployment-id` header
(a Lovable-internal opaque identifier, not a git SHA) and no other
build-info endpoint was found. Lovable's own build/deploy pipeline is not
necessarily triggered by pushes to this GitHub mirror (no
`.github/workflows/` exists in this repo — checked now, directory absent),
so even "latest commit on `origin/main`" cannot safely be assumed to be
what Lovable last deployed from.

**Does production match local HEAD?** **Production commit not verified.**
What IS verified: production's live Supabase schema (checked now, see §4)
still lacks every table added by migrations `0001`-`0007`, and production
serves no `/admin` route — both facts are consistent with production
running code at or before `20d7f44` and not the current uncommitted
working tree, but this is inference from behavior, not a confirmed commit
match.

---

## 3. Feature status

Legend: **DB** = persisted in the real Supabase database for a signed-in
account; **Device** = `localStorage`-only via `demoStore`
(`src/lib/data.ts`), lost on another device/browser; **Demo** = only used
when there is no backend row or the user is in demo mode.

### Authentication and account recovery
- Google and email/password sign-in via Supabase Auth
  (`src/routes/auth.tsx`, `src/lib/use-auth.ts`). **DB** (this is Supabase
  Auth's own `auth.users`).
- Password reset: `src/routes/auth/reset-password.tsx` (untracked, new) +
  admin-triggered `sendUserRecoveryEmail`
  (`src/lib/admin/users.functions.ts`) using
  `supabase.auth.resetPasswordForEmail` — Supabase's own configured mailer,
  no separate email provider in this codebase. Refuses for Google-only
  accounts (no password to reset) — checked in code
  (`src/lib/admin/users.server.ts:128-134`).
- **Confirmed working live** (checked now, during earlier live testing per
  `docs/security-verification-2026-09.md`): the full signup →
  email-confirmation → password sign-in flow works end-to-end against
  production's real Supabase Auth, using a real confirmation email link.

### Admin roles, MFA and owner setup
- Fully implemented in code: `src/lib/admin/permissions.ts` (role→capability
  matrix), `require-admin.server.ts` (every admin server function re-checks
  the caller's JWT, role, and `aal2` MFA level server-side — not a UI-only
  gate), `AdminMfaGate.tsx` (real TOTP enrollment via
  `supabase.auth.mfa.*`), `scripts/seed-owner.ts` (one-time CLI bootstrap,
  not wired into the app).
- **Not deployed** (§1, §2) and **cannot function** until migrations
  `0004` (creates `admin_users`, `audit_log`, `is_admin()`, the last-owner
  trigger) and `0006` are applied — checked now, `admin_users` does not
  exist in production (`GET /rest/v1/admin_users` → `PGRST205: Could not
  find the table`).
- Local unit tests pass for the permission matrix
  (`src/lib/admin/permissions.test.ts`, 5 tests) and the last-owner
  concurrency logic is in a DB trigger with a `pg_advisory_xact_lock`
  (`supabase/migrations/0004_admin_roles_and_audit.sql`) — **not
  exercisable against a real concurrent-request race without a live
  database**; not run.

### Admin uploads and supported formats
- `src/routes/admin/books/new.tsx` + `src/lib/admin/catalog.server.ts`:
  single-book upload (paste UTF-8 text, or `.epub` file — `accept=".epub"`
  on the file input) and CSV batch import with a dry-run preview.
- PDF is explicitly and accurately **not supported** — the upload page's
  own copy says so ("UTF-8 text and EPUB are supported; PDF isn't yet"),
  the file input only accepts `.epub`, and `src/lib/admin/epub.server.ts`
  refuses image-only/scanned EPUB content with a "needs OCR" message
  rather than silently mis-extracting it. Verified by reading the code, not
  by uploading a live file (no deployed admin surface to upload to, §2).
- CSV parsing is simple comma-split (no quoted-comma support) —
  documented in the upload page itself and in
  `docs/admin-operator-guide.md` §5.
- No content-preview step before creating the draft (the admin sees the
  CSV dry-run validation, not a rendered preview of the manuscript text) —
  a real, minor gap, not a false claim in the docs.

### Author submissions and approval
- Authors submit via the existing (committed) publish flow
  (`src/lib/library.ts`'s `publishBook`, `src/routes/author.book.$bookId.tsx`)
  — writes directly to `books`/`book_chunks` as the authenticated user
  (not a server function). **DB**.
- As of the code in this working tree, an author can only move their own
  book `draft → in_review` or back to `unpublished`/`draft` through the
  UI — the "Publish" transition is admin-only
  (`src/lib/admin/catalog.server.ts`'s `publishBook`, gated on
  `catalog.publish`).
- **This was NOT true of production as of the last live check** (previously
  recorded, `docs/security-verification-2026-09.md`): a disposable test
  author was able to `PATCH` their own draft's `status` directly to
  `'published'` via a raw REST call, bypassing the UI and any review,
  because the underlying RLS `UPDATE` policy on `books` had no status
  restriction at all. This is exactly the gap
  `0000_hotfix_current_books_rls.sql` / `0007_finalize_access_policies.sql`
  close — **neither has been applied**, so as far as could be verified,
  **this self-publish path is still open in production today.**

### Rights/editorial review and publication
- `src/lib/admin/catalog.server.ts`: separate `rights_status` and
  `edition_review_status` fields, reviewed independently
  (`reviewRights`, `reviewEdition`), each writing an `audit_log` row.
- Publish gate (`computePublishGate`, unit-tested in
  `src/lib/admin/catalog.test.ts`, 6 passing tests — **local unit tests
  only**, not staging): requires both approvals; a missing English/Urdu
  translation is reported as `pendingTranslations`, never blocking. Mirrored
  in the DB by the `check_book_publish_gate` trigger in migration `0005`.
  Neither the code path nor the trigger can be exercised against a real
  database until `0004`-`0007` are applied — not deployed (§2).
- Depends entirely on the (uncommitted, undeployed) admin system above.

### Gemini translation approval, processing, retries and reuse
- `src/lib/translation.server.ts`: `ensureTranslationJob` is idempotent per
  `(book_id, language, source_version)` — a second request/approval for the
  same edition reuses the existing job rather than starting a second one.
  Submitting a request never calls Gemini directly; `processTranslationJobBatch`
  (a separate, explicit step) does, in small bounded batches
  (`TRANSLATION_BATCH_SIZE`, default 3 sections/call), tracking
  `attempts`/`last_error`/`next_attempt_at` per section for retries, and
  `total_prompt_tokens`/`total_output_tokens` per job for usage.
  `book_chunks.status` only becomes `'published'` after an explicit
  admin/author review-and-publish action (`publishReviewedEdition`), never
  automatically when generation finishes.
- **This is committed** as of `20d7f44` (the Gemini rework), so it is
  plausibly live in production in some form — but the review-and-publish
  gate that stops it from silently going live to all readers depends on the
  same `books`/`book_chunks` review columns, some of which (`human_reviewed`
  on `book_translation_jobs`) already exist pre-`20d7f44`. Not independently
  re-tested against production for this report (would require submitting a
  real translation request and consuming Gemini budget — out of scope,
  §6).
- Local unit tests exist for the pure validation/retry-delay logic
  (`src/lib/translation.test.ts`) — passing. No live Gemini call was made
  for this report or the prior session.

### Translation access grants and revocation
- Reader-requested Hindi/Arabic access
  (`src/lib/admin/translation-access.server.ts`): request → admin
  approve/decline/revoke, fully separate from production of the edition
  itself (approving with no reviewed edition yet queues exactly one job and
  marks the request `approved_awaiting_edition`, auto-granting only that
  requester once the job publishes).
- A real bug was found and fixed in this area during earlier review
  (previously recorded): the `translation_requests` INSERT policy in
  migration `0006` did not restrict `status`/`job_id`/`reviewed_by` on
  insert, meaning a reader could have inserted their own request pre-set to
  `status='granted'`. Fixed in the working tree; **not deployed** (the
  table doesn't exist in production yet, so this specific bug was never
  live — it would have shipped live had `0006` gone out unfixed).
- Entirely undeployed — `translation_requests` does not exist in
  production (checked now).

### Reading progress, resume, highlights, bookmarks and favorites
- **Reading progress** (`reading_progress` table, `src/lib/library.ts`):
  **DB** for signed-in users, **Device** fallback for demo/offline.
- **Highlights** (`book_highlights` table): **DB** for signed-in users,
  **Device** for demo.
- **"Favorites"/"Saved"/"Want to read"** are the three `book_shelves` shelf
  kinds (`src/lib/shelves.ts`, `ShelfKind` in `src/lib/data.ts`): **DB**
  for signed-in users via `toggleShelf`, **Device** for demo. "Bookmark" in
  the UI (`src/routes/library.tsx`, `src/routes/profile.tsx`) is the icon
  label for the "Saved" shelf — there is no separate bookmarks table or
  feature.
- **Reading streak / "reading days"** (`recordReadingDay`,
  `currentStreak` in `src/lib/shelves.ts`): **Device-only, always** — even
  for a signed-in real account, this is `localStorage` via `demoStore`,
  never written to Supabase. This is a real, current limitation: streak
  state does not sync across devices/browsers for any user.

### Support, content settings and audit logs
- Support tickets (signed-in + anonymous "can't sign in" report form with a
  honeypot and per-IP-hash daily rate limit): code complete
  (`src/lib/admin/support.server.ts`/`support.functions.ts`,
  `src/routes/legal.tsx`). A real bug (the honeypot's Zod schema rejected
  bot submissions with a visible error instead of silently accepting them)
  was found and fixed during earlier review.
- Versioned content settings (home collections, announcements, maintenance
  banner, `monetization_enabled`, etc.) with publish/rollback history:
  code complete (`src/lib/admin/settings.server.ts`).
- Audit log: every privileged mutation writes a redacted `audit_log` row
  (secrets/long text stripped — `src/lib/admin/audit.server.ts`'s
  `redact`, unit-tested, 4 passing tests). Read-only in the UI; only ever
  written by service-role code — no authenticated-role write policy exists
  on `audit_log` at all (§4).
- All of this depends on migrations `0004`/`0006`, **not applied** —
  entirely undeployed.

### Free-launch behavior and remaining payment code
- `monetization_enabled` (a `content_settings` row, defaulting to `false`
  even if the row is missing) is the single switch; while off, every book
  is free regardless of `access_type`/`subscription_price_usd`
  (`src/lib/reader.server.ts`'s `resolveReaderAccess`).
- Remaining payment code: `access_type`/`subscription_price_usd` columns on
  `books`, a `user_subscriptions` table, and
  `activateTestModeSubscription` — explicitly documented in the code's own
  comments as **test-mode only, no Stripe/payment-provider integration
  exists in this codebase**. `src/routes/subscribe.tsx` presents this as
  "Stripe test-mode messaging" per `roadmap.md`. Confirmed no `stripe`
  package dependency or API key handling anywhere in `src/` (checked now,
  grep for "stripe"/"Stripe" only matches UI copy/comments, not an SDK
  integration).

### Shared mobile backend compatibility (PROPOSED, not implemented)
- `docs/mobile-api-contract.md` **proposes** a reader access-check contract,
  public content settings shape, and translation request/access state
  machine for the separate (not present in this repo) Flutter app to
  adopt. Nothing in the mobile app has been changed, and this contract has
  not been implemented or tested against it, or against any client.
- Updated during earlier review to note the `locked` flag now
  disambiguates "book unknown to backend" from "book found but gated" for
  the `not_available` reason, and that the publish gate does not require a
  finished translation — both are proposed contract details, same caveat.
- **Not independently tested against the mobile app** (it isn't in this
  workspace) — this is a proposal for the intended contract, not a
  verified integration, and should not be described as "the mobile
  contract" without that qualifier until an actual mobile client
  implements and tests against it.

---

## 4. Database and security

### Every migration, its purpose, and application status

**On the "checked now" / "table absent" evidence below**: every "No" in
this table is based on a `PGRST205`/schema-cache-miss response from
PostgREST. That is evidence about what PostgREST currently exposes, not a
substitute for reading actual migration/DDL history — it does not by
itself rule out a table having existed and been dropped, or existing
outside PostgREST's exposed schema. It is the most direct evidence
obtainable without SQL/dashboard access (never available in this or the
prior session), and is treated here as strong, not as definitive proof of
complete migration history.

| File | Purpose | Applied in production? |
|---|---|---|
| `0001_translation_pipeline_and_hardening.sql` | `books.source_version`; `book_chunks.status`/`source_version`/`job_id`; `book_translation_jobs`/`sections`/`guides`; `author_profiles`; `translation_reports` | **No** — checked now: `book_chunks` has only `book_id, language, chunk_index, content`; none of the new tables exist |
| `0002_highlight_notes.sql` | adds a `note` column to `book_highlights` | Not independently re-verified this session (small, low-risk) |
| `0003_gemini_provider_and_usage.sql` | provider/usage columns on translation jobs | Not independently re-verified this session |
| `0004_admin_roles_and_audit.sql` | `admin_users`, `is_admin()`, last-owner trigger (with advisory lock), `audit_log`, `admin_action_events` | **No** — checked now, table absent |
| `0005_catalog_rights_and_review_workflow.sql` | rights/edition-review columns on `books`, extended `status` vocabulary, `check_book_publish_gate` trigger | **No** — checked now, `books` lacks `rights_status`/`edition_review_status` |
| `0006_support_translations_settings.sql` | `support_tickets`/notes/rate-limit, `translation_requests`, `content_settings`(+history), `error_events` | **No** — checked now, tables absent |
| `0000_hotfix_current_books_rls.sql` (new) | urgent fix for the CURRENT schema's `books`/`book_chunks` RLS (see below) | **No** |
| `0007_finalize_access_policies.sql` (new) | final admin-role-aware version of the same policies, applied after `0004`-`0006` exist | **No** |

**Any applied migration later edited locally?** None of `0001`-`0007` have
been applied anywhere (production, or any other environment reachable from
this session), so this doesn't currently apply. One relevant fact: `0006`'s
`translation_requests` insert policy WAS edited after being written (the
self-grant bug fix, §3) — but that happened before it was ever applied
anywhere, not after.

**A related, separate, already-committed finding**: a data-remediation
script committed in `20d7f44`,
`supabase/remediation/2026-09-12_duplicate_lantern_in_the_rain.sql`,
documents (from an earlier session's own live, read-only investigation) a
real duplicate catalog row — a seeded "The Lantern in the Rain" and a
byte-identical duplicate created by a real author
(`4578aa11-4cfa-4762-9788-934bc04a0e19`) via the "load sample manuscript"
shortcut. It is a proposed `UPDATE ... SET status = 'unpublished'`,
explicitly **not applied**, awaiting human sign-off. Not re-verified this
session beyond confirming the file's presence and content.

### Resolving the "metadata-only" contradiction

**Resolved, with evidence, previously recorded**: it was NOT metadata-only.
Live testing (`docs/security-verification-2026-09.md`) showed a disposable
test author's `book_chunks.content` — the actual manuscript text of a
`status='draft'` book — was readable by a fully anonymous REST client with
no authentication at all. The earlier, weaker "metadata-only" claim was
based on the app's own server function (`resolveReaderAccess`) correctly
refusing the content — which is a real protection, but not the same
boundary as the database's own RLS policy, which a direct REST call
bypasses the app entirely to reach.

**Checked now, to confirm this is still the live state**:
```
GET .../rest/v1/books?status=neq.published&select=id,status  → []
```
(No non-published rows are currently visible — consistent with there being
none in the table right now, not proof the policy is fixed; the actual
policy content could not be re-verified without SQL access, and the
underlying RLS policy has not been changed in production.)

### Actual evidence about RLS, grants, exposed views and callable functions

- **RLS enabled**: yes, on `books`/`book_chunks` — inferred from behavior
  (INSERT/UPDATE attempts were correctly rejected in ways only possible if
  RLS is active), not from reading `pg_policies` directly (no SQL access
  was available; see `supabase/inspect_current_access.sql` for the
  prepared read-only script to get the exact policy names/definitions from
  someone with SQL editor access).
- **Grants**: not independently confirmed via `information_schema` (same
  access limitation). Behaviorally: anon has SELECT (works), no working
  INSERT (401 without a user session), an authenticated user has INSERT
  scoped to their own `author_id` (spoofing attempts get 403) and UPDATE
  scoped to their own row (cross-user attempts return 0 rows affected).
- **Views**: none found by grepping this repo for view-creation SQL; not
  confirmed against the live `information_schema.views` (needs SQL
  access — in the inspection script).
- **Callable (`SECURITY DEFINER`) functions**: by code review, only
  `current_admin_role()`, `is_admin()`, `prevent_last_owner_removal()`,
  `check_book_publish_gate()` — all in migrations `0004`/`0005`, all
  narrowly scoped, none yet applied to production. No live enumeration of
  `pg_proc` was possible without SQL access.

### Can direct REST calls expose unpublished manuscripts or restricted translations?

- **Unpublished manuscripts**: **yes, previously recorded, live-confirmed**
  — see above. Not yet fixed in production (`0000` not applied).
- **Restricted (Hindi/Arabic) translations**: **cannot currently be tested
  either way** — `translation_requests` and the `book_chunks.status`
  column this gate depends on do not exist in production yet. By code
  review, once `0001`-`0007` are applied, the gate is enforced in three
  independent places: `resolveReaderAccess` (app), `check_book_publish_gate`
  /RLS (DB), and the `book_chunks_read_access` policy's Hindi/Arabic clause
  in `0007`.

### Can authors/readers alter approval fields, roles or access grants?

- **`books.rights_status`/`edition_review_status`**: no authenticated-role
  UPDATE policy grants these columns at all in the new migrations (service
  role only) — by code review; not live-testable (columns don't exist in
  production yet).
- **`books.status` → `'published'` directly**: **yes, currently possible in
  production** (see above) — the specific, verified, still-open gap.
- **`admin_users` (roles)**: no authenticated-role INSERT/UPDATE policy at
  all in migration `0004` — by code review; table doesn't exist in
  production yet so not live-testable, but there is no path once it does.
- **`translation_requests` grants**: a reader can INSERT their own request
  row, but (after the fix in this working tree) only pre-set to
  `status='requested'` with every review-owned field null — cannot
  self-grant. Not live-testable (table doesn't exist yet).
- **`audit_log`**: no authenticated-role write policy of any kind — by
  code review.

### Server-side identity, permissions, and MFA enforcement

By code review of `src/lib/admin/require-admin.server.ts`: every admin
server function independently re-derives the caller's identity from a
verified Supabase access token (`supabaseAdmin.auth.getClaims`), looks up
their role from `admin_users` itself (never trusts a client-supplied role),
and checks the token's `aal` claim equals `aal2` before allowing any
mutation — this is enforced per-call, server-side, not only by hiding
admin UI. **Not live-testable** — the admin system isn't deployed.

### Editor preview access for admin-uploaded books (no `author_id`)

By code review: `0007_finalize_access_policies.sql`'s `books_read_access`
policy includes `public.is_admin(array['owner','administrator','editor'])`
specifically because an admin-uploaded book has `author_id = null`, so the
`author_id = auth.uid()` clause can never match it — an editor needs the
staff clause to see it at all. **Not live-testable** (undeployed).

### Last-owner concurrency protection and audit integrity

- The `prevent_last_owner_removal` trigger (migration `0004`) takes a
  `pg_advisory_xact_lock` before counting remaining owners, specifically to
  close a race where two concurrent revokes of two different owners could
  both succeed and leave zero owners. **This is a code-level fix,
  unverified against a real concurrent-request race** — that requires a
  live database with two actual owner accounts and simultaneous requests,
  which was not available. See §7.
- Audit integrity: `audit_log` has no authenticated-role write policy at
  all (service-role only) — by code review, not live-tested.

---

## 5. Product-rule compatibility

| Rule | Status | Evidence |
|---|---|---|
| Launch is free | ✅ as coded | `monetization_enabled` defaults false even if the settings row is missing (`src/lib/reader.server.ts`) |
| Authors cannot self-publish | ❌ **not true in production today** | Live-confirmed direct self-publish via REST, previously recorded; the fix (`0000`/`0007`) is written and revised after further review, but **not verified against any database and not applied** |
| Approved originals can publish without waiting for translations | ✅ as coded, locally unit-tested | `computePublishGate` (`src/lib/admin/catalog.test.ts`, 6 tests) and the corrected `check_book_publish_gate` trigger (migration `0005`) — not yet live |
| English/Urdu are standard translation targets | ✅ as coded | `computePublishGate`'s `pendingTranslations`; admin can queue either via the new `adminQueueTranslationJob` action |
| Hindi/Arabic require an approved reader request | ✅ as coded | `REQUEST_GATED_LANGUAGES` in `reader.server.ts`, `REQUESTABLE_LANGUAGES` in `translation-access.server.ts` — not yet live |
| Submitting a request does not immediately call Gemini | ✅ as coded | `requestTranslationAccess` only inserts a row; `ensureTranslationJob`/`processTranslationJobBatch` are separate, admin/cron-triggered steps |
| Reviewed translations are stored and reused per source version + language | ✅ as coded | `ensureTranslationJob`'s idempotent lookup on `(book_id, language, source_version)`; `findReviewedEditionJob` reuses a published, human-reviewed job for new grants |
| Generation and reader access are separate decisions | ✅ as coded | `publishReviewedEdition` (produces the edition) vs `grantAccessForPublishedJob` (grants specific requesters) are distinct functions/steps |

Every "✅ as coded" row above reflects the **uncommitted working tree**,
verified by local unit tests and code review, **not** by a live end-to-end
run — none of it is deployed. The one row that could be live-tested against
real production (self-publish) is the one that currently fails.

---

## 6. Verification

All commands run from the repository root, 2026-09-14, for this report.

```
$ npx vitest run
 Test Files  9 passed (9)
      Tests  65 passed (65)
```
**Unit tests only** — no database, no browser, no network. Covers: the
permission matrix, CSV parsing, EPUB extraction/validation, audit redaction,
the publish-gate decision logic, and the reader access-gate decision logic
(16 of the 65 tests, added during earlier review, specifically target the
catalog-status/subscription/translation-request bypass scenarios).

```
$ npx tsc --noEmit -p .
(no output — exit 0)
```

```
$ npx eslint . > /tmp/eslint_recheck.txt 2>&1; echo "ESLINT_EXIT_CODE=$?"
ESLINT_EXIT_CODE=1
✖ 13720 problems (13709 errors, 11 warnings)
```
**Correction**: an earlier pass of this report captured `$?` after piping
eslint's output through `tail`, which reports `tail`'s exit code (0), not
eslint's — a real mistake, not a rounding choice. eslint's own exit code,
captured correctly above with no pipe in between, is **1** (failure), as
expected for any run with unfixed errors. `npm run lint`'s effective
status for this branch is: **fails**, for the reasons below — mostly
pre-existing formatting noise, not new logic errors, but the tool's own
exit status is failure and should be reported as such, not smoothed over.

Of the 13709 errors, **12,589 are `Delete ␍` (Windows CRLF line-ending)
errors**,
pre-existing across most of the repository (confirmed by running the same
lint against the last commit before any of this session's changes — the
same ~1400+ CRLF errors were already present). Excluding those: **1120
`prettier/prettier` formatting-only issues**, plus **12 substantive
items**: 7 `react-refresh/only-export-components` warnings, 4
`react-hooks/exhaustive-deps` warnings, 1 `prefer-const` error — all in
files untouched by the admin/security work (e.g. `src/lib/use-auth.ts`,
`src/routes/library.tsx`), pre-existing, not new.

```
$ npm run build
✓ built in 1.21s
[nitro] Generated .output/server/wrangler.json
[nitro] Generated .output/public/_headers
```
**Build succeeds**, including every new admin-related module (visible as
separate output chunks: `catalog.functions-*.mjs`, `catalog.server-*.mjs`,
`users-*.mjs`, `translation.server-*.mjs`, etc.) — this confirms the admin
system compiles into a deployable bundle, though it is not deployed (§2).

**Not run, and not claimed as passing**:
- **Database tests** — no live Postgres connection was available (direct
  connections fail in this environment with an IPv6 routing error; the
  Supabase CLI session available here is authenticated to an unrelated
  project). The last-owner concurrency race and the full
  translation-request → approve → process → review → grant → revoke cycle
  both require a real database with `0001`-`0007` applied, which does not
  exist anywhere reachable from this session.
- **Browser tests** — no interactive browser session was used for this
  report. Earlier live REST testing (`docs/security-verification-2026-09.md`)
  used raw HTTPS calls, not a browser.
- **Live deployment checks** — limited to the read-only HTTP probes in §2
  (route existence, status codes). No authenticated admin session was
  exercised against the live deployment (the admin routes don't exist
  there yet, per §2).
- **Any Gemini API call** — none made, in this report or the session it
  draws on. `isGeminiConfigured()`/`processTranslationJobBatch` were only
  unit-tested for branching logic.

---

## 7. Remaining work

### Confirmed launch blockers

1. **Authors can self-publish directly in production today**, bypassing
   all review — live-confirmed (§3, §4, §5).
   **Fix status: WRITTEN, REVISED after external review, NOT VERIFIED.**
   `supabase/migrations/0000_hotfix_current_books_rls.sql` was corrected
   after a review found its dynamic policy cleanup missed `cmd = 'ALL'`
   policies and never touched `books` INSERT at all — both fixed, but
   **not yet run against any database** (no local/staging environment was
   available — see `supabase/tests/rls_hotfix_tests.sql`, prepared and
   marked NOT RUN). Do not treat "a corrected file exists" as "the fix is
   verified." **Next action**: back up production (§8.1), run the test
   suite against a local/staging database, THEN apply `0000` as a
   standalone change (see `docs/admin-operator-guide.md` §8 for the full,
   corrected procedure).
2. **An anonymous client can read any book's full manuscript text
   regardless of publish status**, live-confirmed (§3, §4). Same fix and
   same "written, not verified" status as item 1 — `0000`, superseded by
   `0007` (also revised for the same class of gap, plus a previously
   unnoticed one: its row-level UPDATE policy did not, by itself, protect
   `rights_status`/`edition_review_status` from being set by an author in
   the same statement as a legitimate field edit — fixed with column-level
   grants, also not yet tested against a database).
3. **The entire admin/roles/review/translation-access/support system is
   uncommitted and undeployed** — zero enforcement exists in production
   today beyond what `0000` fixes. **Next action**: commit this work
   deliberately (not part of this inspection), then follow
   `docs/admin-operator-guide.md` §8 in full (staging validation before
   production).
4. **Two disposable test accounts remain live in production's
   `auth.users`** (`zzzsectestqx1*`/`zzzsectestqx2*@mailinator.com`,
   created during the live verification testing). These are **not
   harmless** just because their passwords were discarded: Mailinator
   inboxes are public, so anyone who knows or guesses the inbox name could
   read a future password-reset email and complete a real sign-in as one
   of these accounts. **Next action**: an authorized operator with
   dashboard access deletes both from Authentication → Users. This has
   not been done — it is an open item, not something already handled by
   this inspection.

### Important fixes (present in the uncommitted code, verify before/at deploy)

5. Publish-gate logic previously required a reviewed English **and** Urdu
   edition before an approved original could publish — inverted from the
   product rule. Fixed (`computePublishGate`,
   `check_book_publish_gate` trigger) — unit-tested only, not yet live.
6. `translation_requests` insert policy allowed a self-grant with a
   fabricated reviewer/job. Fixed in `0006` — never shipped live (table
   doesn't exist in production).
7. Support-report honeypot rejected bots with a visible error instead of
   silently accepting them (`z.string().max(0)` vs `z.string()`). Fixed —
   low severity, not security-critical.
8. Last-owner revoke race (two concurrent revokes could zero out all
   owners). Fixed with an advisory lock in the trigger — **not verified
   against a real concurrent race** (§6); recommend an explicit staging
   test before relying on it.
9. Duplicate "The Lantern in the Rain" catalog row, already identified and
   documented (`supabase/remediation/2026-09-12_duplicate_lantern_in_the_rain.sql`),
   proposed fix not yet applied, needs a human decision (unpublish vs
   confirm with the real author).
10. `books`/`book_chunks` INSERT and column-level grants were left
    completely unexamined in the first version of this report and the
    first version of the hotfix — an author could have inserted a new
    book already `status='published'`, or (once 0005 exists) with
    `rights_status`/`edition_review_status` pre-approved, and could have
    added chunks directly to their own already-published book with no
    review. All fixed in the revised `0000`/`0007` — same "written, not
    verified" caveat as items 1-2.

### Next product priorities (after access protection — do not start before items 1-4 above are resolved)

11. **An authorized, rendered manuscript preview for editorial review** —
    admin/editor reviewers currently approve edition quality without
    reading the actual manuscript text (only CSV dry-run validation exists
    today, `src/routes/admin/books/new.tsx`). Needs a read-only,
    capability-gated preview path (`catalog.read_unpublished`), not a
    generic content endpoint.
12. **Proper CSV parsing with quoted commas, quotes, and multiline
    fields** — `parseCsvManifest` (`src/lib/admin/catalog.server.ts`) is a
    plain comma-split; any field containing a comma, an embedded quote, or
    a newline is silently mis-parsed rather than rejected or handled
    correctly. Documented as a known limitation; still a real gap for any
    real-world CSV export.
13. **True reading-location bookmarks, separate from saving a book to a
    shelf** — there is currently no "save my exact position for later
    return within a book" feature distinct from `reading_progress`
    (auto-saved current position) or the "Saved" `book_shelves` entry
    (add the whole book to a list). "Bookmark" in the UI
    (`src/routes/library.tsx`, `src/routes/profile.tsx`) is only the icon
    label for the "Saved" shelf kind — confirmed by code review, not a
    naming choice that already covers this. A reader cannot mark multiple
    specific locations within one book and return to any of them.

### Later, lower-priority improvements

14. Reading streak (`currentStreak`/`recordReadingDay`) is device-only even
    for signed-in accounts — doesn't sync across devices.
15. No mobile push notifications for "translation ready"/"ticket answered"
    (`docs/mobile-api-contract.md` §5) — data exists to poll, nothing wired
    up.
16. `roadmap.md`'s "Wire real Stripe checkout" item remains unstarted by
    design (free launch).

This security correction pass intentionally did not start work on items
11-16 — recorded here as the next priorities, not expanded into during
this pass, per the scope given for it.

### Unknowns requiring evidence (need SQL/dashboard access this session did not have)

17. **Whether the live `books`/`book_chunks` policy is actually `FOR ALL`
    or something else** — never determined either way, in this or the
    prior session. The corrected `0000`/`0007` no longer need this answer
    to work correctly (they drop every policy regardless of shape), but
    it remains genuinely unknown, not assumed safe. Script ready:
    `supabase/inspect_current_access.sql` (query 1's note now calls out
    exactly what a `cmd = 'ALL'` row would mean).
18. Whether `0002`/`0003` (highlight notes, Gemini usage columns) are
    already applied — not independently re-checked this session (lower
    risk, but unconfirmed either way).
19. The exact deployed commit/build behind `pic-perfect-clone-44.lovable.app`
    — no build-info endpoint or CI linkage was found; only inferable from
    behavior (§2).
20. Whether `0002`/`0003`'s status is consistent across any other
    environment (staging, preview branches) — none were found or accessible.
21. Live behavior of the Hindi/Arabic grant/revoke cycle, the full Gemini
    processing pipeline, and every scenario in
    `supabase/tests/rls_hotfix_tests.sql` against a real database — all
    blocked entirely on a local or staging database being available, which
    this session did not have (no Docker, no local Postgres, no reachable
    staging project — see §6 and the test file's own header).

---

## Final summary (A-E)

### A. Confirmed defects and changes made

- **Confirmed defects** (live-verified against production, previously
  recorded — see `docs/security-verification-2026-09.md`): an anonymous
  REST client could read a draft book's full manuscript text; an
  authenticated author could `PATCH` their own draft directly to
  `status='published'`, bypassing all review.
- **Further defects found by re-review this pass, not live-tested**
  (production mutation was disallowed for this task): the original
  `0000`/`0007` hotfix's dynamic policy cleanup matched `cmd = 'SELECT'`/
  `'UPDATE'` literally and would have silently missed a `FOR ALL` policy;
  `books` INSERT was left completely unguarded in both files (an author
  could insert a new row already `published`, or, post-0005, with
  `rights_status`/`edition_review_status` pre-approved); `0007`'s
  row-level UPDATE policy did not independently protect the
  rights/editorial-review columns from being set alongside a legitimate
  field edit; `book_chunks` INSERT let the owning author add/replace
  chunks on their own already-published book.
- **Changes made** (all uncommitted, all in the working tree):
  `supabase/migrations/0000_hotfix_current_books_rls.sql` and
  `supabase/migrations/0007_finalize_access_policies.sql` rewritten —
  comprehensive (cmd-agnostic) policy drop, explicit
  `begin;`/precondition/postcondition/`commit;` wrapping, new INSERT
  policies for `books` and `book_chunks`, column-level `REVOKE`/`GRANT`
  protecting ownership (`author_id`) and (in `0007`) every rights/review
  column. New file `supabase/tests/rls_hotfix_tests.sql` (prepared, marked
  NOT RUN). `docs/security-verification-2026-09.md`,
  `docs/admin-operator-guide.md`, `docs/mobile-api-contract.md`, and this
  file corrected for the language/ordering/evidence issues listed in
  part E below.

### B. Tests passed, failed, and not run

- **Passed** (this session, local, against the working tree): `npx vitest
  run` (65/65), `npx tsc --noEmit` (clean).
- **Failed** (real status, corrected in this pass — see §6): `npx eslint .`
  exits 1; almost entirely pre-existing Windows CRLF/formatting noise
  (12,589 + 1,120 of 13,720 problems), with 12 pre-existing substantive
  warnings/errors unrelated to this work.
- **Not run** (no database environment available; production mutation
  disallowed for this task): every scenario in
  `supabase/tests/rls_hotfix_tests.sql` (all 10+ groups: anonymous/
  unrelated-user reads, published-original reads, author self-edit,
  insert-as-published, update/upsert-to-published, ownership change,
  chunk injection into a published book, the deliberate `FOR ALL` policy
  scenario, legitimate submission/unpublish, atomic-rollback-on-failure);
  the full `0001`-`0007` staging checklist in
  `docs/admin-operator-guide.md` §8.3 (translation grant/revoke, protected
  approval fields, editor preview access, MFA enforcement, last-owner
  concurrency); any live Gemini API call.

### C. Remaining access or deployment blockers

1. `0000`/`0007` are written and revised, **not verified against any
   database** — this is the single largest remaining gap before either
   can be trusted in production.
2. The entire admin/roles/review/support/translation-access system remains
   uncommitted and undeployed.
3. Two disposable test accounts remain live in production's `auth.users`
   and have not been deleted.
4. No local Postgres, Docker, or reachable staging Supabase project exists
   for this work to be validated against — this blocks essentially all of
   part B's "not run" list, not just one item.
5. The exact shape of the current live `books`/`book_chunks` policy (in
   particular, whether it is `FOR ALL`) remains unknown.

### D. Corrected hotfix and migration 0007 paths

- `supabase/migrations/0000_hotfix_current_books_rls.sql`
- `supabase/migrations/0007_finalize_access_policies.sql`
- Supporting: `supabase/tests/rls_hotfix_tests.sql` (new),
  `supabase/inspect_current_access.sql` (updated)

### E. Deployment recommendation

**Do not apply `0000` or `0007` yet.** Both are corrected but unverified.
The evidence-based recommendation is: (1) take a production backup now
(§8.1) — this does not depend on anything else and has no reason to wait;
(2) obtain or provision a real local/staging database; (3) run
`supabase/tests/rls_hotfix_tests.sql` against it, both before and after
applying `0000`/`0007`, and fix anything that fails; (4) only then apply
`0000` to production as a standalone change, followed by the full
`0001`-`0007` sequence and the rest of `docs/admin-operator-guide.md` §8.
Applying either file to production before that testing exists would be
acting on a written-but-unverified fix for a confirmed, currently-live
exposure — an improvement in design over the previous draft, but not yet
evidence that it works.

---

**Report location**: `docs/seeparah-current-state-handoff.md` (this file).
Left uncommitted, as requested.
