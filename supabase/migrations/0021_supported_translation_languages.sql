-- Seeparah — supported major translation languages.
-- Forward-only migration after 0020.
--
-- The reader request endpoint already validates this allowlist in code.
-- These DB constraints are the second-layer backstop so a signed-in client
-- cannot bypass the server and insert arbitrary target-language names via
-- direct REST access.

begin;

alter table public.translation_requests
  drop constraint if exists translation_requests_language_supported;

alter table public.translation_requests
  add constraint translation_requests_language_supported
  check (language in ('English', 'Urdu', 'Hindi', 'Arabic', 'Chinese', 'Spanish', 'French', 'German', 'Russian', 'Portuguese', 'Bengali', 'Japanese', 'Korean', 'Indonesian', 'Turkish', 'Persian', 'Punjabi', 'Italian', 'Dutch', 'Polish', 'Ukrainian', 'Vietnamese', 'Thai', 'Swahili', 'Pashto', 'Malay', 'Hebrew', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Filipino'));

alter table public.book_translation_jobs
  drop constraint if exists book_translation_jobs_language_supported;

alter table public.book_translation_jobs
  add constraint book_translation_jobs_language_supported
  check (language in ('English', 'Urdu', 'Hindi', 'Arabic', 'Chinese', 'Spanish', 'French', 'German', 'Russian', 'Portuguese', 'Bengali', 'Japanese', 'Korean', 'Indonesian', 'Turkish', 'Persian', 'Punjabi', 'Italian', 'Dutch', 'Polish', 'Ukrainian', 'Vietnamese', 'Thai', 'Swahili', 'Pashto', 'Malay', 'Hebrew', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Filipino'));

comment on constraint translation_requests_language_supported on public.translation_requests is
  'Reader-requested target language must be one of Seeparah supported major translation languages.';

comment on constraint book_translation_jobs_language_supported on public.book_translation_jobs is
  'Translation production jobs may target only Seeparah supported major translation languages.';

commit;
