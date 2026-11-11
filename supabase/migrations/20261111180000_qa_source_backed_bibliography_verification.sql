-- Record independent historical bibliography evidence without overwriting
-- original QA backup values. No public SELECT grants and no book publications.
ALTER TABLE public.qa_20261111_unverified_publication_year_backups
  ADD COLUMN verified_year integer,
  ADD COLUMN verification_sources jsonb,
  ADD COLUMN verification_note text,
  ADD COLUMN verified_at timestamptz;
ALTER TABLE public.qa_20261111_unverified_publication_year_backups
  ADD CONSTRAINT qa_year_evidence_complete CHECK (
    (verified_year IS NULL AND verification_sources IS NULL AND verification_note IS NULL AND verified_at IS NULL)
    OR
    (verified_year BETWEEN 1400 AND 2026
      AND jsonb_typeof(verification_sources) = 'array'
      AND jsonb_array_length(verification_sources) >= 2
      AND nullif(btrim(verification_note), '') IS NOT NULL
      AND verified_at IS NOT NULL)
  );
ALTER TABLE public.qa_20261111_unverified_publication_year_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.qa_20261111_unverified_publication_year_backups FROM anon, authenticated;
COMMENT ON COLUMN public.qa_20261111_unverified_publication_year_backups.verification_sources
  IS 'Private editor-verifiable source links for independently checked first work publication date; never reader-uploaded values.';
