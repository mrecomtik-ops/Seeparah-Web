# Setting up the new, owned Supabase project — exact sequence

Prepared 2026-09-19, superseding every earlier "wait for Lovable access"
recommendation in this repo's docs (`docs/seeparah-backend-recovery-plan.md`,
`docs/seeparah-lovable-independence-plan.md`) per the owner's final
decision: **new Supabase project, fresh accounts, empty catalogue — no
data migration from either old project.**

Nothing in this document has been applied anywhere. It supersedes the
"apply 0000 standalone to the old project" recommendation in the earlier
backend-recovery plan — that plan targeted `unxbomcifoqfqqwpifbe` and is
no longer the intended path.

---

## 0. What this session cannot do, stated once

This session has no reference to, and no credentials for, the new
Supabase project — the owner has not yet identified/created it. Every
step below is written to be run by whoever has that project's SQL
editor or a linked `supabase` CLI session — not executed here. See
§4 for the exact, minimal thing the owner needs to do to unblock the
next session.

---

## 1. Exact migration order (new — do not skip step 1)

```
1. supabase/migrations/baseline_pre_0000_schema.sql   (NEW this pass — see below)
2. supabase/migrations/0000_hotfix_current_books_rls.sql
3. supabase/migrations/0001_translation_pipeline_and_hardening.sql
4. supabase/migrations/0002_highlight_notes.sql
5. supabase/migrations/0003_gemini_provider_and_usage.sql
6. supabase/migrations/0004_admin_roles_and_audit.sql
7. supabase/migrations/0005_catalog_rights_and_review_workflow.sql
8. supabase/migrations/0006_support_translations_settings.sql
9. supabase/migrations/0007_finalize_access_policies.sql
```

**Why step 1 is new and required**: every migration from `0000` onward
was written against Seeparah's *original* database, where `books`,
`book_chunks`, `book_shelves`, `reading_progress`, `book_highlights`, and
`user_subscriptions` already existed — created directly by Lovable's
initial scaffolding, never captured as a migration in this repo. Applying
`0000` to a genuinely empty project fails immediately and correctly (its
own precondition block checks for `public.books`/`public.books.status`/
etc. and aborts if they're missing) — this is `0000` refusing to guess at
a schema it can't see, not a bug. `baseline_pre_0000_schema.sql` (new
this pass, in `supabase/migrations/`) supplies exactly those six tables,
reconstructed from the application's own TypeScript types and exact
query/upsert patterns (see that file's own header for the full
reasoning and the source for every column). It deliberately does **not**
add RLS to `books`/`book_chunks` (that's `0000`'s job, immediately next)
but **does** add real, minimal, owner-only RLS to the other four tables,
since no migration from `0000` onward ever touches their policies.

**Not renumbered as `0000`/shifted the existing sequence up**: confirmed
this session that this project's tooling (`supabase migration new`) only
recognizes a purely numeric, typically 14-digit timestamp prefix as a
migration version — a leading-zero name that sorts before "0000" isn't
reliably parseable by it either. Every migration in this project has
always been applied manually, one file at a time (no session working on
this repo has ever had a working automated-sequential-apply path) — so
this file is named descriptively and applied by explicit instruction
(this document), not by lexical sort order. Renaming the already-
reviewed `0000`-`0007` files to make room was considered and rejected:
it would invalidate every cross-reference in their own headers and in
the docs that already cite them by exact name.

**Apply each file individually**, reading its own header first (several —
`0000`, `0005`, `0007` — have real preconditions and behavioral notes).
Run the VERIFY block at the end of `baseline_pre_0000_schema.sql` and
`supabase/inspect_current_access.sql` after the whole sequence, before
trusting it.

---

## 2. Owner bootstrap (after the migration sequence)

```
export SUPABASE_URL=<new project's URL>
export SUPABASE_SERVICE_ROLE_KEY=<new project's service-role key>
npx tsx scripts/seed-owner.ts <your-email-or-user-id> --confirm
```
Requires the account to have signed in at least once already (so its
`auth.users` row exists). Then sign in, open `/admin`, and enroll MFA
immediately — every admin server function refuses with `mfa_required`
until that's done (`src/lib/admin/require-admin.server.ts`).

---

## 3. Everything else needed (names only, no values here)

