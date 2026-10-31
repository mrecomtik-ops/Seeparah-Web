# Seeparah 36-issue audit: acceptance register

**Baseline:** Claude’s 30 Oct 2026 SP-01…SP-36 audit; verified against Seeparah code and public checks on 31 Oct 2026. 
**Status meaning:** **Live pass** = the stated primary behavior was observed on the public site, not necessarily every device; **Needs QA** = code fix exists or the relevant surface needs verification; **Partial** = the stated audit acceptance criteria are not fully implemented; **Editorial** = immutable source conventions need human/source approval. 
**Do not call the 36 issues fully resolved solely because CI passes or PRs are merged.**

Summary (36 original items): 1 needs visual qa, 5 live pass, 2 needs mobile qa, 3 needs admin qa, 2 needs performance qa, 12 partial, 2 needs accessibility qa, 3 needs reader qa, 1 needs cross-edition qa, 1 needs rtl qa, 1 editorial decision pending, 1 needs seo qa, 1 needs source-specific qa, 1 needs nav qa.

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
| SP-14 | Admin cover asset management | Partial | [#44](https://github.com/mrecomtik-ops/Seeparah-Web/pull/44) [#55](https://github.com/mrecomtik-ops/Seeparah-Web/pull/55) [#56](https://github.com/mrecomtik-ops/Seeparah-Web/pull/56) | MFA-gated attributed staging + preview, explicit assignment; per-edition translation mapping and 2:3 crop remain |
| SP-15 | Literature arrow-key focus after toolbar action | Needs reader QA | [#37](https://github.com/mrecomtik-ops/Seeparah-Web/pull/37) | Fix merged; repeat keyboard focus regression |
| SP-16 | Finish state during repagination | Needs reader QA | [#37](https://github.com/mrecomtik-ops/Seeparah-Web/pull/37) | Measurement guard merged; test many viewport changes |
| SP-17 | Sacred canonical reference order | Needs cross-edition QA | [#52](https://github.com/mrecomtik-ops/Seeparah-Web/pull/52) | Sorted by sourced chunk/depth; verify Qur’an and other structures |
| SP-18 | RTL sacred header direction | Needs RTL QA | [#52](https://github.com/mrecomtik-ops/Seeparah-Web/pull/52) | Uses edition direction; verify Arabic/Hebrew browser |
| SP-19 | Basmala display convention | Editorial decision pending | none | Do not modify source/basmala mapping without source-backed per-edition convention and signoff |
| SP-20 | Book-specific reader tab title | Needs SEO QA | [#37](https://github.com/mrecomtik-ops/Seeparah-Web/pull/37) | Title derived from current book; check selected section metadata |
| SP-21 | Reduce unrequested translation edition noise | Needs mobile QA | [#41](https://github.com/mrecomtik-ops/Seeparah-Web/pull/41) | Collapsed requestable edition labels |
| SP-22 | Remove unreliable fixed page counts | Needs reader QA | [#52](https://github.com/mrecomtik-ops/Seeparah-Web/pull/52) | Book detail reads source sections and reading time instead of fixed pagination count |
| SP-23 | 44px tap targets and skip link | Needs accessibility QA | [#39](https://github.com/mrecomtik-ops/Seeparah-Web/pull/39) [#47](https://github.com/mrecomtik-ops/Seeparah-Web/pull/47) | Site-wide improvements merged; 320px/200% and screen reader verification pending |
| SP-24 | Dhammapada licence notice order | Needs source-specific QA | code review | Verify scripture is first reading heading and licence after text or in source drawer |
| SP-25 | Library taxonomy and facets | Partial | [#50](https://github.com/mrecomtik-ops/Seeparah-Web/pull/50) [#60](https://github.com/mrecomtik-ops/Seeparah-Web/pull/60) | Category cloud collapses; Bilingual excluded from language facet; full collection-tradition hierarchy outstanding |
| SP-26 | Homepage covers/languages/traditions | Live pass | [#43](https://github.com/mrecomtik-ops/Seeparah-Web/pull/43) [#59](https://github.com/mrecomtik-ops/Seeparah-Web/pull/59) | Production classic and language shelves visible; tradition row still needs breadth review |
| SP-27 | Sacred collections structure | Live pass | [#48] [#68](https://github.com/mrecomtik-ops/Seeparah-Web/pull/48) | Dedicated NT 27-unit and Tanakh 39-unit collection pages verified live on Cloudflare; other-tradition collection coverage still merits UX review |
| SP-28 | Parallel original and verified translation | Partial | [#45](https://github.com/mrecomtik-ops/Seeparah-Web/pull/45) | Optional verified alignments; Qur’an, Genesis, Matthew mobile and source-pair acceptance still pending |
| SP-29 | Literature reader toolbar/settings/padding | Partial | existing V3 | Reader settings have size/theme, but full typeface/spacing/margins and simplified chrome unfinished |
| SP-30 | Admin operational overview queues | Needs admin QA | [#56](https://github.com/mrecomtik-ops/Seeparah-Web/pull/56) [#66](https://github.com/mrecomtik-ops/Seeparah-Web/pull/66) [#67](https://github.com/mrecomtik-ops/Seeparah-Web/pull/67) | Review queues, cover counts, stage filters and provider status separated; in-role production QA outstanding |
| SP-31 | Typed settings rather than raw JSON | Partial | [#58](https://github.com/mrecomtik-ops/Seeparah-Web/pull/58) | Raw versioned JSON owner-only, typed controls still incomplete for all configuration keys |
| SP-32 | Readable grouped admin audit history | Partial | [#63](https://github.com/mrecomtik-ops/Seeparah-Web/pull/63) | Book titles resolved; actor display, grouping/export and other entity names missing |
| SP-33 | Simplified reader shelves and dedup | Partial | [#64](https://github.com/mrecomtik-ops/Seeparah-Web/pull/64) | Profile displays one work with all badges; underlying shelf model still overlaps |
| SP-34 | SEO metadata and sharing | Partial | [#52](https://github.com/mrecomtik-ops/Seeparah-Web/pull/52) [#61](https://github.com/mrecomtik-ops/Seeparah-Web/pull/61) | Book/sacred OG and JSON-LD improvements; chapter-level canonical/indexing policy unresolved |
| SP-35 | Near-empty Research in primary navigation | Needs nav QA | [#57](https://github.com/mrecomtik-ops/Seeparah-Web/pull/57) | Insights promoted to nav; Research direct URL/footer remains, no content invented |
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
