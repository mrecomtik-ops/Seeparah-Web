# Seeparah — 113-Cover Book Publication Recovery (11 November 2026)

## Scope and verified production state

Source: production Supabase project `wxldqxuxpjurttspbxok`, repository `mrecomtik-ops/Seeparah-Web`, covers deployed in PR #169.

- **Published catalogue:** **854** records with `books.status='published'` as of the latest production recount (up from 844 at the start of this recovery).
- **113-cover batch:** 24 candidate IDs **published**, 35 candidate IDs **imported / in_review**, and 54 candidate IDs **without imported production book records**. The 113 cover assets are static files, not proof of publication.
- **This recovery session:** 10 releases, including seven source-front-matter or navigation repairs, all reviewed for their identified source editions, reading structure, covers and scoped rights. The other 14 of the 24 were released in an earlier session on the same date.
- Five of the 54 cover-only candidates represent literary **works** already published under different IDs (e.g. *Little Women*, *House of the Seven Gables*, *Tristram Shandy*, *Humphry Clinker*, *After London*). Edition-level identity and cover attribution need reconciliation; do not create duplicate books based solely on title.

## Recovered and published source editions

| Candidate | Title | Source edition | Technical recovery | First publication |
|---|---|---|---|---|
| SP-CAND-0148 | Keeping up with Lizzie | Gutenberg #11503 | Restored complete Chapter I as 3 chunks; 15 total chunks, 7 chapter nodes; original 12 chunks preserved | 1911 |
| SP-CAND-0182 | Books and Culture | Gutenberg #16736 | Re-split existing lossless text into 24 chapter chunks; 24 navigation nodes; original concatenated text unchanged | 1896 |
| SP-CAND-0346 | The Island of Doctor Moreau | Gutenberg #159 | Restored original introduction; 39 chunks, 23 navigation nodes; original 38 chunks preserved | 1896 |
| SP-CAND-0403 | Three Men in a Boat | Gutenberg #308 | Restored original preface; 52 chunks, 21 navigation nodes; original 51 chunks preserved | 1889 |
| SP-CAND-0086 | The Sea-Hawk | Gutenberg #3294 | Full chunk/structure and named-cover verification; original source unchanged | 1915 |
| SP-CAND-0152 | The Prodigal Village | Gutenberg #44796 | Full chunk/structure and named-cover verification; original source unchanged | 1920 |
| SP-CAND-0154 | The Turning of Griggsby | Gutenberg #50087 | 18 source chunks and 11 navigation nodes verified; no source rewrite | 1913 |
| SP-CAND-0142 | Darrel of the Blessed Isles | Gutenberg #12102 | Recovered Preface and Prelude; 60 chunks and 39 nodes; preserved original 58 chunks | 1903 |
| SP-CAND-0143 | Eben Holden | Gutenberg #2799 | Recovered original Preface; 74 chunks and 46 nodes; preserved original 73 chunks | 1900 |
| SP-CAND-0153 | Silas Strong, Emperor of the Woods | Gutenberg #50091 | Recovered author foreword; 54 chunks and 37 nodes; preserved original 53 chunks | 1906 |

All ten releases have `rights_status`, `edition_review_status`, `structure_review_status`, `cleanup_review_status` = `approved`. Their stored `permitted_territories` are United States and United Arab Emirates; the team must separately verify enforcement of territorial restrictions in the public delivery layer. Do **not** infer worldwide clearance from a Gutenberg page.

### Preservation and rollback evidence

Private table `public.qa_20261111_source_repair_backups` contains snapshots of the original book metadata, chunks, structure nodes, source URL and original MD5 before any of the seven repairs. RLS enabled; no `anon` or `authenticated` privileges. Original source verification (MD5 of preserved text before versus after) passed:

| Candidate | Original text MD5 |
|---|---|
| SP-CAND-0148 | `340a0ff58f4866d61b53ec81f4d0f562` |
| SP-CAND-0182 | `db51c6f7c4db89906d4bf11216da6ad3` |
| SP-CAND-0346 | `41af4e0e6d81e1cc18bfb41f6c21a3b2` |
| SP-CAND-0403 | `ea387a3b5e8eb13526d42fbd3d24d4a3` |
| SP-CAND-0142 | `3d842e3bbea8b90ed7c976276b136d8f` |
| SP-CAND-0143 | `c4452b957c1fb43cd35387cc9a123db2` |
| SP-CAND-0153 | `a1abab01e960bd00dcdc62140d7f83d7` |

## Unfinished work — do not misstate this as complete

**35 imported books remain in review.** Verify original book and edition publication dates independently, reconstruct missing chapter/front matter if needed, check source fidelity and rights (including translations, illustrated/edited material), verify correct individual cover and summary, then pass four approval gates. Never blanket-approve on the strength of chunk count alone.

**54 cover-only candidate records are not imported.** The source computer `DESKTOP-VDOJS9H` with the previous acquisition EPUBs is offline. Recover originals from authorized public sources only when exact edition / rights / author metadata have been established, or reconnect source machine. Five title-level duplicates must be reconciled to an existing book and correct edition instead of added as new books. Do not treat locally staged EPUB statuses or cover asset names as publication approvals.

**Separate importer issue:** Automated Gutenberg importer is disabled. At last check, ~650 failed jobs indicated missing independent original publication year; 52 additional jobs returned HTTP 521 while looking up dates, with 12 remaining queued. Fix year-source reliability, book structure, idempotency, duplicate work detection, and review gate before attempting another bulk run. Do not silently restart the disabled autopilot.

All user data, unrelated published titles, authentication, religious texts, and environment variables were left untouched by the source-recovery transactions. All database modifications were guarded and checked against source metadata and exact hashes. Full browser end-to-end validation and worldwide territory enforcement have not been established by these database checks.
