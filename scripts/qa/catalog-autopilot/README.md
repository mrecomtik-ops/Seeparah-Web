# Seeparah automated catalogue QA — secretless GitHub pipeline

**Active workflow:** [Seeparah catalogue QA autopilot](https://github.com/mrecomtik-ops/Seeparah-Web/actions/workflows/catalog-qa-autopilot.yml).

Every day at 03:15 UTC (07:15 Dubai), on relevant `main` commits, or on manual dispatch, GitHub Actions:

1. Runs the existing source-integrity synthetic tests and the audit regression suite.
2. Reads `https://seeparah.com/api/catalog-qa-public.json` over HTTPS. The **Cloudflare Worker**, not GitHub, uses the Supabase service-role credential already present in its server environment. The endpoint responds with an explicit allowlist of *published* book metadata, the matching chapter QA statuses, book IDs in the unverified-year cohort, and importer pause/target settings. It does **not** expose account identifiers, private manuscripts, rights dossiers, source text, old incorrect years, QA evidence notes, or keys. The endpoint is GET-only and cached.
3. Independently checks the public sitemap index and its static, first-book, and last-book partitions.
4. Writes `summary.md`, `summary.json`, and four CSV queues: `source-review.csv`, `reader-acceptance.csv`, `historical-years.csv`, `cover-replacements.csv`, archived in the GitHub Actions run for 30 days. The action writes one rolling [backlog issue](https://github.com/mrecomtik-ops/Seeparah-Web/issues/185), avoiding duplicate daily issue spam.
5. Fails visibly if the importer runs while historical/structural/visual reviews are outstanding, fake year 1800/1656 reappears, any expected published book vanishes from the backed-up bibliographic cohort, or the trusted production endpoint is down.

**No GitHub Actions secrets or user-managed setup is required for the recurring published-book audit.** Unlike the earlier version, this deployment does not transfer a privileged database key into GitHub. The existing private full-manuscript audit and admin operations remain protected by their normal Supabase authorization.

## Run from GitHub

Open [the workflow](https://github.com/mrecomtik-ops/Seeparah-Web/actions/workflows/catalog-qa-autopilot.yml), choose **Run workflow**, select `main`, and set a `batch_size` from 1–100 (default 25). View the run's Summary and download the `seeparah-catalog-qa` artifact. The daily scan does not require a laptop to stay open.

## Run locally without credentials

```bash
npm ci
node --test scripts/qa/production-catalog-audit.selftest.mjs
node scripts/catalog-integrity/selftest.mjs
node scripts/qa/production-catalog-audit.mjs \
  --public-url https://seeparah.com/api/catalog-qa-public.json \
  --require-data --batch-size 25 --out audit-out/catalog-qa
```

## Explicit limits

- The ongoing scan checks catalogue consistency and review status, **not** the complete original EPUB/TXT bytes. For a source-verbatim comparison, use `scripts/catalog-integrity/validate.mjs` against the verified original corpus, with separately authorized private read access.
- A printed chapter list cannot prove that chapter prose exists; a source structure repair needs the original exact text, backup, CI and reader acceptance. Do not invent missing text.
- First-publication year corrections require two independent bibliographic records. Never substitute the Gutenberg archive upload date.
- Higher-resolution cover artwork must be legitimate for the exact edition, not guessed or AI substituted.
- Reader/device acceptance, high-volume performance, and external rights assessments cannot be auto-closed by checking database metadata.
- The Gutenberg importer remains paused until original-source, historical-year, rights, chapters, reader visual, and 10,000-book performance gates are satisfied.
- No secrets, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, unrelated books, or user data are changed by this pipeline.
