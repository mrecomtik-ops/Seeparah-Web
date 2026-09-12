-- Adds an editable note field to highlights so a highlighted passage can
-- carry a reader's own note, and a soft "removed" concept isn't needed —
-- removal is a real delete, matching the existing addHighlight/RLS model.
-- Additive and backward compatible: existing rows get note = null.
alter table public.book_highlights
  add column if not exists note text;
