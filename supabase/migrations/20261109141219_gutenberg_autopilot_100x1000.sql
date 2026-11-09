-- Gutenberg Autopilot: 100-book self-refilling batches, stop at 1,000
-- ACTUALLY PUBLISHED books in the Seeparah production catalog.
-- Existing user data / source text / edition review records are untouched.
create table if not exists public.gutenberg_autopilot_settings (
  id smallint primary key check (id = 1),
  enabled boolean not null default true,
  target_published integer not null default 1000 check (target_published between 100 and 10000),
  batch_size integer not null default 100 check (batch_size between 1 and 100),
  last_batch_number integer not null default 0,
  catalog_offset integer not null default 0 check (catalog_offset >= 0),
  catalog_checked_at timestamptz,
  catalog_loaded_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.gutenberg_autopilot_settings enable row level security;
revoke all on public.gutenberg_autopilot_settings from public,anon,authenticated;
grant select,insert,update on public.gutenberg_autopilot_settings to service_role;

insert into public.gutenberg_autopilot_settings(id,enabled,target_published,batch_size)
values (1,true,1000,100)
on conflict(id) do nothing;

create table if not exists public.gutenberg_catalog_candidates (
 gutenberg_id integer primary key check (gutenberg_id between 1 and 9999999),
 title text not null check (length(title) between 3 and 250),
 author text not null check (length(author) between 3 and 200),
 author_death_year integer not null check (author_death_year between 1400 and 1900),
 original_publication_year integer check (original_publication_year between 1400 and 1900),
 catalog_issued date,
 subjects text,
 priority smallint not null default 3,
 catalog_url text not null default 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv',
 source_checked_at timestamptz not null default now()
);
alter table public.gutenberg_catalog_candidates enable row level security;
revoke all on public.gutenberg_catalog_candidates from public,anon,authenticated;
grant select,insert,update on public.gutenberg_catalog_candidates to service_role;
create index if not exists gutenberg_catalog_candidates_priority_idx
on public.gutenberg_catalog_candidates(priority,gutenberg_id);

-- The official Gutenberg CSV has no original print publication dates.
-- Never substitute its "Issued" (electronic release date) for the first
-- publication date of the original work; require independent validation.
alter table public.gutenberg_import_jobs
  alter column original_publication_year drop not null;

-- This SQL function is private and SECURITY INVOKER. Row lock prevents two
-- overlapping Workers from opening simultaneous batches.
create or replace function public.gutenberg_autopilot_prepare_batch()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cfg public.gutenberg_autopilot_settings%rowtype;
  published_count integer;
  inflight_count integer;
  pool_count integer;
  to_enqueue integer;
  inserted_count integer;
  batch_number integer;
  batch_key text;
begin
  select * into cfg from public.gutenberg_autopilot_settings where id=1 for update;
  if not found or not cfg.enabled then
    return jsonb_build_object('status','paused');
  end if;
  select count(*) into published_count from public.books where status='published';
  if published_count >= cfg.target_published then
    update public.gutenberg_import_jobs set
      status='skipped',last_error='Stopped: target published catalogue count reached',
      updated_at=now()
    where status='queued' and metadata->>'autopilot'='true';
    update public.gutenberg_autopilot_settings set
      enabled=false,updated_at=now(),last_error=null where id=1;
    return jsonb_build_object('status','complete','published',published_count,'target',cfg.target_published);
  end if;

  select count(*) into inflight_count from public.gutenberg_import_jobs
  where status in ('queued','processing');
  if inflight_count > 0 then
    return jsonb_build_object('status','running','published',published_count,
                              'pending',inflight_count,'batchNumber',cfg.last_batch_number);
  end if;

  select count(*) into pool_count
  from public.gutenberg_catalog_candidates c
  where not exists(select 1 from public.gutenberg_import_jobs j
                   where j.gutenberg_id=c.gutenberg_id)
    and not exists(select 1 from public.books b
        where b.source_scan_id='gutenberg:'||c.gutenberg_id
        or b.source_url='https://www.gutenberg.org/ebooks/'||c.gutenberg_id
        or lower(b.title)=lower(c.title));
  if pool_count = 0 then
    return jsonb_build_object('status','needs_catalog','published',published_count,'target',cfg.target_published);
  end if;

  to_enqueue := least(cfg.batch_size,cfg.target_published-published_count);
  batch_number := cfg.last_batch_number+1;
  batch_key := 'PG-AUTO-'||lpad(batch_number::text,4,'0');

  with eligible as (
    select c.* from public.gutenberg_catalog_candidates c
    where not exists(select 1 from public.gutenberg_import_jobs j
                     where j.gutenberg_id=c.gutenberg_id)
      and not exists(select 1 from public.books b
         where b.source_scan_id='gutenberg:'||c.gutenberg_id
           or b.source_url='https://www.gutenberg.org/ebooks/'||c.gutenberg_id
           or lower(b.title)=lower(c.title))
    order by c.priority,c.gutenberg_id limit to_enqueue
  ), added as (
    insert into public.gutenberg_import_jobs(
      gutenberg_id,original_publication_year,status,metadata
    )
    select e.gutenberg_id,e.original_publication_year,'queued',
      jsonb_build_object(
        'autopilot',true,'batchId',batch_key,'title',e.title,'author',e.author,
        'authorDeathYear',e.author_death_year,
        'originalPublicationYear',e.original_publication_year,
        'metadataSource','Project Gutenberg official weekly CSV',
        'catalogIssued',e.catalog_issued,'catalogUrl',e.catalog_url,
        'subjects',e.subjects,
        'rightsReview','pending independent source and date check'
      )
    from eligible e on conflict (gutenberg_id) do nothing
    returning id
  )
  select count(*) into inserted_count from added;

  if inserted_count=0 then
    return jsonb_build_object('status','needs_catalog','published',published_count,'target',cfg.target_published);
  end if;
  update public.gutenberg_autopilot_settings set
    last_batch_number=batch_number,updated_at=now(),last_error=null where id=1;
  return jsonb_build_object(
    'status','batch_started','batchId',batch_key,'batchNumber',batch_number,
    'queued',inserted_count,'published',published_count,'target',cfg.target_published);
end;
$$;
revoke all on function public.gutenberg_autopilot_prepare_batch() from public,anon,authenticated;
grant execute on function public.gutenberg_autopilot_prepare_batch() to service_role;
