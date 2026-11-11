-- Applied to Seeparah production 2026-11-11: QA-001 private rollback evidence.
-- Reconciles stored numeric publication years with explicit unverified notices.
-- No source manuscript, translation, publisher, user reading data, or rights gate changed.
CREATE TABLE IF NOT EXISTS public.qa_20261111_unverified_publication_year_backups (
  book_id uuid PRIMARY KEY REFERENCES public.books(id),
  old_original_publication_year integer NOT NULL,
  source_scan_id text NOT NULL,
  reason text NOT NULL DEFAULT 'Published description explicitly states first-publication date is unverified',
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.qa_20261111_unverified_publication_year_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.qa_20261111_unverified_publication_year_backups FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.qa_20261111_unverified_publication_year_backups IS 'QA-001: private rollback of uncorroborated Gutenberg publication-year metadata; sources remain untouched.';
