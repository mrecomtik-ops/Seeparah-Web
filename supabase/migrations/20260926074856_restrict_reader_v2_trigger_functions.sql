-- Restrict Reader V2 publication-gate helper/trigger functions.
-- Forward-only security hardening after 0018.

begin;

revoke all on function public.book_has_rights_risk_signal(uuid) from public;
revoke all on function public.book_has_rights_risk_signal(uuid) from anon;
revoke all on function public.book_has_rights_risk_signal(uuid) from authenticated;
grant execute on function public.book_has_rights_risk_signal(uuid) to service_role;

revoke all on function public.check_book_publish_gate() from public;
revoke all on function public.check_book_publish_gate() from anon;
revoke all on function public.check_book_publish_gate() from authenticated;

revoke all on function public.invalidate_book_reviews_on_source_chunk_change() from public;
revoke all on function public.invalidate_book_reviews_on_source_chunk_change() from anon;
revoke all on function public.invalidate_book_reviews_on_source_chunk_change() from authenticated;

commit;
