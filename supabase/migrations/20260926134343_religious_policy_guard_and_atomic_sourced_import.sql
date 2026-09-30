-- Religious policy downgrade guard + atomic sourced-edition import.
-- Forward-only migration after 0026.

begin;

create or replace function public.prevent_religious_policy_downgrade()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.content_classification='religious'
     and new.content_classification is distinct from 'religious'
     and coalesce(current_setting('seeparah.allow_religious_downgrade', true),'') <> 'on'
  then
    raise exception 'Religious classification can only be removed through the explicit owner-only downgrade workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists books_prevent_religious_policy_downgrade on public.books;
create trigger books_prevent_religious_policy_downgrade
  before update of content_classification on public.books
  for each row execute function public.prevent_religious_policy_downgrade();

revoke all on function public.prevent_religious_policy_downgrade() from public, anon, authenticated;

create or replace function public.owner_downgrade_religious_book(
  p_book_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if length(btrim(coalesce(p_reason,''))) < 20 then
    raise exception 'A substantive downgrade reason of at least 20 characters is required';
  end if;

  if exists (
    select 1 from public.book_editions
    where book_id=p_book_id
      and provenance_type in ('human_translation','licensed_translation','public_domain_translation')
  ) then
    raise exception 'Remove or separately resolve verified sourced Religious editions before changing this book to General';
  end if;

  perform set_config('seeparah.allow_religious_downgrade','on',true);

  update public.books
  set
    content_classification='general',
    translation_generation_policy='ai_allowed',
    categories=array_remove(coalesce(categories,array[]::text[]),'Religious'),
    access_type='free'
  where id=p_book_id
    and content_classification='religious';

  if not found then
    raise exception 'Religious book not found or already General';
  end if;
end;
$$;

revoke all on function public.owner_downgrade_religious_book(uuid,text) from public, anon, authenticated;
grant execute on function public.owner_downgrade_religious_book(uuid,text) to service_role;

create or replace function public.import_verified_sourced_edition(
  p_book_id uuid,
  p_language text,
  p_provenance_type text,
  p_typography_profile text,
  p_edition_title text,
  p_translator text,
  p_source_url text,
  p_source_edition_id text,
  p_rights_basis text,
  p_rights_evidence_url text,
  p_authenticity_notes text,
  p_sections text[]
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_book public.books%rowtype;
  v_count integer;
  v_language_supported boolean;
begin
  select * into v_book from public.books where id=p_book_id for update;
  if not found then raise exception 'Book not found'; end if;

  if v_book.content_classification <> 'religious'
     or v_book.translation_generation_policy <> 'source_only'
  then
    raise exception 'Verified sourced-edition import is reserved for Religious/source-only books';
  end if;

  if v_book.status <> 'published' then
    raise exception 'Publish the verified original book before adding sourced translated editions';
  end if;

  if p_language = v_book.source_language then
    raise exception 'The sourced edition language must differ from the original language';
  end if;

  v_language_supported := p_language = any(array['English','Urdu','Hindi','Arabic','Chinese','Spanish','French','German','Russian','Portuguese','Bengali','Japanese','Korean','Indonesian','Turkish','Persian','Punjabi','Italian','Dutch','Polish','Ukrainian','Vietnamese','Thai','Swahili','Pashto','Malay','Hebrew','Tamil','Telugu','Marathi','Gujarati','Filipino']::text[]);
  if not v_language_supported then
    raise exception 'Unsupported Seeparah language: %', p_language;
  end if;

  if p_provenance_type not in ('human_translation','licensed_translation','public_domain_translation') then
    raise exception 'Religious sourced editions cannot use AI-assisted provenance';
  end if;

  if p_typography_profile not in (
    'standard','scripture_arabic','scripture_urdu','scripture_hebrew',
    'scripture_indic','facsimile_preserving'
  ) then
    raise exception 'Unsupported typography profile';
  end if;

  if length(btrim(coalesce(p_rights_basis,''))) < 20 then
    raise exception 'Enter a substantive rights basis for this exact sourced edition';
  end if;
  if coalesce(p_source_url,'') !~* '^https?://' then
    raise exception 'A valid source URL is required';
  end if;
  if coalesce(p_rights_evidence_url,'') !~* '^https?://' then
    raise exception 'A valid rights evidence URL is required';
  end if;

  v_count := coalesce(array_length(p_sections,1),0);
  if v_count <> v_book.total_chunks then
    raise exception 'Sourced edition has % sections; expected %', v_count, v_book.total_chunks;
  end if;

  if exists (
    select 1 from public.book_editions where book_id=p_book_id and language=p_language
  ) then
    raise exception 'A published % edition already exists', p_language;
  end if;

  if exists (
    select 1 from public.book_chunks
    where book_id=p_book_id and language=p_language and source_version=v_book.source_version
  ) then
    raise exception '% content rows already exist for the current source version', p_language;
  end if;

  insert into public.book_chunks(
    book_id,language,chunk_index,content,status,source_version,provider,model,prompt_version,job_id
  )
  select
    p_book_id,
    p_language,
    ordinality::integer - 1,
    section,
    'published',
    v_book.source_version,
    'sourced',
    null,
    null,
    null
  from unnest(p_sections) with ordinality as s(section, ordinality);

  insert into public.book_editions(
    book_id,language,access_type,provenance_type,typography_profile,authenticity_notes,
    edition_title,translator,source_url,source_edition_id,rights_basis,rights_evidence_url
  ) values (
    p_book_id,p_language,'free',p_provenance_type,p_typography_profile,
    nullif(btrim(coalesce(p_authenticity_notes,'')),''),
    nullif(btrim(coalesce(p_edition_title,'')),''),
    nullif(btrim(coalesce(p_translator,'')),''),
    btrim(p_source_url),
    nullif(btrim(coalesce(p_source_edition_id,'')),''),
    btrim(p_rights_basis),
    btrim(p_rights_evidence_url)
  );

  update public.books
  set available_languages=(
    select array_agg(distinct x order by x)
    from unnest(coalesce(available_languages,array[]::text[]) || array[p_language]) as x
  )
  where id=p_book_id;

  return v_count;
end;
$$;

revoke all on function public.import_verified_sourced_edition(
  uuid,text,text,text,text,text,text,text,text,text,text,text[]
) from public, anon, authenticated;
grant execute on function public.import_verified_sourced_edition(
  uuid,text,text,text,text,text,text,text,text,text,text,text[]
) to service_role;

commit;
