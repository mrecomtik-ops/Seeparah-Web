# Seeparah QA batch 4 — 2026-11-11

Production target: Cloudflare Workers `seeparah-web` and Supabase project `wxldqxuxpjurttspbxok`, repository `mrecomtik-ops/Seeparah-Web`. All production data, publication status, rights, source files, user progress, translations, and Cloudflare environment variables stay unchanged.

## Findings addressed / verified (9 of original QA register)

| Finding | Action | Acceptance boundary |
|---|---|---|
| QA-015 Cover sharpness | Identify archived Gutenberg `cover-medium.jpg` images and cap them at native 200x300 display rather than upscaling across Library cards and feature panel; preserve high-res premium artwork. | **Partial:** 676 published Gutenberg medium JPEGs still require actual higher-resolution source/artwork for genuinely sharper full-size display. No image bytes replaced. |
| QA-017 Collections with zero titles | Verify existing UI includes counts for the complete 53-topic taxonomy and disables empty category options; tested logic retained. | **UI addressed:** no copyrighted/unverified books are fabricated merely to populate empty topics. |
| QA-019 Reader initial-load latency | Delay book payload prefetch 250ms on intentional desktop hover; instant prefetch on keyboard focus; reuse exact V3 React Query key; only free, nonreligious editions. | **Partial:** first cold entry and physical full-book pagination still need measurements/virtualization. |
| QA-023 Help overlay | Explicit route predicate prevents floating Help on /read*, individual sacred texts and admin routes while keeping it accessible in Library and Legal. Added route regression tests. | **Code addressed:** browser viewport/screen-reader acceptance pending. |
| QA-024 Worker CPU overhead | Scheduled cron reads the existing importer-enabled flag first; when paused, skips dynamic loading of expensive acquisition/import modules. Existing internal rights/year/structure checks still apply when active. | **Partial:** actual Worker CPU metrics and queue architecture at 10k require load testing. Importer remains paused. |
| QA-025 Missing genre facets | Restore visible `Genre / subject` dropdown with counts from genres and assigned editorial topics in **published** books only, retaining original `genre` and `category` URL filters. Added exact-match tests, no invented classification. | **Code addressed:** taxonomy population still tied to sourced classifications. |
| QA-026 Wrong sign-in prompt on translation request | Reader waits for auth hydration and retries Supabase token refresh once for a known signed-in user; guests cannot send authenticated requests; server permission checks unchanged. Added signed-in/guest tests. | **Code addressed:** manual authenticated-browser acceptance pending. |
| QA-030 CSP inline script safety | Apply `script-src-attr 'none'` to prohibit inline HTML event handlers, while preserving TanStack's required inline SSR hydration script. | **Partial:** removing `script-src 'unsafe-inline'` safely still requires nonce-based hydration integration and review. |
| QA-035 Support contact | Verified published `content_settings.support_contact` has valid email + HTTPS Seeparah help URL. Legal support page now displays the validated, editor-published email alongside ticket form and reference-number workflow; falls back safely when unavailable. | **Code addressed:** no private admin contact/secret inferred or copied. |

## QA guardrails

- Require CI, architecture/reader workflow checks and Cloudflare deploy verification.
- No changes to book content, sacramental text, Basmala, author submissions, chapter nodes, source storage, user settings/reading progress, Cloudflare env or Supabase rights/publish gate.
- Confirm **Gutenberg importer remains disabled** and report a fresh published-book count.
- Do not call QA-015, QA-019, QA-024 or QA-030 fully closed until listed acceptance boundaries have been met.
- QA-013 remaining 663 bibliographic-only descriptions and QA-002 remaining 73 structural-review books are **not** automatically considered resolved by this batch.
