-- Applied to Seeparah production on 2026-11-11; QA-013.
-- Private point-in-time rollback for source descriptions only.
CREATE TABLE IF NOT EXISTS public.qa_20261111_description_backups (
  book_id uuid PRIMARY KEY REFERENCES public.books(id),
  original_description text NOT NULL,
  updated_description text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.qa_20261111_description_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qa_20261111_description_backups FROM PUBLIC, anon, authenticated;
