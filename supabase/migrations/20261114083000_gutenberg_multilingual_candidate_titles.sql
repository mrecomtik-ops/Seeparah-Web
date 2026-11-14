-- Preserve authentic one- and two-character source titles in every language.
-- Candidate validation only: does not alter rights or publication checks.
ALTER TABLE public.gutenberg_catalog_candidates
  DROP CONSTRAINT gutenberg_catalog_candidates_title_check;
ALTER TABLE public.gutenberg_catalog_candidates
  ADD CONSTRAINT gutenberg_catalog_candidates_title_check
  CHECK (char_length(title) BETWEEN 1 AND 300);
