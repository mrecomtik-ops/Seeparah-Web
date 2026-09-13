# Seeparah roadmap

- [x] Backend schema (books, chunks, progress, highlights, subscriptions) + RLS + seed books
- [x] Google sign-in configured
- [x] Logo + favicon
- [x] Generated book covers
- [x] Design system (warm editorial, Fraunces/Outfit, dark mode)
- [x] Landing page
- [x] Library (search, language filter, book of the day, continue reading)
- [x] Reader (chunk paging, languages, progress, highlights, AI translate, paid gating)
- [x] Author Studio (dashboard, publish, analytics)
- [x] Profile + Plans/subscription (Stripe test-mode messaging)
- [x] Demo-mode fallback (localStorage)
- [x] Seeded real book content in the database
- [x] Reader dashboard (continue reading, goal, streak, for you, recommended, trending)
- [x] Personal library shelves (saved, favorites, want to read, history) + language/author/topic filters
- [x] Reader bookmarks + auto-saved progress + streak tracking
- [x] Author earnings summary + author profile
- [x] Reader & author plans with 70/30 split
- [x] Profile language preference, weekly goal, saved titles
- [x] Mobile bottom navigation
- [ ] Wire real Stripe checkout (needs Stripe keys) — deliberately paused: Seeparah is
      free during launch, `monetization_enabled` content setting defaults to off
- [x] Admin roles (owner/administrator/editor/support) + MFA-gated `/admin` + audit log
      (schema in `supabase/migrations/0004-0006`, plus the required access-policy
      migration `0007` — none applied yet — see docs/admin-operator-guide.md for
      first-owner setup and how to apply)
- [x] Real editorial review workflow: rights review + edition review, separate from
      publishing; publishing the original requires rights + editorial approval only
      (missing English/Urdu editions are non-blocking `pendingTranslations`, not a
      publish gate — an earlier version of this wrongly required both before the
      original could publish; fixed). Self-publish is closed at the RLS layer by
      `0000`/`0007` (`books_author_update`'s status allow-list) — verified live that
      it was NOT closed before this fix; see docs/security-verification-2026-09.md.
- [x] Admin catalog: batch/CSV upload, EPUB parsing (JSZip, zip-bomb/path-traversal
      guarded), checksum/import-key dedupe
- [x] Reader-requested Hindi/Arabic translation access, separate from production,
      idempotent per (book, language, reader)
- [x] Support tickets (signed-in + anonymous "can't sign in" report), admin
      assignment/status/internal-notes/public-replies
- [x] Versioned content settings (home collections, announcements, maintenance,
      feature flags) with publish/rollback, shared contract documented for the
      mobile app in docs/mobile-api-contract.md
- [x] Admin health page: stalled/failed job detection, allowlisted recovery actions
- [ ] **Urgent, standalone, independent of the rest of this list**: apply
      `0000_hotfix_current_books_rls.sql` — closes a live, verified exposure in the
      CURRENT schema (anonymous read of unpublished manuscript text; author
      self-publish) — see docs/security-verification-2026-09.md
- [ ] Apply migrations `0001`-`0007` to the live Supabase project in that order,
      including `0007` (the final `books`/`book_chunks` access policy — required,
      not optional) — see docs/admin-operator-guide.md §8
- [ ] PDF ingestion (needs a verified text-extraction/OCR pipeline — not built)
- [ ] Push notifications for "translation ready" / "ticket answered" (mobile + web)
