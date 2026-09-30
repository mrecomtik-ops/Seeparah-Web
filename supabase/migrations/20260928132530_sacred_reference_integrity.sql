-- Sacred Text reference integrity.
--
-- 1) Religious books cannot publish without canonical reference metadata for
--    the original source edition.
-- 2) Removing the final canonical reference from a live Religious book
--    automatically takes it down.
-- 3) Verified sourced translations inherit the reviewed canonical reference
--    map atomically when their aligned text is imported.
--
-- Forward-only migration after 0036.

begin;

create or replace function public.check_book_publish_gate()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    if new.rights_status <> 'approved' then
      raise exception 'Cannot publish: rights review is not approved';
    end if;

    if new.edition_review_status <> 'approved' then
      raise exception 'Cannot publish: edition quality review is not approved';
    end if;

    if new.structure_review_status <> 'approved' then
      raise exception 'Cannot publish: book structure review is not approved';
    end if;

    if new.cleanup_review_status <> 'approved' then
      raise exception 'Cannot publish: text cleanup review is not approved';
    end if;

    if new.rights_basis is null
       or length(btrim(new.rights_basis)) < 20
       or new.rights_basis ~* '\m(pending|do[[:space:]]+not[[:space:]]+approve|not[[:space:]]+verified|awaiting[[:space:]]+rights|rights[[:space:]]+unknown)\M'
    then
      raise exception 'Cannot publish: rights basis is unresolved or looks like placeholder/review text';
    end if;

    if new.rights_evidence_url is null
       or new.rights_evidence_url !~* '^https?://'
    then
      raise exception 'Cannot publish: a valid rights evidence URL is required';
    end if;

    if new.edition_title is null or btrim(new.edition_title) = '' then
      raise exception 'Cannot publish: edition title is required';
    end if;

    if new.edition_year is null then
      raise exception 'Cannot publish: edition year is required';
    end if;

    if new.publisher is null or btrim(new.publisher) = '' then
      raise exception 'Cannot publish: publisher is required';
    end if;

    if (new.isbn is null or btrim(new.isbn) = '')
       and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
    then
      raise exception 'Cannot publish: ISBN or source edition ID is required';
    end if;

    if new.original_publication_year is null then
      raise exception 'Cannot publish: original publication year is required';
    end if;

    if new.word_count is null or new.word_count <= 0 then
      raise exception 'Cannot publish: word count must be calculated';
    end if;

    if new.estimated_reading_minutes is null or new.estimated_reading_minutes <= 0 then
      raise exception 'Cannot publish: estimated reading time must be calculated';
    end if;

    if new.content_classification = 'religious' then
      if new.source_url is null or new.source_url !~* '^https?://' then
        raise exception 'Cannot publish Religious book: a valid reader-visible authentic source URL is required';
      end if;

      if (new.source_edition_id is null or btrim(new.source_edition_id) = '')
         and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
      then
        raise exception 'Cannot publish Religious book: an authentic source edition identifier is required';
      end if;

      if not exists (
        select 1
        from public.book_structure_nodes n
        where n.book_id = new.id
          and n.language = new.source_language
          and n.source_version = new.source_version
          and nullif(btrim(coalesce(n.metadata->>'canonical_ref','')), '') is not null
      ) then
        raise exception 'Cannot publish Religious book: canonical reference structure has not been imported';
      end if;
    end if;

    if public.book_has_rights_risk_signal(new.id)
       and new.rights_risk_acknowledged_at is null
    then
      raise exception 'Cannot publish: manuscript rights-risk clues have not been reviewed and acknowledged';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.auto_unpublish_invalid_published_book()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.status='published' and new.status='published' then
    if new.rights_status <> 'approved'
       or new.edition_review_status <> 'approved'
       or new.structure_review_status <> 'approved'
       or new.cleanup_review_status <> 'approved'
       or new.rights_basis is null
       or length(btrim(new.rights_basis)) < 20
       or new.rights_basis ~* '\m(pending|do[[:space:]]+not[[:space:]]+approve|not[[:space:]]+verified|awaiting[[:space:]]+rights|rights[[:space:]]+unknown)\M'
       or new.rights_evidence_url is null
       or new.rights_evidence_url !~* '^https?://'
       or new.edition_title is null
       or btrim(new.edition_title) = ''
       or new.edition_year is null
       or new.publisher is null
       or btrim(new.publisher) = ''
       or (
         (new.isbn is null or btrim(new.isbn) = '')
         and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
       )
       or new.original_publication_year is null
       or new.word_count is null
       or new.word_count <= 0
       or new.estimated_reading_minutes is null
       or new.estimated_reading_minutes <= 0
       or (
         new.content_classification = 'religious'
         and (
           new.source_url is null
           or new.source_url !~* '^https?://'
           or (
             (new.source_edition_id is null or btrim(new.source_edition_id) = '')
             and (new.source_scan_id is null or btrim(new.source_scan_id) = '')
           )
           or not exists (
             select 1
             from public.book_structure_nodes n
             where n.book_id = new.id
               and n.language = new.source_language
               and n.source_version = new.source_version
               and nullif(btrim(coalesce(n.metadata->>'canonical_ref','')), '') is not null
           )
         )
       )
       or (
         public.book_has_rights_risk_signal(new.id)
         and new.rights_risk_acknowledged_at is null
       )
    then
      new.status := 'unpublished';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.unpublish_religious_book_if_reference_structure_removed()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_book_id uuid;
  v_book public.books%rowtype;
