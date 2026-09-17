# Seeparah — final Lovable handoff

Prepared 2026-09-17 (UTC). This is the closing handoff for moving
development of the **existing** Seeparah web application out of Lovable and
into Claude Code, against the existing GitHub repository
`mrecomtik-ops/Seeparah-Web`, the existing Netlify site / `seeparah.com`
domain, and a **new, independently owned Supabase project**.

Scope note: nothing in this document changes the application or any
database. No data was exported, no account migration was attempted, and the
current Lovable Cloud backend was left untouched. No credentials, keys,
tokens or database passwords appear anywhere below.

The new backend is a **fresh start**: create an empty Supabase project and
build it up from `supabase/migrations/` in this repo. Do not try to copy the
old one.

---

## 1. Framework and build configuration

| Item | Value |
| --- | --- |
| Framework | TanStack Start v1 (`@tanstack/react-start` 1.168.32, `@tanstack/react-router` 1.170.18), React 19, SSR |
| Build tool | Vite 8 via `@lovable.dev/vite-tanstack-config` (see §5) |
| Server bundle | Nitro 3 beta; Netlify preset |
| Styling | Tailwind CSS v4 (`src/styles.css`, `@tailwindcss/vite`), shadcn/ui + Radix, `lucide-react` |
| Data layer | `@supabase/supabase-js` v2, TanStack Query v5 |
| AI | `@google/genai` (Gemini) — direct SDK, not a proxy |
| Tests | Vitest (`bun run test` / `npx vitest run`) |
| Lint/format | ESLint 9 flat config + Prettier |
| Typecheck | `npx tsgo --noEmit -p tsconfig.json` (or `tsc --noEmit`) |
| Package manager | Bun (`bun.lock` is authoritative; a stale `package-lock.json` is also present) |
| Node | 22 (pinned in `netlify.toml`) |

