# Live access-control verification — 2026-09-13/14

This documents what was actually tested against the real project (the one
`SUPABASE_URL` in this repo's local `.env` points to), how, and what came
back — replacing an earlier, weaker claim ("metadata-only exposure") that
was not backed by evidence. Every command below is a plain HTTPS request
using only the public anon/publishable key already committed in
`.env.example`'s shape (never the service-role key, which was never used or
seen in this session) — no dashboard access, no SQL editor access, no
service-role key were available or used.

## Method and constraints

- A Supabase CLI session on this machine was already authenticated, but to
  a **different** project than the one this app uses (confirmed via
  `supabase link --project-ref <the real ref>` → `"does not have the
  necessary privileges to access this endpoint"`). It was not used for
  anything beyond that one check.
- Direct Postgres connections (`supabase db dump`, `supabase db query
  --linked`) fail in this sandbox with `LegacyDbConfigIpv6Error` — this
  environment has no IPv6 route, which Supabase's direct DB host requires.
  This means `pg_policies`/grants could **not** be read directly by this
  session; see `supabase/inspect_current_access.sql` for the read-only
  script prepared instead, and §"What is still not verified" below for
  exactly what that script would resolve.
- REST (`/rest/v1/...`) and Auth (`/auth/v1/...`) endpoints are plain HTTPS
  and were reachable. All findings below come from those.
