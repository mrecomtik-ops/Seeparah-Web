# Seeparah UI/UX audit remediation status — 2026-10-31

This is an evidence-based engineering handoff for Seeparah's 36-item external audit.
Original audit: https://claude.ai/artifact/Rph1KTXdc9xNcRih33dG4t (requires Claude sign-in; full item text was not available in this review).
**Do not equate merged PR counts with 36 resolved items.** All acceptance criteria must be rechecked against the full original register.

## Shipped into GitHub main (CI passed before merge)

| PR | Change | Scope / remaining caveat |
| --- | --- | --- |
| #35 | Sacred detail Read CTA; Sacred Texts global navigation; admin queue loading state; normalized aliases; safer admin deletion controls; bilingual language fallback | Needs full device QA |
| #36 | Read CTA near book title on mobile | Needs 320px verification |
| #37 | Library pagination; sacred search normalization; reader keyboard/finish guards; bilingual language labels; book-specific browser title | Catalog still loads all published records before client-side pagination |
| #38 | Bundled OFL fonts for Urdu, Arabic, Hebrew, Devanagari, Tibetan | Font rendering needs screenshot comparison on each script; Chinese/Greek CDN fallback remains |
| #39 | Skip-to-main link and larger tap targets | Accessibility audit not complete |
| #40 | Admin catalog table widths, truncation, sticky Actions | Narrow-screen admin usability still needs testing |
| #41 | Collapsible unrequested translation labels; 404 search | No content edits |
| #42 | Render 32 sacred source passages per group; exact-label reference jump and passage navigation | Full section response still fetched; extremely long single source chunks remain |
| #43 | Homepage book search and direct Library/Sacred Texts CTA | Further visual polish remains |
| #44 | Admin cover URL live preview beside source edition ID | No automatic exact-edition matching or asset upload |
| #45 | Optional side-by-side comparison for existing verified canonical-alignment pairs | Does not infer alignment for others; SSR & mobile QA remain |
| #46 | 24-card skeleton to reduce Library loading layout shift | Full catalog still fetched |
| #47 | Compact narrow-screen navigation with More for Author/Profile/Admin/Sign in | 320px, zoom, screen-reader/browser validation remain |
| #48 | Collapsible tradition sections with automatic expansion for filtered results | Screen reader and mobile testing remain |
| #49 | Debounced scroll-based saved sacred passage progress | Confirm end-to-end resume across login/session and long chunks |
| #50 | URL-persistent sorting by title or author | Need regression checking with combined filters |

## Public verification observed

- The public homepage displayed Find a book and Browse library.
- A real browser's Library search for "quran" returned The Qur'an, with reader entry and five published languages.
- Sacred Texts showed 84 published reader titles across eight traditions.
- The Qur'an English reader exposed existing exact reference jump, selected-language attribution and optional comparison selector.
- Cloudflare deployed newer Worker versions at 100%, but its deployment metadata does not attest the exact GitHub commit. Match the deployed bundle or perform route-by-route browser verification before declaring a PR live.

## Outstanding work: do not mark all 36 resolved

1. Recover the complete original 36-item register and track each ID with owner, evidence, code PR, acceptance test and live result. The linked artifact requires authentication.
2. Fully verify 320px, 390px, tablet and 200% browser zoom on homepage, catalog, book detail, public reader and admin. Check RTL, layout overflow, keyboard focus and screen readers.
3. Sacred reader server-side chunk fetching: its per-chapter API still selects full sections, even when the UI renders just 32. Investigate bounded data queries without changing numbering/marks/source bytes.
4. Extremely long single source chunks (some discourses) need lossless sectional rendering without inventing structure.
5. Verify scroll-saved reading progress, exact reference navigation and aligned-parallel editions across supported originals/translations; cover tab/keyboard/mobile behavior.
6. Complete design-system and page-level visual polish rather than assuming targeted issue patches equal a redesign.
7. Admin catalog cover upload and edition-matching workflow, missing-cover queue, batch edit/rights review UX and improved deletion guards; retain source metadata.
8. Test signed-out journeys, authenticated user roles and authorized admin flows. Do not bypass MFA or use real destructive actions.
9. Load/accessibility/performance measurement with real browser metrics, not CI alone.
10. Reconcile every recommendation and defect in the original Claude audit; this tracker is not the authoritative complete 36-item register.

## Safeguards

- Production stays on Cloudflare and Supabase.
- Never change scripture text, generate translations, invent canonical pagination, alter basmalas/diacritics or silently change numbering.
- Preserve rights holds, source editions, user data and environment variables.
- Always run GitHub CI before merging; verify Cloudflare deployment separately from GitHub state.
