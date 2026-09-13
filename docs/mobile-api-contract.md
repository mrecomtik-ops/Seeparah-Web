# Mobile API/schema contract (PROPOSED — not implemented or tested against the mobile app)

The Flutter mobile app is a separate repository not available in this
workspace, so nothing there has been changed, and nothing in this document
has been tested against it or against any client consuming it. Everything
below describes the shared Supabase backend's contract as this website
branch's (uncommitted, undeployed — see
`docs/seeparah-current-state-handoff.md`) code defines it — it is a
**proposal for what the mobile app should consume**, not a confirmed,
stable, or currently-live API. Treat every claim below as "this is what
the code intends," not "this is deployed and working." Everything here is
additive to what already existed (books, book_chunks, reading_progress,
book_highlights, book_shelves, user_subscriptions) — no existing table or
column was removed or renamed — but "additive" is a claim about the
schema design, not a guarantee that mobile can adopt it without its own
implementation and testing work.

## 1. Reader access is now gated in three independent ways

A chunk request (however the app currently fetches reader content) must be
prepared for these outcomes, all already returned by the equivalent
website path (`src/lib/reader.server.ts` `getReaderChunk`):

```ts
type ReaderChunkResult = {
  content: string | null;
  locked: boolean;
  reason?: "sign_in_required" | "subscription_required" | "translation_access_required" | "not_available";
};
```

- `translation_access_required` is new: it means the requested language is
  Hindi or Arabic, it's a translated (not original) edition, and this
  reader has not been granted access. The app should offer a "Request this
  translation" action (see §3) instead of the subscription paywall UI.
- `subscription_required` only fires when `monetization_enabled` (§2) is
  true. During launch it defaults to false, so every book is free
  regardless of `access_type`/`subscription_price_usd` — those columns
  still exist and still hold real values, they're just not enforced yet.
- `not_available` now carries meaning in `locked`, which the website's own
  fallback logic depends on and any client replicating this contract must
  too: `locked: false` + `not_available` means the backend has no record of
  this book id at all (e.g. a purely local/demo entry); `locked: true` +
  `not_available` means the backend found the book but it is not currently
  readable (draft/in_review/changes_requested/rejected/unpublished/
  archived — anything other than `published`). Never treat the `locked:
  true` case as "unknown, fall back to bundled/offline content" — that
  would bypass the catalog gate for a real, deliberately-unpublished book.
  The only bypass of this specific gate is the book's own author reading
  their own not-yet-published book.

If the mobile app has its own copy of this access-check logic (rather than
calling the same server function), it must replicate all three gates, not
just the subscription one, or it will leak restricted content.

## 2. Public content settings (new)

A new read-only endpoint-equivalent, `content_settings` (RLS: public read
where `is_public = true`), holds versioned JSON config both clients should
consume:

| key | shape | meaning |
| --- | --- | --- |
| `monetization_enabled` | `boolean` | Master switch for paid gating. Default/missing = `false` (free). |
| `home_collections` | `{ id, title, bookIds[] }[]` | Curated home-screen rows. |
| `featured_books` | `string[]` (book ids) | |
| `categories` | `string[]` | |
| `announcements` | `{ id, message, active }[]` | Show only where `active`. |
| `support_contact` | `{ email, helpUrl? }` | |
| `maintenance_message` | `{ active, message? }` | Show a banner when `active`. |
| `language_availability` | `string[]` | Languages currently offered. |

Fetch via `select value from content_settings where key = '<key>' and
is_public = true`, or reuse the website's aggregate function
(`getPublicContentSettings` in `src/lib/admin/settings.functions.ts`) if
you stand up an equivalent HTTP endpoint. Cache with a short TTL (a few
minutes) and refetch on app foreground — there's no push invalidation.
`translation_budget` exists but is **not** in the public set; don't fetch
it from a client context.

## 3. Reader-requested Hindi/Arabic translation access (new)

New table `translation_requests`:

```
id, book_id, language, requester_id, status, job_id, decision_reason,
reviewed_by, reviewed_at, created_at, updated_at
```

`status` one of: `requested`, `approved_awaiting_edition`, `granted`,
`declined`, `revoked`.

- A signed-in reader can insert their own row directly (RLS allows
  `insert ... with check (requester_id = auth.uid())`) — one row per
  (book, language, reader), unique constraint enforced.
- The app should let a reader request access when it gets
  `translation_access_required`, then poll or re-check on next open;
  there's no push notification wired up yet (see §5).
- A reader can read their own rows (`select ... where requester_id =
  auth.uid()`). They cannot approve/decline their own request — only
  admin/editor roles can, server-side.

## 4. Publishing workflow status values changed (additive)

`books.status` now accepts, in addition to the existing `draft`,
`in_review`, `published`, `unpublished`: `changes_requested`, `approved`,
`rejected`, `archived`. If the app has its own switch/enum over `status`
for display labels, add these — don't treat an unrecognized value as an
error, since more values may be added the same way in the future (treat
unknown as "not currently readable" rather than crashing).

**The publish gate only requires rights + editorial approval — never a
finished translation.** An approved original-language edition becomes
`published` (and readable) as soon as `rights_status = 'approved'` and
`edition_review_status = 'approved'`; English and Urdu are the standard
translation targets but are produced asynchronously afterward and never
block the original. `evaluatePublishGate` (and the mirrored DB trigger)
reports missing English/Urdu editions as `pendingTranslations` — purely
informational, never a reason the original can't publish. If the app has
its own copy of this logic, do not require a reviewed English/Urdu edition
before treating a book as publishable.

`books` also gained rights/provenance columns (`rights_basis`,
`rights_status`, `edition_review_status`, `rejection_reason`,
`review_notes`, `translator`, `categories`, etc.) — additive, safe to
ignore if the app doesn't display them yet.

**Author self-publish changed**: an author can no longer move their own
book directly to `published` — only `draft` → `in_review` → (admin-only)
`published`, or back to `unpublished`/`draft`. If the app has its own
"Publish" button calling this transition directly against the `books`
table, it will now be rejected by RLS (see the recommended policy change in
`supabase/migrations/0005_catalog_rights_and_review_workflow.sql`) — it
needs to call the admin review flow instead, or simply show "submitted for
review" and let the website/admin handle the rest, since publish decisions
are now an accountable, audited admin action either way.

## 5. Not yet built for mobile (things this change does NOT claim)

- No push notification for "your translation is ready" or "your ticket was
  answered" — the data (`translation_requests.status`, ticket status) is
  there to poll, but no notification service is wired up.
- No mobile-specific support-ticket UI was built (the website has one at
  `/legal#support` for anonymous reports and via `support.functions.ts` for
  signed-in users) — the same server functions are reusable from a mobile
  client if it can call TanStack Start server functions over HTTP, or the
  underlying Supabase tables/RLS can be queried directly for the read paths.
- MFA enrollment for admins was only built as a web UI
  (`src/components/admin/AdminMfaGate.tsx`) — irrelevant to the reader-facing
  mobile app, since admins use the website, not the app.
