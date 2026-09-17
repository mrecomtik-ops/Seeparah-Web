create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id),
  contact_email text,
  is_anonymous boolean not null default false,
  subject text not null,
  description text not null,
  category text not null default 'other'
    check (category in ('account', 'book', 'upload', 'translation_job', 'sign_in', 'other')),
  severity text not null default 'normal'
    check (severity in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'pending', 'resolved', 'closed')),
  related_book_id uuid references public.books (id),
  related_job_id uuid references public.book_translation_jobs (id),
  assigned_to uuid references auth.users (id),
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_identity_check check (
    (is_anonymous and user_id is null) or (not is_anonymous and user_id is not null)
  )
);

grant select on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;

create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id);
create index if not exists support_tickets_assigned_idx on public.support_tickets (assigned_to);

create table if not exists public.support_ticket_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references auth.users (id),
  body text not null,
  visibility text not null default 'internal' check (visibility in ('internal', 'public')),
  created_at timestamptz not null default now()
);

grant select on public.support_ticket_notes to authenticated;
grant all on public.support_ticket_notes to service_role;

create index if not exists support_ticket_notes_ticket_idx on public.support_ticket_notes (ticket_id, created_at);

create table if not exists public.support_report_rate_limit (
  ip_hash text not null,
  day date not null,
  count integer not null default 1,
  primary key (ip_hash, day)
);

grant all on public.support_report_rate_limit to service_role;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_notes enable row level security;
alter table public.support_report_rate_limit enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'support_tickets' and policyname = 'support_tickets_owner_read'
  ) then
    create policy support_tickets_owner_read on public.support_tickets
      for select using (user_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'support_tickets' and policyname = 'support_tickets_staff_read'
  ) then
    create policy support_tickets_staff_read on public.support_tickets
      for select using (public.is_admin(array['owner', 'administrator', 'support']));
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'support_ticket_notes' and policyname = 'support_ticket_notes_owner_read_public'
  ) then
    create policy support_ticket_notes_owner_read_public on public.support_ticket_notes
      for select using (
        visibility = 'public'
        and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
      );
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'support_ticket_notes' and policyname = 'support_ticket_notes_staff_read'
  ) then
    create policy support_ticket_notes_staff_read on public.support_ticket_notes
      for select using (public.is_admin(array['owner', 'administrator', 'support']));
  end if;
end $$;

create table if not exists public.translation_requests (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  language text not null,
  requester_id uuid not null references auth.users (id),
  status text not null default 'requested'
    check (status in ('requested', 'approved_awaiting_edition', 'granted', 'declined', 'revoked')),
  job_id uuid references public.book_translation_jobs (id),
  decision_reason text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, language, requester_id)
);

grant select, insert on public.translation_requests to authenticated;
grant all on public.translation_requests to service_role;

create index if not exists translation_requests_status_idx on public.translation_requests (status, created_at desc);
create index if not exists translation_requests_book_lang_idx on public.translation_requests (book_id, language);

alter table public.translation_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'translation_requests' and policyname = 'translation_requests_owner_read'
  ) then
    create policy translation_requests_owner_read on public.translation_requests
      for select using (requester_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'translation_requests' and policyname = 'translation_requests_staff_read'
  ) then
    create policy translation_requests_staff_read on public.translation_requests
      for select using (public.is_admin(array['owner', 'administrator', 'editor']));
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'translation_requests' and policyname = 'translation_requests_insert_own'
  ) then
    create policy translation_requests_insert_own on public.translation_requests
      for insert with check (
        requester_id = auth.uid()
        and status = 'requested'
        and job_id is null
        and decision_reason is null
        and reviewed_by is null
        and reviewed_at is null
      );
  end if;
end $$;

create table if not exists public.content_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default true,
  version integer not null default 1,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

grant select on public.content_settings to anon;
grant select on public.content_settings to authenticated;
grant all on public.content_settings to service_role;

create table if not exists public.content_settings_history (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value jsonb not null,
  version integer not null,
  action text not null check (action in ('publish', 'rollback')),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

grant select on public.content_settings_history to authenticated;
grant all on public.content_settings_history to service_role;

create index if not exists content_settings_history_key_idx on public.content_settings_history (key, version desc);

alter table public.content_settings enable row level security;
alter table public.content_settings_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'content_settings' and policyname = 'content_settings_public_read'
  ) then
    create policy content_settings_public_read on public.content_settings
      for select using (is_public = true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'content_settings' and policyname = 'content_settings_staff_read_all'
  ) then
    create policy content_settings_staff_read_all on public.content_settings
      for select using (public.is_admin(array['owner', 'administrator', 'editor', 'support']));
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'content_settings_history' and policyname = 'content_settings_history_staff_read'
  ) then
    create policy content_settings_history_staff_read on public.content_settings_history
      for select using (public.is_admin(array['owner', 'administrator']));
  end if;
end $$;

create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  severity text not null default 'error' check (severity in ('info', 'warning', 'error', 'critical')),
  code text not null,
  message text not null,
  request_id text,
  user_id uuid references auth.users (id),
  job_id uuid references public.book_translation_jobs (id),
  book_id uuid references public.books (id),
  client_version text,
  retryable boolean not null default false,
  resolved boolean not null default false,
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  context jsonb not null default '{}'::jsonb
);

grant select on public.error_events to authenticated;
grant all on public.error_events to service_role;

create index if not exists error_events_unresolved_idx on public.error_events (resolved, occurred_at desc);
create index if not exists error_events_severity_idx on public.error_events (severity, occurred_at desc);

alter table public.error_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'error_events' and policyname = 'error_events_staff_read'
  ) then
    create policy error_events_staff_read on public.error_events
      for select using (public.is_admin(array['owner', 'administrator']));
  end if;
end $$;