| What | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Local `.env`/`.env.local`, and Netlify build-time env | Browser-baked; new project's values |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Netlify server-side env (never committed) | New project's values; server functions and all admin/reader privileged paths need this |
| `GEMINI_API_KEY` | Netlify server-side env | Unchanged provider — same key can carry over if already owned, or a fresh one |
| `GEMINI_TRANSLATION_MODEL`, `TRANSLATION_BATCH_SIZE`, `SUPPORT_RATE_LIMIT_PEPPER` | Netlify server-side env | All optional, all have safe defaults |
| Google OAuth client | Google Cloud Console + new project's Supabase Auth settings | New project = new callback URL (`https://<new-ref>.supabase.co/auth/v1/callback`) — must be added to the OAuth client's authorized redirect URIs, and to Supabase's own provider config. Cannot be done from this session |
| `src/integrations/supabase/types.ts` | Regenerate from the new project | See §5 below — do this AFTER the migration sequence, against the real new schema, not reused from the old project without re-verifying |

---

## 4. Exact owner action needed right now

**Not** "grant Lovable database access" — that request is retired per
the owner's decision. What's actually needed to unblock the next session:

1. Create (or identify, if already created) the new Supabase project.
2. Run §1's migration sequence against it (via its own SQL editor, or a
   `supabase` CLI session genuinely linked to it — this session's own CLI
   login cannot reach any project it doesn't own; the owner's own login,
   used directly, is the reliable path).
3. Regenerate `types.ts` from it (§5).
4. Share the **project reference** (`https://<ref>.supabase.co`) — not a
   key, not a password — so this work can be verified against it and a
   Netlify preview can be configured (§9 of the parent instruction; not
   done this pass, no reference to configure yet).
5. Set up Netlify environment variables for a **preview/branch deploy
   context only** (§3 above) — production's env vars are explicitly not
   touched until the owner approves the switch.

---

## 5. Regenerating `types.ts` — why the current one isn't the final answer

`src/integrations/supabase/types.ts`, as committed right now, was
regenerated by Lovable against the **old** project
(`unxbomcifoqfqqwpifbe`) after applying the full migration set there —
confirmed independently this session (a live, read-only check against
that project shows `admin_users` now exists, matching the claim). It
currently makes `npx tsc --noEmit` pass with **zero errors** against this
branch's code.

That is a reasonable, evidence-based *starting point* — it is not
fabricated, it reflects a real schema that really had this same migration
SQL applied to it — but it is **not** the authoritative answer for the
new project, and should not be treated as final:

- It was generated from the old project's actual live schema, not the
  new one.
- Column types, nullability, or a constraint name could differ in
  practice even from identical-looking SQL, depending on exact apply
  order or any manual reconciliation the old project needed.

**Once the new project has the full migration sequence applied**,
regenerate for real:
```
supabase gen types typescript --project-id <new-project-ref> > src/integrations/supabase/types.ts
```
(or the dashboard's own "Generate types" action). Re-run
`npx tsc --noEmit` immediately after — if it's still clean, the schema
and the checked-in types genuinely agree; if not, that's real drift to
fix before relying on either.

---

## 6. Netlify preview — browser and server both pointing at the new project, production untouched

This has to be done in the Netlify dashboard; nothing in this repo can do
it (no Netlify CLI/API access exists in this session, confirmed
repeatedly across this engagement). The exact action:

1. Netlify dashboard → this site → **Site configuration → Environment
   variables**.
2. For each of `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` (and `GEMINI_API_KEY` if not already
   shared): add a value **scoped to "Deploy previews" and/or a specific
   branch context** (Netlify supports per-context overrides on the same
   variable name — a scoped value on a branch/preview context does not
   touch what "Production" resolves to). **Do not edit the "Production"
   scope of any existing variable.**
3. Push/open a PR for the release branch (`worktree-new-backend-setup` at
   the commit reported at the end of this pass) — Netlify will build a
   deploy-preview URL automatically from that branch, using the
   preview-scoped env vars, while `seeparah.com` itself keeps building
   from `main` with its existing production env vars untouched.
4. Share the resulting preview URL back for verification (§10 of the
   parent instruction — real database/browser checks against the new
   project, not done this pass since the project doesn't exist yet from
   this session's side).

No DNS change, no production env var change, no change to what
`seeparah.com` serves — confirmed by design, not by assumption: Netlify's
own per-context variable scoping is exactly the mechanism for this, and
`netlify.toml`'s build command is unchanged (`npm run build`), so a
preview deploy runs the identical build the current production site
runs, just against different environment values.
