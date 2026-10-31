# Seeparah 36-issue audit: acceptance register

**Baseline:** Claude’s 30 Oct 2026 SP-01…SP-36 audit; verified against Seeparah code and public checks on 31 Oct 2026. 
**Status meaning:** **Live pass** = the stated primary behavior was observed on the public site, not necessarily every device; **Needs QA** = code fix exists or the relevant surface needs verification; **Partial** = the stated audit acceptance criteria are not fully implemented; **Editorial** = immutable source conventions need human/source approval. 
**Do not call the 36 issues fully resolved solely because CI passes or PRs are merged.**

Summary (36 original items): 1 needs visual qa, 10 live pass, 2 needs mobile qa, 5 needs admin qa, 2 needs performance qa, 6 partial, 2 needs accessibility qa, 3 needs reader qa, 1 needs cross-edition qa, 1 needs rtl qa, 1 live source-integrity pass, 1 needs live ui qa, 1 needs reader geometry qa.

| ID | Original finding | Status | PR evidence | Unresolved acceptance criterion |
|:--|:--|:--|:--|:--|
| SP-01 | Multiscript web fonts | Needs visual QA | [#38](https://github.com/mrecomtik-ops/Seeparah-Web/pull/38) | Bundled OFL Urdu, Arabic, Hebrew, Devanagari, Tibetan; verify actual loaded font faces on devices and Chinese/Greek fallbacks |
| SP-02 | Sacred detail Read CTA | Live pass | [#35](https://github.com/mrecomtik-ops/Seeparah-Web/pull/35) | Live Qur’an detail Read Arabic opened correct Tanzil edition |
| SP-03 | Book detail CTA above fold | Needs mobile QA | [#36](https://github.com/mrecomtik-ops/Seeparah-Web/pull/36) | Implemented near title; 320px and 200% zoom not measured |
| SP-04 | Admin archive/permanent deletion safeguards | Needs admin QA | [#35](https://github.com/mrecomtik-ops/Seeparah-Web/pull/35) | Guard code exists; exercise authorized non-destructive flows, never perform production deletion test |
| SP-05 | Unified site header and flagship nav | Live pass | [#35](https://github.com/mrecomtik-ops/Seeparah-Web/pull/35) [#47](https://github.com/mrecomtik-ops/Seeparah-Web/pull/47) [#57](https://github.com/mrecomtik-ops/Seeparah-Web/pull/57) [#65](https://github.com/mrecomtik-ops/Seeparah-Web/pull/65) | Homepage, Library, Sacred Texts show Library/Sacred/Insights consistently in browser |
| SP-06 | Normalized Library search and aliases | Live pass | [#35](https://github.com/mrecomtik-ops/Seeparah-Web/pull/35) [#37](https://github.com/mrecomtik-ops/Seeparah-Web/pull/37) | Production quran search resolved Qur’an |
| SP-07 | Normalized Sacred Texts search | Live pass | [#37](https://github.com/mrecomtik-ops/Seeparah-Web/pull/37) | Qur’an discovery verified; other aliases still require regression |
| SP-08 | Admin false all-clear while loading | Needs admin QA | [#35](https://github.com/mrecomtik-ops/Seeparah-Web/pull/35) | Loading skeleton/guard; verify MFA owner and slow network |
| SP-09 | Sacred section load and persistent chrome | Needs performance QA | [#53](https://github.com/mrecomtik-ops/Seeparah-Web/pull/53) | Keeps same-edition content while pending, prefetches; measure warm transition latency |
| SP-10 | Bounded sacred passages and exact jump | Partial | [#42](https://github.com/mrecomtik-ops/Seeparah-Web/pull/42) [#49](https://github.com/mrecomtik-ops/Seeparah-Web/pull/49) [#54](https://github.com/mrecomtik-ops/Seeparah-Web/pull/54) | Production bounded ranges and navigation; very large single source chunks remain |
| SP-11 | Bilingual BCP-47 language tags | Needs accessibility QA | [#35](https://github.com/mrecomtik-ops/Seeparah-Web/pull/35) [#62](https://github.com/mrecomtik-ops/Seeparah-Web/pull/62) | One shared mapping; mul not Bislama; check per-span spoken language |
| SP-12 | Library paging and layout stability | Needs performance QA | [#37](https://github.com/mrecomtik-ops/Seeparah-Web/pull/37) [#46](https://github.com/mrecomtik-ops/Seeparah-Web/pull/46) | Client-side 24-card pagination and skeleton; server still loads catalog |
| SP-13 | Admin table density and filters | Partial | [#40](https://github.com/mrecomtik-ops/Seeparah-Web/pull/40) [#56](https://github.com/mrecomtik-ops/Seeparah-Web/pull/56) [#66](https://github.com/mrecomtik-ops/Seeparah-Web/pull/66) | Status/rights/edition/structure/cover/language filters exist; responsive 1280px acceptance not measured |
| SP-14 | Admin cover asset management | Partial | [#44](https://github.com/mrecomtik-ops/Seeparah-Web/pull/44) [#55](https://github.com/mrecomtik-ops/Seeparah-Web/pull/55) [#56](https://github.com/mrecomtik-ops/Seeparah-Web/pull/56) [#72](https://github.com/mrecomtik-ops/Seeparah-Web/pull/72) | Exact verified-edition language-specific attributed staging and assignment migrated; 168 edition records preserved. 2:3 crop and MFA role-specific browser testing remain. |
| SP-15 | Literature arrow-key focus after toolbar action | Needs reader QA | [#37](https://github.com/mrecomtik-ops/Seeparah-Web/pull/37) | Fix merged; repeat keyboard focus regression |
| SP-16 | Finish state during repagination | Needs reader QA | [#37](https://github.com/mrecomtik-ops/Seeparah-Web/pull/37) | Measurement guard merged; test many viewport changes |
| SP-17 | Sacred canonical reference order | Needs cross-edition QA | [#52](https://github.com/mrecomtik-ops/Seeparah-Web/pull/52) | Zero mismatched Qur’an ayah references/positions across 6,236 verses × five languages confirmed by production SQL; cross-tradition reader-order review remains |
| SP-18 | RTL sacred header direction | Needs RTL QA | [#52](https://github.com/mrecomtik-ops/Seeparah-Web/pull/52) | Uses edition direction; verify Arabic/Hebrew browser |
| SP-19 | Basmala display convention | Live source-integrity pass | none | Production SQL: 112/112 Arabic basmala metadata strings already prefix the exact first-ayah source content, zero mismatches; 1:1 integral and 9:1 unmarked. Do not display basmala twice; cross-device typography QA remains. |
| SP-20 | Book-specific reader tab title | Live pass | [#37](https://github.com/mrecomtik-ops/Seeparah-Web/pull/37) [#76](https://github.com/mrecomtik-ops/Seeparah-Web/pull/76) | Public reader HTML verified: Jekyll/Hyde and Dhammapada return exact book-specific titles after PR #76; stable public URLs remain. |
| SP-21 | Reduce unrequested translation edition noise | Needs mobile QA | [#41](https://github.com/mrecomtik-ops/Seeparah-Web/pull/41) | Collapsed requestable edition labels |
| SP-22 | Remove unreliable fixed page counts | Needs reader QA | [#52](https://github.com/mrecomtik-ops/Seeparah-Web/pull/52) | Book detail reads source sections and reading time instead of fixed pagination count |
| SP-23 | 44px tap targets and skip link | Needs accessibility QA | [#39](https://github.com/mrecomtik-ops/Seeparah-Web/pull/39) [#47](https://github.com/mrecomtik-ops/Seeparah-Web/pull/47) [#70](https://github.com/mrecomtik-ops/Seeparah-Web/pull/70) [#79](https://github.com/mrecomtik-ops/Seeparah-Web/pull/79) | 320px Sacred index render had no document overflow; reader toolbar 32–34px actions enlarged to 44px in PR #79. 200% native zoom and screen-reader testing pending. |
| SP-24 | Dhammapada licence notice order | Live pass | [#76](https://github.com/mrecomtik-ops/Seeparah-Web/pull/76) | 31 Oct live Pali reader shows Yamakavagga stanzas first and the SuttaCentral reuse notice once below text; no source content changed |
| SP-25 | Library taxonomy and facets | Needs live UI QA | [#50](https://github.com/mrecomtik-ops/Seeparah-Web/pull/50) [#60](https://github.com/mrecomtik-ops/Seeparah-Web/pull/60) [#84](https://github.com/mrecomtik-ops/Seeparah-Web/pull/84) | Dedicated Tradition and Collection/topic filters, using eight source-verified live tradition labels, merged PR #84. Existing category-based Judaism/Tanakh filtering confirmed publicly; distinct new controls still require post-deploy verification. |
| SP-26 | Homepage covers/languages/traditions | Live pass | [#43](https://github.com/mrecomtik-ops/Seeparah-Web/pull/43) [#59](https://github.com/mrecomtik-ops/Seeparah-Web/pull/59) | Production classic and language shelves visible; tradition row still needs breadth review |
| SP-27 | Sacred collections structure | Live pass | [#48](https://github.com/mrecomtik-ops/Seeparah-Web/pull/48) [#68](https://github.com/mrecomtik-ops/Seeparah-Web/pull/68) | Dedicated NT 27-unit and Tanakh 39-unit collection pages verified live on Cloudflare; other-tradition collection coverage still merits UX review |
| SP-28 | Parallel original and verified translation | Partial | [#45](https://github.com/mrecomtik-ops/Seeparah-Web/pull/45) | Optional verified alignments; Qur’an, Genesis, Matthew mobile and source-pair acceptance still pending |
| SP-29 | Literature reader toolbar/settings/padding | Needs reader geometry QA | [#75](https://github.com/mrecomtik-ops/Seeparah-Web/pull/75) [#79](https://github.com/mrecomtik-ops/Seeparah-Web/pull/79) | Typeface/leading/margin controls and 44px mobile buttons merged PRs #75/#79; public Jekyll/Hyde settings open and close correctly. Native 200% zoom, 320px reader and long-book repagination unverified. |
| SP-30 | Admin operational overview queues | Needs admin QA | [#56](https://github.com/mrecomtik-ops/Seeparah-Web/pull/56) [#66](https://github.com/mrecomtik-ops/Seeparah-Web/pull/66) [#67](https://github.com/mrecomtik-ops/Seeparah-Web/pull/67) | Review queues, cover counts, stage filters and provider status separated; in-role production QA outstanding |
| SP-31 | Typed settings rather than raw JSON | Needs admin QA | [#58](https://github.com/mrecomtik-ops/Seeparah-Web/pull/58) [#77](https://github.com/mrecomtik-ops/Seeparah-Web/pull/77) [#81](https://github.com/mrecomtik-ops/Seeparah-Web/pull/81) | Versioned typed controls now cover all structured settings including announcements, source collections, featured books, languages and translation budgets (PR #81); paid features remain launch-disabled; owner-role QA pending. |
| SP-32 | Readable grouped admin audit history | Needs admin QA | [#63](https://github.com/mrecomtik-ops/Seeparah-Web/pull/63) [#74](https://github.com/mrecomtik-ops/Seeparah-Web/pull/74) [#82](https://github.com/mrecomtik-ops/Seeparah-Web/pull/82) | Protected audit view now offers actor and ticket/research/translation labels (PR #82), date groups and export (PR #74); MFA-owner-role production QA pending. |
| SP-33 | Simplified reader shelves and dedup | Partial | [#64](https://github.com/mrecomtik-ops/Seeparah-Web/pull/64) | Profile displays one work with all badges; underlying shelf model still overlaps |
| SP-34 | SEO metadata and sharing | Live pass | [#52](https://github.com/mrecomtik-ops/Seeparah-Web/pull/52) [#61](https://github.com/mrecomtik-ops/Seeparah-Web/pull/61) [#85](https://github.com/mrecomtik-ops/Seeparah-Web/pull/85) | Live Jekyll/Hyde reader canonicalizes to /book/:id and Dhammapada to /sacred-texts/:id; both return noindex,follow on ephemeral read routes after PR #85. Search-engine recrawl outcome not guaranteed. |
| SP-35 | Near-empty Research in primary navigation | Live pass | [#57](https://github.com/mrecomtik-ops/Seeparah-Web/pull/57) | Public header verified Library/Sacred Texts/Insights navigation; near-empty Research is no longer presented as a main tab and remains reachable by its existing direct/footer route. |
| SP-36 | Reader/admin component maintainability | Partial | [#62](https://github.com/mrecomtik-ops/Seeparah-Web/pull/62) | Duplicated BCP47 logic removed; very long component files remain |

## Read-only production verification on Oct 31
A live browser run checked shared navigation on homepage/Library/Sacred Texts, real classic and language shelves, quran search, Qur’an Read Arabic, Tanzil Uthmani Al-Fatihah, and bounded passage/reference navigation. These passed. It **could not** set a 320px viewport or 200% browser zoom, and did not sign in as an admin. Do not infer those untested outcomes.

## Important safeguards and next acceptance gate
- Never rewrite sacred source texts, canonical numbering, basmalas or diacritics; only verified original and published human-sourced translations.
- Keep Cloudflare hosting, Supabase roles/MFA, source provenance/rights review, environment variables and unrelated books/user data.
- Real-world verification still required on 320/390px and 200% zoom, Android/iOS Urdu/Nastaliq/RTL, permission-gated admin workflows, long single-source units, accurate comparison alignment and large-book performance.
- No true all-clear until **every** SP item passes its listed acceptance criterion on production; PR CI and Cloudflare deployment alone do not prove user-visible behavior.

## Additional production acceptance evidence — 31 Oct 2026
- The New Testament collection route `/sacred-texts/collection/new-testament` responded with 27 individually linked Greek/English works.
- The Tanakh collection route `/sacred-texts/collection/tanakh` responded with Torah (5), Prophets (21), and Writings (13) and original Hebrew / verified English edition links.
- These routes were observed directly after PR #68 merged. This verifies the dedicated collection-page component of SP-27 but not 320px/200% zoom acceptance.
- PR #70 increased index read-action tap targets to at least 44px; cross-device measurements remain open.

## 320px Cloudflare Browser Rendering checks
- Sacred Texts index at 320 CSS pixels with mobile touch: document scrollWidth = 320, no document-level horizontal overflow.
- Four initially sub-44px elements included a hidden skip link and an inline provenance link (exceptions), plus Seeparah logo and Start reading controls (corrected in follow-up code).
- Browser zoom to actual 200% and touch-target coverage of every page remain unverified. Device scale factor is not browser zoom.

## Final production-integrity note
Read-only Supabase queries confirmed 6,236 verse chunks per Arabic/English/Urdu/Hindi/Chinese edition, zero missing canonical references or misaligned chunk indices, and 112 Arabic separate basmala annotations. See [five-language integrity report](quran-five-language-integrity-2026-10-31.md). This verifies the database, not cross-browser display or editorial changes.

Merged remediation: PRs #74 (audit timeline/export), #75 (V3 book typography) and #76 (source notice/reader title) passed GitHub CI, including dedicated reader verification where applicable. Typed-settings PR #77 passed CI and merged; live owner-role end-to-end QA remains unverified.

## Latest live source notice check
On 31 Oct 2026, an independent public-page browser fetch at `/read/3e2c1103-36a9-5a44-987c-259d27dea072?lang=Pali&page=1` reported title `Dhammapada — Seeparah`, rendered Yamakavagga's first 20 Pali verses, lacked the duplicate pre-text `Reuse:` line, and retained the CC0/SuttaCentral reuse notice after the stanzas. This verifies SP-24 on production for the Pali edition, not every device or edition.

PR #79 (mobile reader tap targets and simplified header) passed both CI and independent reader verification before merging; browser zoom/accessibility sign-off remains separate.

## Acceptance checkpoint — 1 November 2026
See [production acceptance report](seeparah-production-acceptance-2026-11-01.md) for source-integrity SQL, the new PR #81–#85 implementation records, browser checks and remaining tests. Authenticated admin permissions, exact cover-to-edition rights, true native browser zoom, font devices, large source performance, parallel translation alignment and long-book repagination remain unverified where noted. A published source metadata basmala is already integral to the chunk text and must never be inserted twice.

## Public SEO metadata check — 1 November 2026
Verified live `/read/8c20a875-ed09-4be7-bda0-acccc1a3000a?lang=English&page=1` returned reader title `The strange case of Dr. Jekyll and Mr. Hyde — Seeparah`, robots `noindex,follow`, canonical `https://seeparah.com/book/8c20a875-ed09-4be7-bda0-acccc1a3000a`.
Verified live `/read/3e2c1103-36a9-5a44-987c-259d27dea072?lang=Pali&page=1` returned title `Dhammapada — Seeparah`, robots `noindex,follow`, canonical `https://seeparah.com/sacred-texts/3e2c1103-36a9-5a44-987c-259d27dea072`. No content changes were required.
