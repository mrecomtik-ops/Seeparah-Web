ALTER TABLE public.books ADD COLUMN IF NOT EXISTS genre TEXT NOT NULL DEFAULT 'Literary Fiction';

UPDATE public.books SET genre = 'Classic' WHERE title IN ('Pride and Prejudice');
UPDATE public.books SET genre = 'Adventure' WHERE title IN ('Moby-Dick');
UPDATE public.books SET genre = 'Poetry' WHERE title IN ('The Prophet');
UPDATE public.books SET genre = 'Literary Fiction' WHERE title IN ('The Lantern in the Rain');

CREATE TABLE IF NOT EXISTS public.book_shelves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  shelf TEXT NOT NULL CHECK (shelf IN ('favorite','saved','want_to_read')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id, shelf)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_shelves TO authenticated;
GRANT ALL ON public.book_shelves TO service_role;

ALTER TABLE public.book_shelves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own shelves"
ON public.book_shelves FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_book_shelves_updated_at
BEFORE UPDATE ON public.book_shelves
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();