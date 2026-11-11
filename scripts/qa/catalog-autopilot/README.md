# Seeparah GitHub catalogue QA autopilot

**Purpose:** Run the remaining QA review as a repeatable, evidence-driven workflow without losing source text, rights provenance, user data, or publication safeguards.

## What happens automatically

GitHub Actions workflow [`.github/workflows/catalog-qa-autopilot.yml`](../../.github/workflows/catalog-qa-autopilot.yml) runs every day at **03:15 UTC / 07:15 Dubai**, after relevant changes to `main`, or when triggered manually. It:

1. Runs the existing source-versus-reader **synthetic integrity self-tests** and the new six read-only audit tests. Note that the complete corpus-vs-production validator requires the actual original EPUB/TXT packages, which are **not** bundled in GitHub Actions. Self-tests do not prove all books complete.
2. Reads only the existing published book metadata, private QA status register, backed-up unverified publication-year IDs, and Gutenberg importer settings from Supabase. Uses **HTTP GET only**; no RPC, INSERT, UPDATE, DELETE, or publication actions.
3. Fetches the **public** sitemap index, static sitemap, first book partition and last book partition to catch deployment/SEO regressions. The smoke test is independent of Supabase credentials.
4. Produces a downloadable `summary.md`, `summary.json` and four separate CSV queues (`source-review.csv`, `reader-acceptance.csv`, `historical-years.csv`, `cover-replacements.csv`). Each queue contains **up to 25 prioritized items** by default (configurable 1–100). It reports full backlog counts, not just the sampled rows.
5. Updates **one** rolling GitHub Issue (`Seeparah catalogue QA — rolling review backlog`) so all work can be tracked in one place, rather than generating daily issue spam.
6. Fails with an explicit safety alert if the importer is enabled while historical, structure or visual reviews are outstanding, if suspect year 1800/1656 returns to published Gutenberg metadata, or if the known backup-year cohort has unexpected unpublished records.

**No auto-publication, rights approval, historical date fabrication, chapter rewriting, cover replacement, or restart of the Gutenberg importer is performed.** Source review and editorial rights decisions require corroborating evidence and approval before any production write.

## One-time GitHub connection (needed for the private QA report)

Open `mrecomtik-ops/Seeparah-Web` → **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | The **Seeparah** Supabase project URL (not Ecomtik or Trade) |
| `SUPABASE_SERVICE_ROLE_KEY` | The Seeparah server-side service-role credential, in a **GitHub Actions secret only** |

The service-role key has extensive database privileges even though this checked-in script is restricted to GET. Only repository administrators should have access; do not put it in a public issue, commit, pull request, message or client-side `VITE_*` variable. For a stronger long-term architecture, replace it with a narrowly scoped read-only API credential. The workflow runs the production-report job only on `main`, scheduled runs, or manually — **never on an untrusted pull request**.

If secrets are absent, the workflow still runs its offline QA checks and writes an explanatory artifact, but the private production report **fails visibly** rather than pretending the entire catalogue has been checked.

## Run it

1. Visit **GitHub → Seeparah-Web → Actions → Seeparah catalogue QA autopilot (read-only)**.
2. Choose **Run workflow** on `main`, set `batch_size` to `25` (or `50` / `100`), and run.
3. Open the run's **Summary** and download its **seeparah-catalog-qa** artifact. The rolling issue will also be refreshed when the scan succeeds.
4. Work from the source-review and historical-year evidence queues; compare the **exact original edition** and independent bibliographic sources before proposing a correction.
5. For each approved correction: create source/evidence record → confirm edition/rights → snapshot rollback → make a small PR/migration → run CI and browser tests → deploy Cloudflare → mark that QA item resolved **only after acceptance**.

## Offline tests / local read-only audit

```bash
node --test scripts/qa/production-catalog-audit.test.mjs
node scripts/catalog-integrity/selftest.mjs  # after npm ci

# Optional manual read-only production audit (do not commit .env credentials)
export SUPABASE_URL='https://<your-seeparah-project>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='<secret>'
node scripts/qa/production-catalog-audit.mjs --require-db --batch-size 25 --out audit-out/catalog-qa
```

This automation complements the existing corpus validator in [`scripts/catalog-integrity/`](../../scripts/catalog-integrity/); it does **not** replace full byte-level comparison with upstream Gutenberg/other sources or real mobile/desktop browser acceptance.

## Important operational rules

- Keep Gutenberg autopilot **paused** until the remaining integrity queues are cleared and source, edition and rights gates are independently verified.
- Never use Gutenberg catalogue `Issued` as the work's *first publication* year; require at least **two corroborating bibliographic references**.
- Never fill missing chapters with model-generated prose or accept a printed contents list as proof that the actual chapter text is present.
- Never replace original edition covers without authentic high-resolution artwork and verified usage rights.
- Preserve both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` on Cloudflare and all unrelated secrets. This pipeline does not change Workers configuration.
- This workflow is for **audit and triage**, not a substitute for 10,000-book performance and physical-device QA.