-- Optional artwork attribution belongs to the source-edition/language record,
-- not a global book field. Existing metadata and all source text stay unchanged.
ALTER TABLE public.book_editions
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS cover_attribution text,
  ADD COLUMN IF NOT EXISTS cover_shared_artwork boolean NOT NULL DEFAULT false;

ALTER TABLE public.book_editions
  ADD CONSTRAINT book_editions_cover_attribution_required
    CHECK (cover_url IS NULL OR length(btrim(coalesce(cover_attribution, ''))) >= 3);

-- Existing MFA-gated, service-role admin functions own these writes.
-- No direct browser/anonymous editing of artwork or edition metadata.
REVOKE UPDATE (cover_url,cover_attribution,cover_shared_artwork)
  ON public.book_editions FROM anon, authenticated;
