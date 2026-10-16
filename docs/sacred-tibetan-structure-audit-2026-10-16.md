# Tibetan Derge source work-boundary audit — 16 October 2026

## Evidence and exact revisions

Two pinned official Esukhia GitHub archives have been downloaded onto the authorized Windows PC at `C:\Temp\seeparah-tibetan-pinned\`:

- Derge Kangyur pinned revision `a582cf471b7c85a101035071078032f106a8e536`: `derge-kangyur-a582cf47.zip`
- Derge Tengyur pinned revision `174653137d62af481f53c6ae3dc842bf8629323e`: `derge-tengyur-17465313.zip`

All 316 original text files in the retrieved revisions have **byte-for-byte-identical SHA-256 content** to the acquired October 12 packages, verified using an ordered UTF-8 filename + NUL + binary per-file SHA-256 rollup:

| Corpus | Original text files | Source rollup SHA-256 |
|---|---:|---|
| Kangyur | 103 | `8d1cc9afe32095344afd8240dfb772fa17ab0cbcba2a89dd3b7da7e4a5af84ca` |
| Tengyur | 213 | `14af177bb47e21030b70b89b2ca6e8e0d3280dbe348bbd2b6ea9f2e32c3fcfce` |

### Reproducible, byte-preserving index

Run the checked-in script (requires Python stdlib only):

```powershell
python scripts/sacred_tibetan_work_boundary_audit.py `
  --kangyur C:\Temp\seeparah-tibetan-pinned\derge-kangyur-a582cf47.zip `
  --tengyur C:\Temp\seeparah-tibetan-pinned\derge-tengyur-17465313.zip `
  --output C:\Temp\Seeparah_Tibetan_Structure_Indexed_2026-10-16
```

The program fails closed if any source-file content does not match the acquired snapshot fingerprint, records candidate work-marker byte ranges and preserves the **exact original UTF-8 bytes** of every volume by concatenation of the reported slices. It does not normalize NFD, strip editorial variants, modify a scripture passage or publish to Supabase.

| Audit finding | Kangyur | Tengyur |
|---|---:|---:|
| Source volumes | 103 | 213 |
| Source text bytes | 300,157,458 | 617,471,152 |
| Detected `{D...}` Tohoku-marker occurrences | 1,208 | 3,363 |
| Distinct marker identifiers | 1,200 | 3,363 |
| Volumes with no work-start marker | 26 | 28 |
| Volumes with an unmarked leading span | 37 | 43 |
| Repeated candidate IDs | 8 | 0 |
| Exact byte reassembly | Pass, every volume | Pass, every volume |

The eight repeated Kangyur identifiers (`D538`, `D539` and `D539a` through `D539f`) appear in index/catalogue contexts and must **not** be automatically collapsed or treated as duplicate scripture passages. Work text can span volumes without a marker at the start of every volume. The final `དཀར་ཆག` files are catalogue materials, not necessarily continuation of the preceding scripture work.

## Publication gates remaining

The audit **does not** certify that the 4,571 detected marker occurrences are 4,571 complete works. Before an authoritative reader import: resolve exact work boundary continuations across volumes and commentary/catalogue indexes; map verified Tohoku work identifiers and titles; retain source folio/line metadata, editorial suggestions and the pinned NFD source spelling; compare end-to-end source slices and reader navigation; label edition coverage accurately. Only then publish eligible volumes/works in the existing reader. The public source-holdings page must continue to show these two collections as structure-pending.

## Existing production state

- Cloudflare production stays unchanged.
- Supabase books, publication flags, reader texts, rights flags and user data were not modified.
- All four remaining Genesis Hebrew / Matthew Greek live browser checks pass on desktop and mobile.
- The original 42 sacred covers and existing mappings remain unchanged.

## Persisted operator outputs

- Source archives: `C:\Temp\seeparah-tibetan-pinned\`
- Index: `C:\Temp\Seeparah_Tibetan_Structure_Indexed_2026-10-16\`
- Check script: `C:\Temp\seeparah_compare_tibetan_snapshot.py`
- Full packaged reproducible index also stored in ChatGPT Library `/Seeparah/Seeparah_Tibetan_Structure_Audit_2026-10-16.zip`