Scripts: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`, `test`.

`netlify.toml` sets `command = "npm run build"`, `publish = "dist"`,
`NODE_VERSION = 22`, and deliberately contains **no** SPA catch-all redirect
and **no** `[functions]` block — Nitro emits the SSR function to
`.netlify/functions-internal/` and Netlify auto-wires it. See
`docs/netlify-deployment.md`. Do not add a `/* -> /index.html` rewrite; it
breaks SSR, server functions and every access-gated route.

`src/server.ts` is a custom SSR entry wrapping the TanStack server entry with
error capture and a friendly error page; `vite.config.ts` points
`tanstackStart.server.entry` at it.

---

## 2. Routes and implemented features

Route files live in `src/routes/`; `src/routeTree.gen.ts` is generated — never
hand-edit it.

**Public / reader**
- `/` (`index.tsx`) — landing page, CTAs (Continue as Reader / Author, demo).
- `/auth`, `/auth/reset-password` — email + Google sign-in, password reset.
- `/library` — shelves (all / continue / saved / favorites / want-to-read /
  history), search, language / author / topic filters.
- `/dashboard` — continue reading, weekly goal, streak, "For you",
  recommended, trending.
- `/book/$bookId` — book detail.
- `/read/$bookId` — reader: chunk paging, language switching, highlights &
  bookmarks with notes, auto-saved progress, reading-day/streak recording.
- `/profile` — account, saved titles, language preference, weekly goal.
- `/subscribe` — reader + author plans, 70/30 revenue-split explanation.
- `/legal` — legal text.

**Author studio** (`/author`, layout in `author/route.tsx`)
- `/author` — dashboard: published books, translations in progress, monthly
  readers, earnings summary, author profile card.
- `/author/publish` — manuscript upload / publish flow.
- `/author/analytics`, `/author/book/$bookId`, `/author/$authorId`.

**Admin** (`/admin`, MFA-gated in `admin/route.tsx`)
- `index`, `books` (`index`, `new`, `$bookId`), `support` (`index`,
  `$ticketId`), `translation-requests`, `roles`, `users`, `audit`,
  `settings`, `health`.

**Server logic** — TanStack server functions only (`src/lib/*.functions.ts`
calling `*.server.ts`). There are **no** `src/routes/api/*` HTTP routes, no
Supabase Edge Functions, and no Deno code. Key server modules:
`reader.server.ts`, `translation.server.ts`, `gemini.server.ts`,
`manuscript.ts`, `error-log.server.ts`, and `src/lib/admin/*.server.ts`
(catalog, epub, roles, users, audit, support, settings, health, rate-limit,
require-admin).

---

## 3. Demo, incomplete and broken functionality

- **Demo/localStorage fallback** — `src/lib/data.ts` (`demoStore`, demo
  catalog and chunks) plus `src/lib/shelves.ts` and `src/lib/prefs.ts` fall
  back to `localStorage` when signed out or when the backend returns nothing.
  `listBooks()` merges in demo books when the DB returns zero rows. Keep or
  remove deliberately — against an empty new backend the app will show demo
  content rather than an empty state.
- **Demo content in the catalog** — `"The Lantern in the Rain"`
  (`2222...2222`) is a publishing-flow demo title, not a real work; other
  seeded titles are excerpts. See the excerpt list in `data.ts`.
- **Stripe checkout — not built.** `/subscribe` is presentational.
  `monetization_enabled` (content settings) is off; the reader deliberately
  paywalls nothing while it is off. Payout maths (`AUTHOR_PAYOUT` 0.7 /
  `PLATFORM_COMMISSION` 0.3) is real, but earnings/monthly-reader figures on
  the author dashboard are **synthetic placeholders** (e.g. 42 readers per
  paid book), not measured analytics.
- **Translation worker has no scheduler.** The batch worker in
  `translation.server.ts` is written to be called repeatedly by a cron
  trigger; no cron job exists in this repo or in the old backend. Today it
  only advances when invoked from the app/admin health page.
- **PDF ingestion — not built** (EPUB/CSV/batch import is built).
- **Push notifications — not built.**
- **`ALLOW_TEST_SUBSCRIPTIONS`** (`reader.server.ts`) is a test escape hatch;
  leave unset in production.
- **Publishing is gated** by the `check_book_publish_gate` trigger (migration
  0005): a book can only reach `published` with `rights_status='approved'`
  **and** `edition_review_status='approved'`. Existing author flows must go
  through admin review; this will look like "publish silently fails" if the
  reviewer steps are skipped.
- `roadmap.md` is accurate except that its two "migrations not yet applied"
  items are now stale for the **old** backend (see §7).

---

## 4. Backend project reference

- Old (Lovable Cloud) Supabase project ref: **`unxbomcifoqfqqwpifbe`** — for
  identification only when contacting support. **Leave it untouched.**
- The publishable/anon key and URL for it are in the tracked `.env`. They are
  public-tier values, but rotate/abandon them with the project rather than
  carrying them forward.
- No service-role key or database password is available from Lovable Cloud,
  and none is recorded anywhere in this repo.
- New backend: create a fresh Supabase project you own; nothing from the old
  one needs to be imported.

---

## 5. Lovable-specific dependencies

| Dependency | Purpose | Replace with |
| --- | --- | --- |
| `@lovable.dev/vite-tanstack-config` (devDep, used by `vite.config.ts`) | Bundles TanStack Start + React + Tailwind + tsconfig-paths + Nitro + `VITE_*` env injection + `@` alias + dedupe + error-logging plugins + sandbox port detection | A plain `vite.config.ts` composing `tanstackStart()`, `viteReact()`, `tailwindcss()`, `tsConfigPaths()` and the Nitro Netlify preset. This is the single biggest de-Lovable step. |
| `@lovable.dev/cloud-auth-js` + `src/integrations/lovable/index.ts` | Google OAuth sign-in handoff that sets the Supabase session (`lovable.auth.signInWithOAuth`) | `supabase.auth.signInWithOAuth({ provider: 'google' })` directly, with the Google provider configured in the new Supabase project |
| `src/integrations/supabase/previewAuthStorage.ts` | Lovable preview-iframe auth storage shim | Delete; use default Supabase storage |
| `src/lib/lovable-error-reporting.ts`, plugin-injected error logger, `src/lib/error-capture.ts` | Forwards runtime errors to the Lovable editor | Delete or point at your own error sink |
| `src/integrations/supabase/cron-auth.ts` (`LOVABLE_CRON_SECRET`, `..._PREVIOUS`) | Shared-secret check for a Lovable-triggered cron caller | Your own scheduler + secret, or Supabase `pg_cron` |
| `LOVABLE_API_KEY` | Lovable AI gateway (unused — translation goes direct to Gemini) | Drop |
| Generated, "do not edit" files: `src/integrations/supabase/{client,client.server,auth-middleware,auth-attacher,types}.ts` | Supabase clients, auth middleware, DB types | Once outside Lovable these become ordinary source files you own and may edit; regenerate `types.ts` from the **new** project only |
| `.lovable/`, `AGENTS.md`, `roadmap.md` | Lovable agent metadata / notes | Keep as history or delete |

---

## 6. Environment variables

Public values are in the tracked `.env`; secrets belong in `.env.local`
(gitignored) locally and in Netlify environment variables in production.
`.env.example` documents the secret names.

| Variable | Read in | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/integrations/supabase/client.ts` | Browser-exposed |
| `VITE_SUPABASE_PROJECT_ID` | `.env` only | Informational |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | `client.ts` (SSR fallback), `auth-middleware.ts` | Server side |
| `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts`, reported as present/absent by `admin/settings.server.ts` | Server-only, never expose |
| `GEMINI_API_KEY` | `gemini.server.ts`, health check in `admin/settings.server.ts` | Server-only; no `VITE_` prefix |
| `GEMINI_TRANSLATION_MODEL` | `gemini.server.ts` | Optional, default `gemini-flash-latest` |
| `TRANSLATION_BATCH_SIZE` | `translation.server.ts` | Optional |
| `SUPPORT_RATE_LIMIT_PEPPER` | `admin/support.functions.ts` | Optional; salts hashed IPs for the anonymous support form |
| `ALLOW_TEST_SUBSCRIPTIONS` | `reader.server.ts` | Test only; leave unset |
| `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS` | `integrations/supabase/cron-auth.ts` | Lovable-specific; drop or rename |
| `LOVABLE_API_KEY` | not read by app code | Drop |

All of these must be re-created in Netlify (and locally) against the new
Supabase project. None carry over automatically.

---

## 7. Database baseline and schema differences

`supabase/migrations/` is the intended baseline and should be applied **in
order** to the new project:

| File | Contents |
| --- | --- |
| `0000_hotfix_current_books_rls.sql` | Emergency RLS hotfix for the legacy shape of `books` / `book_chunks` |
| `0001_translation_pipeline_and_hardening.sql` | `book_translation_jobs/sections/guides`, `author_profiles`, `translation_reports`, `translation_requests`, `content_settings(+_history)`, `error_events` |
| `0002_highlight_notes.sql` | `book_highlights.note` |
| `0003_gemini_provider_and_usage.sql` | Provider/model tracking on chunks |
| `0004_admin_roles_and_audit.sql` | `admin_users`, `audit_log`, `admin_action_events`, `current_admin_role()`, `is_admin()`, `prevent_last_owner_removal()` |
| `0005_catalog_rights_and_review_workflow.sql` | Rights/review columns + `check_book_publish_gate` trigger |
| `0006_support_translations_settings.sql` | `support_tickets(+_notes)`, rate-limit table, settings, error events |
| `0007_finalize_access_policies.sql` | Final `books` / `book_chunks` policies and grants |

Important for a **fresh** project: `0000` and parts of `0006` were written as
remediation/idempotent fixes against the old live database. Applying
`0000`–`0007` in order onto an empty project is the intended path, but expect
to have to reconcile a few "already exists / does not exist" edges, and treat
the result as a new baseline (a squashed `0001_baseline.sql` generated from
the applied schema is a reasonable first commit in the new repo line).

**Old live DB vs repo, as of this handoff:** migrations `0000`–`0007` were
all applied to `unxbomcifoqfqqwpifbe`, so the old live schema now matches the
repo's intent. `roadmap.md` still lists them as unapplied — stale. There are
no unapplied migrations left and no known live-only schema drift. Note the
old DB also contains seeded book content (5 published books, ~32 chunks) that
exists **only** as data, not in migrations — the new project starts empty
unless you re-seed. `drizzle/` and `drizzle.config.ts` are present but the
app does not use Drizzle at runtime.

`supabase/inspect_current_access.sql` and `supabase/tests/rls_hotfix_tests.sql`
are useful verification scripts for the new project.

---

## 8. Auth, storage, AI and scheduled jobs

- **Auth** — Supabase Auth: email/password (incl. reset) and Google OAuth.
  Google sign-in currently routes through `@lovable.dev/cloud-auth-js`; in the
  new project you must create your own Google OAuth client and set redirect
  URLs to `https://seeparah.com` (and Netlify deploy previews). Admin access
  is role-based via `admin_users` + `is_admin()`, with an MFA gate on
  `/admin` — the **first owner must be inserted manually**; see
  `docs/admin-operator-guide.md`.
- **Storage** — **no Supabase Storage buckets are used.** Book covers are
  bundled image assets in the repo; manuscripts are parsed in-process
  (JSZip/EPUB) and stored as rows in `book_chunks`. Nothing to migrate.
- **AI** — Google Gemini via `@google/genai`, server-only, one entry point
  (`gemini.server.ts`). Needs your own `GEMINI_API_KEY`. No Lovable AI
  gateway usage in app code.
- **Scheduled jobs** — none exist. The translation batch worker is designed
  for a scheduler you must add (Netlify Scheduled Functions, Supabase
  `pg_cron` + an authenticated endpoint, or an external cron), protected by a
  secret of your own rather than `LOVABLE_CRON_SECRET`.

---

## 9. Things not represented in GitHub

- Seeded book/chunk content in the old database (data, not migrations).
- All secret values: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
  `SUPPORT_RATE_LIMIT_PEPPER`, cron secrets.
- Supabase project configuration: auth providers, email templates, redirect
  URLs, SMTP, rate limits, JWT settings.
- Google Cloud / AI Studio setup: the Gemini API key and the OAuth client,
  consent screen and authorized redirect URIs.
- Netlify site settings: environment variables, domain/DNS for
  `seeparah.com`, deploy contexts (the build command itself **is** in
  `netlify.toml`).
- Any admin user rows (`admin_users`) — recreate the first owner manually.
- `.env.local` (gitignored by design).

---

## 10. Known security issues and real status

1. **`book_chunks` publicly readable paid content** (scanner id
   `book_chunks_public_paid_content`) — **open, intentional.** Seeparah is
   free during launch and `monetization_enabled` is off. Migration `0007`
   tightened the policy so chunk access now requires the book to be
   published and to be free / chunk 0 / owned / actively subscribed, with
   Hindi & Arabic editions further restricted to source-language authors or
   granted `translation_requests`. The finding was deliberately not
   dismissed. Revisit when monetization is turned on.
2. **Anonymous read of unpublished manuscript text** — **fixed and verified**
   by `0000`, superseded by `0007`. Reads now require `status='published'`
   or authorship/admin. Verified live: an unpublished draft returned empty to
   an anonymous request. Evidence: `docs/security-verification-2026-09.md`.
3. **Author self-publish bypass** — **fixed.** `books_author_update` limits
   author-set status to `draft` / `in_review` / `unpublished`; publishing
   additionally passes the `check_book_publish_gate` trigger.
4. **Privileged server paths** — `reader.server.ts`, `translation.server.ts`
   and `src/lib/admin/*.server.ts` use the service-role client and therefore
   **bypass RLS**; they carry their own authorization checks
   (`require-user.server.ts`, `require-admin.server.ts`). Re-audit these
   first when wiring the new backend — RLS alone will not protect them.
5. **Public support form** — unauthenticated; rate-limited by hashed IP. Set
   `SUPPORT_RATE_LIMIT_PEPPER` in production.
6. `.env` is tracked in git and contains the **old** project's public URL and
   publishable key. Not a leak, but clear it out when you cut over.

Related reading: `docs/security-verification-2026-09.md`,
`docs/seeparah-current-state-handoff.md` (the earlier, longer inspection
report), `docs/admin-operator-guide.md`, `docs/netlify-deployment.md`,
`docs/mobile-api-contract.md`.

---

## 11. Sync status

At the time of writing, the working tree was clean apart from this document —
there were **no** unsynced application source changes in Lovable, so nothing
had to be merged or reconciled, and no branch was overwritten or
force-pushed. Only this file was added. Database types were **not**
regenerated and no migrations were applied as part of this handoff.

GitHub sync is not the same as a Netlify deploy: Lovable pushes commits to
`mrecomtik-ops/Seeparah-Web`, and Netlify builds separately from that
repository on its own trigger. A green sync does not mean the live site has
been rebuilt.

---

## 12. First steps for Claude Code

1. Clone `mrecomtik-ops/Seeparah-Web`, `bun install`.
2. Create the new Supabase project; apply `supabase/migrations/0000`–`0007`
   in order; regenerate `src/integrations/supabase/types.ts` from it.
3. Replace `@lovable.dev/vite-tanstack-config` with an explicit Vite config
   (§5), and `@lovable.dev/cloud-auth-js` with direct Supabase OAuth.
4. Set env vars locally and in Netlify (§6); configure Google OAuth redirects.
5. Insert the first `admin_users` owner row; verify `/admin` MFA gate.
6. Decide on the demo-data fallback and re-seed real catalog content.
7. Add a scheduler for the translation worker.
8. Run `npx tsgo --noEmit`, `bun run test`, `bun run lint`, then deploy.
