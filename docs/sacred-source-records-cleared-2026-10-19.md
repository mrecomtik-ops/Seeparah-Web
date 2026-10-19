# Seeparah original sacred-source record resolution — 19 October 2026

## Exact registry records published

1. Confucian Analects English, Project Gutenberg #3330
- Edition key: gutenberg:analects:3330
- Published as a separate English edition of existing bilingual Analects reader, book 898fc232-957e-52e6-8339-01a38c2a9da8.
- Original source: https://www.gutenberg.org/cache/epub/3330/pg3330.txt
- Source SHA-256: a42433a069290280b52f13cd5832a74aa6ecd6cd4e881fa572ccb34e92e5807a
- Twenty original book divisions, 519 source display sections, 539 structure nodes, ordered text MD5 97019aafde852f0692274a0eb943ef25.
- Underlying English translation is James Legge's nineteenth-century work (he died 1897); the old text is public domain on age-of-author basis. Project Gutenberg legal/trademark boilerplate is omitted, with origin and translator retained.

2. Bhagavad Gita English, Sir Edwin Arnold, Project Gutenberg #2388
- Edition key: gutenberg:gita:2388
- Published as separately attributed English edition alongside Sanskrit original Gita, book e0c836a6-6d04-5914-9196-aeb9871776e9.
- Source: https://www.gutenberg.org/cache/epub/2388/pg2388.txt
- SHA-256: 85b22401a9d256179f9a2e407215eb516da9b8213f23c32e03d66709d839a9e0
- Eighteen source chapters, 313 poem/stanza display sections, 331 structure nodes, ordered text MD5 42e7b2eec6bb31badefa790592d302d2.
- Sir Edwin Arnold's poetic rendering published 1885 (he died 1904) is public domain on age-of-author basis. Never present it as a literal Sanskrit verse-by-verse alignment.

3. Li Ji / Book of Rites — original Chinese, Project Gutenberg #24048
- Edition key: gutenberg:liji:24048
- New original Chinese reader, book 85eb2806-8964-5fb7-9236-0f8ac79a4ca2.
- Source: https://www.gutenberg.org/cache/epub/24048/pg24048.txt
- SHA-256: fc429a7ff0d780c115f6d28c010e783805dbd60746f26d7a3b84da691bb247fb
- Forty-nine original Chinese sections, 652 text sections, 701 structural nodes, ordered text MD5 c9bbbcaec4f92d82b008ad197c641db0.
- Original Chinese ancient anonymous work. No translation generated, no emendations, no critical manuscript/facsimile claim.
- Source has 98,010 Han characters; the platform word_count field uses this as a character-based proxy, not actual Chinese lexical words.
- Draft import initially failed the quality-review publication gate. Detailed technical source QA and explicit review approvals were recorded after the full checks, then the gate passed.

## Technical acceptance
- All three raw publisher source files are pinned by original SHA-256 and tracked as source edition files.
- Exact source chapter and paragraph segmentation and full ordered database-content MD5 verified in Supabase before public language/record status change.
- No generated translations or cross-edition scripture mixing.
- Production mobile Chrome checks: the initial source passages appeared on all three direct reader routes without an error.
- Script files in this repo: scripts/prepare_legge_analects_pg3330.py; scripts/prepare_arnold_gita_pg2388.py; scripts/prepare_liji_pg24048.py. They regenerate gated SQL, not credentials.
- Local original source bytes and generated import SQL are retained under C:/Temp, not added to GitHub.
- Existing unrelated religious books, user data and Cloudflare environment variable configuration unchanged.

## Remaining boundary
Original blocked source records reduced from 32 to 29. Modern publisher-controlled PDFs, non-commercial/no-derivatives releases, unverifiable scan transcriptions, official links requiring permission and Tibetan canonical work boundaries are not considered cleared. A separately sourced alternative does not grant redistribution rights to the original blocked edition.