begin
  v_book_id := coalesce(old.book_id, new.book_id);

  select *
  into v_book
  from public.books
  where id = v_book_id;

  if not found
     or v_book.status <> 'published'
     or v_book.content_classification <> 'religious'
  then
    return coalesce(new, old);
  end if;

  if not exists (
    select 1
    from public.book_structure_nodes n
    where n.book_id = v_book.id
      and n.language = v_book.source_language
      and n.source_version = v_book.source_version
      and nullif(btrim(coalesce(n.metadata->>'canonical_ref','')), '') is not null
  ) then
    update public.books
    set status = 'unpublished'
    where id = v_book.id
      and status = 'published';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.unpublish_religious_book_if_reference_structure_removed()
  from public, anon, authenticated, service_role;

drop trigger if exists book_structure_nodes_protect_religious_publication
  on public.book_structure_nodes;

create trigger book_structure_nodes_protect_religious_publication
  after delete or update of book_id, language, source_version, metadata
  on public.book_structure_nodes
  for each row
  execute function public.unpublish_religious_book_if_reference_structure_removed();

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

  v_language_supported := p_language = any(array[
    'English','Urdu','Hindi','Arabic','Chinese','Spanish','French','German','Russian',
    'Portuguese','Bengali','Japanese','Korean','Indonesian','Turkish','Persian',
    'Punjabi','Italian','Dutch','Polish','Ukrainian','Vietnamese','Thai','Swahili',
    'Pashto','Malay','Hebrew','Tamil','Telugu','Marathi','Gujarati','Filipino'
  ]::text[]);
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

  if not exists (
    select 1
    from public.book_structure_nodes n
    where n.book_id = p_book_id
      and n.language = v_book.source_language
      and n.source_version = v_book.source_version
      and nullif(btrim(coalesce(n.metadata->>'canonical_ref','')), '') is not null
  ) then
    raise exception 'Original Religious edition has no reviewed canonical reference map';
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

  if exists (
    select 1 from public.book_structure_nodes
    where book_id=p_book_id and language=p_language and source_version=v_book.source_version
  ) then
    raise exception '% reference-structure rows already exist for the current source version', p_language;
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

  insert into public.book_structure_nodes(
    book_id,
    language,
    source_version,
    node_key,
    parent_node_key,
    node_type,
    title,
    ordinal,
    depth,
    start_chunk_index,
    end_chunk_index,
    metadata
  )
  select
    p_book_id,
    p_language,
    v_book.source_version,
    n.node_key,
    n.parent_node_key,
    n.node_type,
    n.title,
    n.ordinal,
    n.depth,
    n.start_chunk_index,
    n.end_chunk_index,
    n.metadata
  from public.book_structure_nodes n
  where n.book_id = p_book_id
    and n.language = v_book.source_language
    and n.source_version = v_book.source_version
  order by n.ordinal;

  update public.books
  set available_languages=(
    select array_agg(distinct x order by x)
    from unnest(coalesce(available_languages,array[]::text[]) || array[p_language]) as x
  )
  where id=p_book_id;

  return v_count;
end;
$$;

commit;
