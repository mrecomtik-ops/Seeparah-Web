-- 0003: Explicit provider tracking + usage/cost visibility
alter table public.book_chunks
  add column if not exists provider text;

alter table public.book_translation_jobs
  add column if not exists provider text not null default 'gemini',
  add column if not exists total_prompt_tokens bigint not null default 0,
  add column if not exists total_output_tokens bigint not null default 0;

alter table public.book_translation_sections
  add column if not exists prompt_tokens integer,
  add column if not exists output_tokens integer;

comment on column public.book_translation_jobs.provider is
  'Explicit provider label (e.g. gemini). Provider changes are recorded per job, never silently substituted at read time.';

-- 0004: admin role system + audit log + admin action rate limiting
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'administrator', 'editor', 'support')),
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id)
);

grant select on public.admin_users to authenticated;
grant all on public.admin_users to service_role;

create index if not exists admin_users_active_idx on public.admin_users (role) where revoked_at is null;

alter table public.admin_users enable row level security;

create or replace function public.current_admin_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.admin_users
  where user_id = auth.uid() and revoked_at is null
  limit 1;
$$;

create or replace function public.is_admin(min_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_admin_role() = any(min_roles), false);
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'admin_users' and policyname = 'admin_users_self_read'
  ) then
    create policy admin_users_self_read on public.admin_users
      for select using (user_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'admin_users' and policyname = 'admin_users_owner_admin_read'
  ) then
    create policy admin_users_owner_admin_read on public.admin_users
      for select using (public.is_admin(array['owner', 'administrator']));
  end if;
end $$;

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owners integer;
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and (new.revoked_at is not null or new.role <> 'owner')) then
    perform pg_advisory_xact_lock(hashtext('admin_users_owner_guard'));
    select count(*) into remaining_owners
    from public.admin_users
    where role = 'owner' and revoked_at is null and user_id <> old.user_id;
    if remaining_owners = 0 then
      raise exception 'Cannot remove the last active owner';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_users_protect_last_owner on public.admin_users;
create trigger admin_users_protect_last_owner
  before update or delete on public.admin_users
  for each row execute function public.prevent_last_owner_removal();

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id),
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'audit_log' and policyname = 'audit_log_owner_admin_read'
  ) then
    create policy audit_log_owner_admin_read on public.audit_log
      for select using (public.is_admin(array['owner', 'administrator']));
  end if;
end $$;

create table if not exists public.admin_action_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id),
  action text not null,
  target_id text,
  created_at timestamptz not null default now()
);

grant all on public.admin_action_events to service_role;

create index if not exists admin_action_events_lookup_idx
  on public.admin_action_events (actor_id, action, created_at desc);

alter table public.admin_action_events enable row level security;
