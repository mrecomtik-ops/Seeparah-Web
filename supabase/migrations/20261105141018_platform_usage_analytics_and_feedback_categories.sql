-- Seeparah privacy-minimized, first-party analytics + feedback categories.
-- Usage events are opt-in only. Never store raw IPs, user IDs, emails, full
-- URLs, search queries or book titles. 180-day retention is enforced at edge.
create table if not exists public.platform_usage_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  visitor_id uuid not null,
  session_id uuid not null,
  country_code text not null default 'ZZ' check (country_code ~ '^[A-Z]{2}$'),
  region text not null default 'Unknown' check (char_length(region) between 1 and 64),
  area text not null check (area in ('home','library','sacred_texts','reader','book','author','research','insights','other'))
);
alter table public.platform_usage_events enable row level security;
revoke all on public.platform_usage_events from public, anon, authenticated;
revoke all on sequence public.platform_usage_events_id_seq from public, anon, authenticated;
grant select, insert, delete on public.platform_usage_events to service_role;
grant usage, select on sequence public.platform_usage_events_id_seq to service_role;
create index if not exists platform_usage_events_time_idx on public.platform_usage_events(occurred_at desc);
create index if not exists platform_usage_events_geography_idx on public.platform_usage_events(country_code,region,occurred_at desc);
create index if not exists platform_usage_events_visitor_idx on public.platform_usage_events(visitor_id,occurred_at desc);
create index if not exists platform_usage_events_session_idx on public.platform_usage_events(session_id,occurred_at desc);

-- Only service_role may call this invoker-security aggregate function.
-- The application checks active admin role + AAL2 before calling it.
create or replace function public.platform_usage_report(p_days integer default 30)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
with visits as (
  select * from public.platform_usage_events
  where occurred_at >= now() - make_interval(days=>greatest(1,least(90,coalesce(p_days,30))))
),
sessions as (
  select visitor_id,session_id,
    bool_or(area='reader') as read_a_book
  from visits group by visitor_id,session_id
),
visitors as (
  select visitor_id,count(*) as session_count from sessions group by visitor_id
),
daily as (
  select (occurred_at at time zone 'UTC')::date as day,
    count(*) as page_views,count(distinct session_id) as session_count,
    count(distinct visitor_id) as visitor_count
  from visits group by 1
),
country_stats as (
  select country_code as country,count(*) as page_views,
    count(distinct visitor_id) as visitors,
    count(distinct session_id) as sessions
  from visits group by country_code order by sessions desc,country_code limit 50
),
region_stats as (
  select country_code as country,region,count(*) as page_views,
    count(distinct visitor_id) as visitors,
    count(distinct session_id) as sessions
  from visits group by country_code,region order by sessions desc,country_code,region limit 100
),
area_stats as (
  select area,count(*) as page_views,count(distinct session_id) as sessions
  from visits group by area order by page_views desc,area
)
select jsonb_build_object(
  'days',greatest(1,least(90,coalesce(p_days,30))),
  'pageViews',(select count(*) from visits),
  'sessions',(select count(*) from sessions),
  'uniqueVisitors',(select count(*) from visitors),
  'returningVisitors',(select count(*) from visitors where session_count>1),
  'repeatSessions',(select coalesce(sum(session_count-1),0) from visitors),
  'readingSessions',(select count(*) from sessions where read_a_book),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',day,'pageViews',page_views,'sessions',session_count,'visitors',visitor_count) order by day) from daily),'[]'::jsonb),
  'countries',coalesce((select jsonb_agg(jsonb_build_object('country',country,'pageViews',page_views,'visitors',visitors,'sessions',sessions)) from country_stats),'[]'::jsonb),
  'regions',coalesce((select jsonb_agg(jsonb_build_object('country',country,'region',region,'pageViews',page_views,'visitors',visitors,'sessions',sessions)) from region_stats),'[]'::jsonb),
  'areas',coalesce((select jsonb_agg(jsonb_build_object('area',area,'pageViews',page_views,'sessions',sessions)) from area_stats),'[]'::jsonb),
  'trackingSince',(select min(occurred_at) from public.platform_usage_events),
  'retentionDays',180
);
$$;
revoke all on function public.platform_usage_report(integer) from public,anon,authenticated;
grant execute on function public.platform_usage_report(integer) to service_role;

create or replace function public.prune_platform_usage()
returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare removed bigint;
begin
  delete from public.platform_usage_events
  where occurred_at < now() - interval '180 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.prune_platform_usage() from public,anon,authenticated;
grant execute on function public.prune_platform_usage() to service_role;

-- Reuse existing ticket workflow. No change to rights/legal case categories.
alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check
check (category in (
  'account','book','upload','translation_job','sign_in','other',
  'general_support','reading_progress','manuscript_publication',
  'translation_request','complaint','safety_abuse','privacy_request',
  'accessibility','platform_suggestion','technical_issue'
));
