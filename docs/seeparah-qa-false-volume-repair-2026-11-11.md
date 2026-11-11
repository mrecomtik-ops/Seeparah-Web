# Seeparah — QA false-volume repair & reader acceptance handoff (11 November 2026)

## What changed in production

- **44 published books** received guarded reader-navigation repairs; 43 newly identified from the false English `PART` regex, plus one independently corrected *Emma*.
- **48 erroneous part nodes** (43 books) plus *Emma*'s one false part have been removed or replaced with correct chapter-parent links. No remaining false headings matching `Part of`, `Partly`, `Parting` or `Volume 1 contains` were detected after the repairs.
- Each book has a full unchanged source-version structure JSON rollback in `public.qa_20261111_structure_repair_backups`.
- No book chunks, original source bytes, religious content, copyright/rights approvals, user records, annotations, progress, settings or environment variables were modified.
- PR [#187](https://github.com/mrecomtik-ops/Seeparah-Web/pull/187) fixes the parser classification and adds regression tests. PR CI passed; merged as `0418b72288f7dcfa8e06452bbf1ea90b52286bd5`.
- Cloudflare Worker version **472** was observed at **100%** on 11 November 2026 18:57 UTC. Its metadata does not expose the Git SHA, so exact build provenance and live reader/device acceptance are not yet proven.

## Per-book source inventory

| Published book | Book UUID | Gutenberg source | Navigation repair |
|---|---|---|---|
| "All's Well"; or, Alice's Victory | `7f1f4526-d6b6-4816-8cf8-3d5351a5f558` | `gutenberg:21233` | all false parts |
| "Miss Lou" | `f871d2ae-ce75-4ffa-9a05-986f8a0bbd23` | `gutenberg:5309` | Roe collected-volume repair |
| A Cousin's Conspiracy; Or, A Boy's Struggle for an Inheritance | `2d7f5cb5-cab8-4c8b-8781-2ab09fd2d546` | `gutenberg:26630` | false standalone part |
| A Knight of the Nineteenth Century | `b7debf8b-1bc1-42cc-b108-4f8a28465a82` | `gutenberg:6311` | Roe collected-volume repair |
| A Rent In A Cloud | `07ca782d-9af5-4b5a-a2cd-476e4cce942b` | `gutenberg:32082` | false standalone part |
| Armadale | `695f19af-098c-4c11-a8f8-550ac3e7e595` | `gutenberg:1895` | false part inside genuine volumes |
| Arthur Mervyn; Or, Memoirs of the Year 1793 | `3e95cb11-9395-40d2-94a2-2ad4a9b0f4db` | `gutenberg:18508` | all false parts |
| Between Whiles | `7d3e2379-739f-426c-9d43-657fdf3ce04b` | `gutenberg:10756` | false standalone part |
| East Lynne | `5963d36b-58b2-45b1-ae35-ea54edc2aebd` | `gutenberg:3322` | false standalone part |
| Emma | `228953e2-6910-448a-8658-79f391e5b757` | `gutenberg:158` | Emma volume I |
| Endymion | `3667570b-8c22-4ce7-9856-e938aee8c85a` | `gutenberg:7926` | false standalone part |
| Facing the World | `cfb78952-9d74-4f10-8b11-a1892e27b145` | `gutenberg:6461` | false standalone part |
| From Jest to Earnest | `cfb877d2-4af4-43a5-89ee-6cb909a55ded` | `gutenberg:6102` | false standalone part |
| Gladys, the Reaper | `69692074-a6e2-4ff2-b85c-624f944e2049` | `gutenberg:15315` | false standalone part |
| Guy Mannering | `e10a3802-b609-4b40-a943-9b260d86dbf6` | `gutenberg:2590` | false standalone part |
| Guy Mannering; or, The Astrologer — Complete | `1a936f20-e131-49c7-9e66-12c76f1d9d81` | `gutenberg:5999` | false part inside genuine volumes |
| Helen and Arthur; or, Miss Thusa's Spinning Wheel | `fe6c26fd-82ee-4e9c-b09c-b9f5d2ecd0ad` | `gutenberg:23106` | publisher advertisement navigation |
| History of the Second Massachusetts Regiment of Infantry: Beverly Ford. | `54304dbd-52e5-40b2-b4f1-7061424d9d04` | `gutenberg:22586` | all false parts |
| Jorrocks' Jaunts and Jollities | `e98922b5-5e38-4236-91ae-c9d9f45fbeb4` | `gutenberg:15387` | all false parts |
| Little Dorrit | `023158bf-7c17-4d88-bf6c-a1fee4830c3b` | `gutenberg:963` | false part inside genuine volumes |
| Lorna Doone: A Romance of Exmoor | `ac7b8fc9-f642-469f-8ef8-4d37263f5ad3` | `gutenberg:840` | false standalone part |
| Making His Way; Or, Frank Courtney's Struggle Upward | `ccee4803-d45d-4741-8f4f-11267f1b5b71` | `gutenberg:13803` | false standalone part |
| Mark Seaworth | `0f50a371-d110-4491-bb0c-8e0aee31b1ca` | `gutenberg:21477` | false standalone part |
| New Arabian Nights | `e1eae506-f9c5-4ca4-8c10-89a1ce1da556` | `gutenberg:839` | false standalone part |
| No Name | `25f7cad1-1af0-46aa-b418-ce4d45668ead` | `gutenberg:1438` | false standalone part |
| Phoebe, Junior | `5ad740d3-a430-4325-84a6-25fe64f13413` | `gutenberg:28629` | all false parts |
| Salammbo | `b5812d12-90e8-4d25-a6e2-88dc7fca8716` | `gutenberg:1290` | false standalone part |
| Sylvia's Lovers — Complete | `d13de215-0a52-48b7-9917-8779c820eda1` | `gutenberg:4537` | false standalone part |
| Tartarin of Tarascon | `017f876e-7318-4eaa-948c-efefcc0e205f` | `gutenberg:1862` | all false parts |
| The Adventures of Hugh Trevor | `477106f3-5c9e-4969-a7ce-2ec217491a67` | `gutenberg:9811` | false part inside genuine volumes |
| The Boy Slaves | `226febf7-7762-4185-942c-0a625a152a58` | `gutenberg:24503` | false standalone part |
| The Bush Boys: History and Adventures of a Cape Farmer and his Family | `3992df8d-aa0c-48b0-ba91-6eedc673696a` | `gutenberg:21237` | false standalone part |
| The Death Shot: A Story Retold | `e7b09120-e3d4-45e3-82a8-270476dd08cd` | `gutenberg:23140` | false standalone part |
| The Deerslayer | `29759763-79ea-4921-911f-20b4de06cc7a` | `gutenberg:3285` | false standalone part |
| The End of a Coil | `ea8afe24-078e-4803-afae-4dd69dcd77ff` | `gutenberg:27618` | false standalone part |
| The Free Lances: A Romance of the Mexican Valley | `b42a917b-7958-47ed-ad82-17895836a4e9` | `gutenberg:27996` | false standalone part |
| The Giraffe Hunters | `e0381822-ba11-477c-a259-06b4ac21b29e` | `gutenberg:27911` | false standalone part |
| The History of Henry Esmond, Esq., a Colonel in the Service of Her Majesty Queen Anne | `790e749d-3e65-4707-ad36-ba8acf3e36bd` | `gutenberg:2511` | false part inside genuine volumes |
| The Innocents Abroad | `949cfe5d-a33a-44ac-9881-64689e42638b` | `gutenberg:3176` | false standalone part |
| The Master of Ballantrae: A Winter's Tale | `6764c9d7-b435-4ba7-ba7d-964681294d18` | `gutenberg:864` | false standalone part |
| The Ocean Waifs: A Story of Adventure on Land and Sea | `43b1f1a5-233c-4b3b-bc11-73815690a9a9` | `gutenberg:27982` | false standalone part |
| The Quadroon: Adventures in the Far West | `ccbf57ad-d6fd-436b-b0c5-942506431688` | `gutenberg:27913` | all false parts |
| Twice-Told Tales | `0a61a2e9-756b-4142-b122-e127239d6ad4` | `gutenberg:508` | all false parts |
| Wacousta : a tale of the Pontiac conspiracy (Complete) | `e4e9e503-645c-4296-9c09-7b9c536f2e1f` | `gutenberg:4912` | false part inside genuine volumes |

## Additional bibliographic metadata fixes

6 original publication years were verified with two independent bibliographic references recorded in `qa_20261111_unverified_publication_year_backups`: *Adam Bede* (1859), *Kenilworth* (1821), *Little Men* (1871), *Silas Marner* (1861), *The Mysteries of Udolpho* (1794), and *The King of the Golden River* (**1850 actual first release**, despite an 1851 title-page imprint). The last correction follows scholarly date evidence from Lancaster University and the University of Rochester.

## Outstanding acceptance and safe rollout rules

- **Every one of these 44 books still requires live reader and physical-device acceptance**, checking first/middle/last chapter navigation, correct source-to-TOC mapping, no bogus divisions, RTL/multilingual safety and text completeness where applicable. A database repair is not device acceptance.
- Of the 43 newly repaired false-part books, **5 also remain open in the separate source-review register**; this repair is not proof that the whole Gutenberg text is complete. The original 41 pending visual-acceptance records include *Emma*.
- SQL recheck after these writes: **653 unresolved first-print dates**, **59 original source/chapter candidates**, **41 original browser acceptance records**, and **0 remaining obvious false parts**. The original cover backlog was **672** and must be re-counted before claiming closure. These numbers overlap and must not be added indiscriminately.
- Gutenberg importer stays disabled (target 10,000, batch size 100) until editions, source/rights, chapter integrity, covers and reader acceptance gates are satisfied.
- No publication states should be changed merely to hide QA findings. Current published count increased from 888 to 889 during this session due to a separate concurrent change; the guarded navigation transactions did not change publication status.
- Only restore nodes from `qa_20261111_structure_repair_backups.original_nodes` with explicit book UUID, source version and a new current-state backup; never blindly replay all previous database writes.

## Recommended acceptance checks

1. For each listed title, open its live reader on desktop and an actual mobile browser, then compare the reader TOC against that book's specific original Gutenberg edition.
2. Verify that no original chapters were deleted, all links land on the intended chapter, and the first and last chapters are accessible.
3. Only then close the separate navigation-acceptance record. Keep other independent structure/source review findings open until source comparison passes.
4. Re-run catalogue QA, sitemap checks and GitHub CI. Confirm exact Cloudflare deployed commit provenance before claiming production acceptance.
