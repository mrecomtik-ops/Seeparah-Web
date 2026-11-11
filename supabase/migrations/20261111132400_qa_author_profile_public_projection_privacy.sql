-- QA-031 public author-account privacy.
-- Existing /author/:authorId is now served via getPublicAuthorProfile:
-- only existing published-book authors, pen_name/bio/avatar_url response.
-- Editor's owner-profile settings retain access to their own record.
-- No user accounts, author data, or books are modified by this migration.
BEGIN;
ALTER TABLE public.author_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.author_profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.author_profiles FROM authenticated;
GRANT SELECT(user_id,pen_name,bio,avatar_url) ON public.author_profiles TO authenticated;
GRANT INSERT(user_id,pen_name,bio,avatar_url,updated_at) ON public.author_profiles TO authenticated;
GRANT UPDATE(pen_name,bio,avatar_url,updated_at) ON public.author_profiles TO authenticated;
DROP POLICY IF EXISTS author_profiles_public_read ON public.author_profiles;
DROP POLICY IF EXISTS author_profiles_owner_read ON public.author_profiles;
CREATE POLICY author_profiles_owner_read ON public.author_profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
-- Other pre-existing INSERT/UPDATE owner-check policies stay unchanged.
COMMIT;
