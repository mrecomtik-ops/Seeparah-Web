# Catalog content-integrity validator (read-only)

Compares every imported Seeparah book in production against its local acquisition
package (`metadata.json`, `structure.json`, source EPUB/TXT). It writes reports to a
local folder and never writes to production.

## Run (on the machine that has the corpus)

```powershell
cd C:\Temp\seeparah-audit-main
npm ci                                   # jszip + happy-dom come from the repo
node scripts/catalog-integrity/selftest.mjs           # 16 synthetic checks, no network
node scripts/catalog-integrity/validate.mjs `
  --corpus "C:\Seeparah-Import\seeparah-1000-books" `
  --env .env `
  --save-snapshot audit-out\prod-snapshot.json `
  --out audit-out
```

`.env` must contain `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The key is used
only for HTTP **GET** against `/rest/v1/books`, `/rest/v1/book_chunks` and
`/rest/v1/book_structure_nodes`. `sbGet()` refuses every other method and all
`/rpc/` paths. No supabase-js client is created.

To run again offline, pass `--snapshot audit-out\prod-snapshot.json` instead of `--env`.

Other options:

- `--only SP-CAND-0075,SP-CAND-0001` checks only the listed books.
- `--published-only` checks only published books.

## Outputs

- `report.md`: totals, the book list for each category, per-book metrics, the
  discrepancy table (Book | local source path | source location | source text |
  production location | production text | defect | affected | severity) and the
  front-matter inventory.
- `discrepancies.csv`: every finding, including the low-severity ones.
- `books.json`: machine-readable per-book summary.

## Checks

| Check | How it is detected |
|---|---|
| Source word-count parity | Body words between the PG START/END markers vs. production words |
| Missing text / absent from production | Every source block (normalised letters and digits) is aligned against the production text |
| Dropped `<div>` text, verse, drama blocks | The missing block is classified by tag and class (`div`, `poem/verse/i\d`, `drama`) |
| Lost speaker cues / stage directions | Same classification (`drama` + short caps → cue; `stage/direction` or parenthesised → stage direction) |
| Lost chapter titles/subtitles | `subhead/subtitle` classes, or a short caps block right after a chapter heading |
| Missing drop-cap letters | `<img alt="X">` (or `.initial/.dropcap`) where the following paragraph starts a production block without X |
| Inserted text | Production block not found in the source |
| Duplicated text | A production block occurs more often than in the source (e.g. repeated Part headings) |
| Duplicate headings | Consecutive navigation nodes with the same title and depth |
| TOC target mismatch / one page early | The node title is not on its target page, but starts the next page |
| Heading stranded at end of chunk | The last block of a non-final page is a source heading, or the nav target heading has fewer than 60 words after it |
| Very small / very large pages | Fewer than 150 words / more than 3,000 words |
| Back matter in body | Transcriber's notes, printer's colophon, "FOOTNOTES:" |
| PG boilerplate in reader content | Project Gutenberg / START/END markers / gutenberg.org |
| Printed TOC rendered as body | At least 3 rows of the source contents table appear in the front pages |
| Captions without illustrations | Source captions or image alt text present as body blocks |
| Nav headings missing from text | Covered by the TOC target check |
| `structure.json` vs production nav | Titles in `structure.json` that are absent from `book_structure_nodes` |

## Categories

Each book gets one category, taken from the first flag that applies in this order:

1. `NEEDS MANUAL REVIEW`: no package, a parse failure, or more than 20% missing (probably a different edition)
2. `TEXT LOSS`
3. `TEXT INSERTION / DUPLICATION`
4. `NAVIGATION DEFECT`
5. `STRUCTURE ISSUE ONLY`
6. `PASS — text integrity`

All flags are listed in `books.json`.

## Production-only scan

`browser-intrinsic-scan.js` runs in a seeparah.com tab through the public reader
endpoints. It needs no source files and finds defects that can be proven from
production text alone: drop-cap fragments, repeated injected headings, nav targets,
stranded headings, printed-contents titles absent from the body, and page-size
outliers.