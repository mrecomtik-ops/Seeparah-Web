-- Seeparah — admin role system + audit log + admin action rate limiting.
-- Additive and backward compatible: no existing table is touched other than
-- adding RLS-safe helper functions used only by the new admin surface.
--
-- HOW TO APPLY
--   Same as 0001-0003: review this file, then run it against the project's
--   Supabase database (SQL editor, or `supabase db push` once the project is
--   linked). It has NOT been applied automatically by this change.
--
-- SECURITY MODEL
--   Roles are least-privilege and additive: owner > administrator > editor >
--   support. There is no "first registrant becomes owner" and no hardcoded
--   email anywhere in this file — granting the first owner is a separate,
--   explicit, human-run step (see scripts/seed-owner.ts and
--   docs/admin-operator-guide.md). Nothing in this migration grants anyone
--   a role.

-- ---------------------------------------------------------------------------
-- 1. admin_users: who holds which admin role
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'administrator', 'editor', 'support')),
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id)
);

create index if not exists admin_users_active_idx on public.admin_users (role) where revoked_at is null;

alter table public.admin_users enable row level security;

-- security definer so policies elsewhere can check role without recursive
-- RLS on admin_users itself; SET search_path pins it against schema-hijacking.
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
  -- No authenticated-role write policy at all: every mutation (grant, revoke)
  -- goes through server code running as service role, which bypasses RLS and
  -- writes an audit_log row in the same transaction-equivalent call. This is
  -- what stops an ordinary user from ever granting themselves a role.
end $$;

-- Guardrail: never allow the last active owner to be revoked/deleted, even by
-- service-role code that forgets to check. Defense in depth alongside the
-- application-level check in src/lib/admin/roles.server.ts.
--
-- CONCURRENCY: the count-then-act check below is only safe because of the
-- pg_advisory_xact_lock call first. Without it, two concurrent transactions
-- each revoking a DIFFERENT owner race: both run their SELECT count(*)
-- before either commits, both see "1 other owner remaining" (each other),
-- both proceed, and both commit — leaving zero owners. The advisory lock is
-- scoped to the current transaction (auto-released on commit/rollback) and
-- keyed to a fixed, arbitrary constant shared by every invocation, so a
-- second concurrent UPDATE/DELETE on admin_users blocks here until the first
-- transaction finishes, then re-runs its count against the now-committed
-- state — making the check-then-act atomic across concurrent requests.
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

-- ---------------------------------------------------------------------------
-- 2. audit_log: every privileged mutation, who/what/when/why + redacted diff
-- ---------------------------------------------------------------------------
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
  -- Deliberately no insert/update/delete policy for any non-service-role
  -- caller: ordinary staff (editor/support) cannot read or rewrite audit
  -- records. All writes happen server-side via the service role.
end $$;

-- ---------------------------------------------------------------------------
-- 3. Rate limiting for sensitive admin/support actions (per actor, per action)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_action_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id),
  action text not null,
  target_id text,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_events_lookup_idx
  on public.admin_action_events (actor_id, action, created_at desc);

alter table public.admin_action_events enable row level security;
-- No policies: this table is only ever read/written by service-role code
-- (src/lib/admin/rate-limit.server.ts) to throttle actions like "send
-- recovery email" or "resend notification".
