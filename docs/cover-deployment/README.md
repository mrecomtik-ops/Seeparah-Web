# Seeparah premium 42 cover deployment — verified 5 November 2026

**41 newly deployed, 0 previously covered, 1 staged, 0 unmatched book records.**

- 37 literary covers: published books, exact SP-CAND / title / author / Gutenberg source IDs, previously NULL cover URLs.
- 4 sacred original-language covers: published books, exact approved original-language source editions and matching edition-specific artwork; sibling translation edition cover records untouched.
- SP-CAND-0105 (Tenda e castello): art credits Carlo Dossi, while Gutenberg source credits Roberto Sacchetti. Staged privately, no public URL or database assignment.
- All 42 original WebPs individually verified as 1024x1536 using the original handoff SHA-256 list.
- Cloudflare Worker v439 deployed at 100%; all 41 WebP URLs returned HTTP 200, image/webp and matching SHA-256.
- Idempotent protected SQL applied transactionally. Post-check: 41 matched book URLs, 4 original-language edition cover records.
- Browser QA: 16/16 book detail cover checks passed (8 books x mobile and desktop); library book cards use the same book cover field.
- Code: PR #152, merge eaf5fa3e636e76ab72db1e0d9ded4becb8a7f093. Final evidence and manifest: follow-up PR.
- No authentication, environment variables, translations, source text, rights approvals, user data, reading positions, publication statuses or unrelated covers changed.

Per-cover evidence and book detail links: see status CSV/JSON. Original handoff manifest retained separately.