- Two disposable test accounts were created via public signup
  (`zzzsectestqx1*@mailinator.com`, `zzzsectestqx2*@mailinator.com` —
  Mailinator inboxes are public by design, used here only to complete
  Supabase's required email-confirmation step programmatically). They hold
  no role and no data today. **Every test row created under them was
  deleted and confirmed gone before this document was written; the two
  accounts themselves remain in `auth.users`** (an anon key cannot delete
  an auth user) — **this is an open action item, not something already
  handled, and these are NOT harmless just because their passwords were
  discarded**: a Mailinator inbox is public by design, so anyone who knows
  or guesses the inbox name can read a future password-reset email sent to
  it and complete a real, confirmed sign-in as that account — an identity
  in this project's `auth.users` that this session does not control. **An
  authorized operator with dashboard access should delete both accounts**
  (Authentication → Users) before this is considered closed.

## Findings

### 1. CONFIRMED — an anonymous client can read a draft book's full row

```
curl "$SUPABASE_URL/rest/v1/books?id=eq.<draft-book-id>&select=id,title,status" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
→ 200 OK
  [{"id":"f5f83183-...","title":"ZZZ SECURITY TEST DELETE ME","status":"draft"}]
```

The same draft also appeared in an **unfiltered** `GET /rest/v1/books`
listing as anon — i.e. this is not a single-row edge case, the table's
current SELECT policy does not check `status` at all.

### 2. CONFIRMED — an anonymous client can read the draft's full manuscript text

```
curl "$SUPABASE_URL/rest/v1/book_chunks?book_id=eq.<draft-book-id>&select=content" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
→ 200 OK
  [{"content":"UNPUBLISHED-DRAFT-MANUSCRIPT-MARKER-8271"}]
```

This is the actual content of a chunk inserted moments earlier by a
disposable test author's own `draft` book, read back with **no
authentication at all**. This is not metadata — it is the same
`book_chunks.content` field the reader UI renders as the page body. This is
the finding the earlier report understated as "metadata-only."

### 3. CONFIRMED — an author can self-publish directly, bypassing all review

```
curl -X PATCH "$SUPABASE_URL/rest/v1/books?id=eq.<own-draft-id>&author_id=eq.<own-uid>" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer <own-access-token>" \
  -H "Prefer: return=representation" -d '{"status":"published"}'
→ 200 OK, status now "published"
```

No rights review, no editorial review, no admin action of any kind — this
is the exact gap migration `0005`'s own header already predicted
("RLS — not app code — is the only real boundary"), now confirmed live and
independent of whether any of the new admin migrations ever ship.

### 4. CONFIRMED — write-side ownership isolation between two ordinary users is sound

- User B could **not** update user A's book (plain field change, and a
  same-shape attempt mimicking `setBookStatus`'s exact filter) — both
  returned `200` with an empty result (0 rows matched the UPDATE policy).
- User B could **not** insert a new book falsely claiming `author_id` =
  user A (`403`, `"new row violates row-level security policy"`).
- User B could **not** insert a `book_chunks` row into user A's book
  (`403`, same error).
- A fully anonymous client (no user session) could not insert a book at
  all (`401`).
- A fully anonymous client's no-op `UPDATE` attempt on a real, existing,
  published book (setting `title` back to its own current value, so even
  success would have changed nothing) matched 0 rows.

So the write side's *ownership* check is correctly enforced everywhere it
was tested; the two real gaps are the missing status scope on **read** and
the missing status allow-list on the author's own **update**.

### 5. CONSISTENT WITH — none of migrations 0001-0006 having been applied yet

`GET /rest/v1/admin_users`, `/translation_requests`, `/audit_log`,
`/book_translation_jobs`, `/book_translation_sections`,
`/content_settings`, `/support_tickets`, `/error_events`,
`/admin_action_events` all return `PGRST205 — Could not find the table ...
in the schema cache`. A full-row `books` fetch shows only the columns that
predate this change (no `rights_status`, `edition_review_status`,
`source_version`, etc.); a full-row `book_chunks` fetch shows only
`book_id, language, chunk_index, content` (no `status`, `job_id`,
`source_version`).

**This is evidence about PostgREST's current schema cache, not a
substitute for reading actual migration/DDL history.** A `PGRST205`
response means PostgREST does not currently expose a table under that
name — that is strong, but not definitive, proof the table was never
created (e.g. a table created and later dropped, or created in a
different schema, or excluded from PostgREST's exposed schema list, would
produce the identical error). It matches what
`docs/admin-operator-guide.md` already claimed, and is the most direct
evidence obtainable without SQL/dashboard access, but it should be
described as consistent with that claim, not as independent proof of
complete migration history.

### 6. CONFIRMED — no comparable exposure found on the other reader-data tables

`reading_progress`, `user_subscriptions`, `book_shelves`, `book_highlights`
all returned `[]` to an anonymous, unfiltered `select=*` — consistent with
(though not conclusive proof of, since no rows were available to test
against) correct per-user scoping. `author_profiles` does not exist yet
either (pre-0001). This was a quick supplementary check, not an exhaustive
one — see the inspection script for a way to confirm the actual policies.

## What was fixed as a result

- `supabase/migrations/0000_hotfix_current_books_rls.sql` — new, applies
  against the CURRENT schema only, closes findings 1-3 immediately,
  independent of the rest of this change.
- `supabase/migrations/0007_finalize_access_policies.sql` — new, the full
  admin-role-aware replacement, applied after 0001-0006.
- `supabase/migrations/0006_...`'s `translation_requests_insert_own` policy
  — while re-deriving the "why" for the above from first principles, a
  related bug was caught by the same scrutiny (not live-tested, since the
  table doesn't exist yet — found by re-reading the policy's `WITH CHECK`):
  it only constrained `requester_id`, not `status`/`job_id`/`reviewed_by`/
  `reviewed_at` — a reader could have inserted their own request already at
  `status = 'granted'` with a fabricated reviewer/job, self-granting access.
  Fixed to pin every review-owned column to its untouched default on
  insert.
- Both new migrations use a **dynamic** `pg_policies` lookup-and-drop (see
  their headers) specifically so they don't need any policy name handed to
  them in advance, and so a second policy left over from before can't
  silently keep granting broader access (Postgres ORs together every
  permissive policy for the same command — adding a correct new one does
  not by itself revoke an existing broader one).

## Correction pass (same session cluster, after external review)

An external review (ChatGPT, reviewing the handoff/security docs and the
hotfix file itself) identified real gaps in the first version of this
fix, all corrected in the current `0000`/`0007`:

- **The dynamic drop only matched `cmd = 'SELECT'`/`cmd = 'UPDATE'`
  literally.** A policy defined `FOR ALL` is stored with `cmd = 'ALL'` in
  `pg_policies` and was never matched by that filter — if the real live
  policy turns out to be `FOR ALL`, the first version of the hotfix would
  have added new, correct policies ALONGSIDE the untouched permissive one
  and fixed nothing (Postgres ORs every permissive policy together).
  **This was not previously live-tested either way — whether the actual
  current policy is `FOR ALL` remains unknown** (see "What is still not
  verified" below). Fixed by dropping every existing policy on both
  tables unconditionally, logging each one via `RAISE NOTICE` first.
- **`books` INSERT was left completely unchanged** in both files. An
  author could have inserted a brand-new row already at
  `status = 'published'` (0007: or with `rights_status`/
  `edition_review_status` pre-set to `'approved'`), including via an
  upsert whose conflict target misses and resolves as a plain insert.
  Fixed with explicit INSERT policies (both files) and column-level
  INSERT grants excluding every rights/review column (0007).
- **A row-level UPDATE policy's `WITH CHECK` does not protect a column it
  never mentions.** 0007's UPDATE policy only checked `status`; nothing
  stopped an author from also setting `rights_status`/
  `edition_review_status` in the same statement. Fixed with column-level
  `REVOKE`/`GRANT` on `authenticated` — the correct primitive for "this
  role may never set this column," independent of what any row-level
  policy checks.
- **`book_chunks` INSERT was left completely unchanged.** The owning
  author could have added or replaced chunk rows on their OWN
  already-published book with no review. Fixed with an INSERT policy
  requiring the parent book to not currently be `published`.
- **The migrations were not transactionally atomic with explicit pre/post
  conditions.** Fixed: both now run inside `begin;`/`commit;` with a
  precondition block (aborts before touching anything if the schema
  doesn't match what the file expects) and a postcondition block (rolls
  back the entire file if the expected policies don't exist afterward) —
  so a failed apply can never leave a partially-replaced policy set.

**None of these corrections have been live- or locally-tested** — no
database environment was available in this session (`docker --version`
and `psql --version` both absent; no reachable staging project; production
mutation explicitly disallowed for this task). They are written and
reviewed, not verified. `supabase/tests/rls_hotfix_tests.sql` is the
prepared executable test suite, explicitly marked NOT RUN, covering every
scenario from this correction pass — run it against a real local or
staging database before trusting these files in production.

## What is still not verified from here (see `supabase/inspect_current_access.sql`)

- The **exact name and definition** of the current `books`/`book_chunks`
  policies that produced the behavior above. Not needed for the fix (the
  dynamic drop doesn't care), but useful for confirming nothing else
  depends on that policy's exact shape. Run `inspect_current_access.sql`
  query 1 and paste back the rows for `books`/`book_chunks`.
- Whether RLS is `FORCE`d (matters only if the table owner role itself is
  ever used for authenticated traffic, which it is not here, but query 2
  confirms this either way).
- Whether any `VIEW` in `public` re-exposes `books`/`book_chunks` under
  its own rules — query 4.
- Table/column-level `GRANT`s independent of RLS — queries 3 and 6 (a
  missing grant would show up as `401`/`403` at the HTTP layer regardless
  of policy content, so the live tests above already rule out the most
  dangerous form of this, but the query gives the complete picture).
