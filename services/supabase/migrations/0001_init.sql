create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key,
  handle text unique,
  display_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  mode text not null default 'personal' check (mode in ('personal', 'work')),
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  device_fingerprint uuid not null unique,
  device_name text not null,
  platform text not null,
  vscode_version text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  device_fingerprint uuid not null,
  user_id uuid references public.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  kind text not null default 'pomodoro' check (kind in ('pomodoro', 'freeform')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'abandoned')),
  language_top text,
  project_hash text,
  confidence text not null default 'Self Reported' check (confidence in ('Verified', 'Self Reported', 'Low Confidence')),
  created_at timestamptz not null default now()
);

create table if not exists public.heartbeats (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  client_event_id uuid not null,
  ts timestamptz not null,
  active_seconds integer not null,
  idle_seconds integer not null,
  language text not null,
  project_hash text not null,
  files_saved integer not null default 0,
  local_commits integer not null default 0,
  created_at timestamptz not null default now(),
  unique (device_id, client_event_id)
);

create table if not exists public.output_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  source text not null,
  kind text not null,
  occurred_at timestamptz not null,
  weight integer not null default 1,
  confidence text not null default 'Self Reported' check (confidence in ('Verified', 'Self Reported', 'Low Confidence')),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_stats (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  coding_minutes integer not null default 0,
  sessions_count integer not null default 0,
  deep_work_minutes integer not null default 0,
  output_count integer not null default 0,
  momentum_score integer not null default 0,
  streak_qualified boolean not null default false,
  languages jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.streaks (
  user_id uuid primary key references public.users(id) on delete cascade,
  current_len integer not null default 0,
  longest_len integer not null default 0,
  last_qualified_day date,
  updated_at timestamptz not null default now()
);

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references public.users(id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('private')),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.squad_members (
  squad_id uuid not null references public.squads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  scope text not null default 'personal' check (scope in ('personal', 'work')),
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  unique (user_id, provider, scope)
);

create table if not exists public.trust_scores (
  user_id uuid primary key references public.users(id) on delete cascade,
  score integer not null default 0,
  signals jsonb not null default '{}'::jsonb,
  anomalies jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_key text not null,
  awarded_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  channel text not null default 'inapp' check (channel in ('push', 'email', 'inapp')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);

create index if not exists idx_heartbeats_user_ts on public.heartbeats(user_id, ts desc);
create index if not exists idx_daily_stats_user_day on public.daily_stats(user_id, day desc);
create index if not exists idx_sessions_active on public.sessions(user_id, status) where status = 'active';
create index if not exists idx_notifications_due on public.notifications(status, scheduled_for) where status = 'pending';

alter table public.users enable row level security;
alter table public.devices enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.sessions enable row level security;
alter table public.heartbeats enable row level security;
alter table public.output_events enable row level security;
alter table public.daily_stats enable row level security;
alter table public.streaks enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.integrations enable row level security;
alter table public.trust_scores enable row level security;
alter table public.achievements enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

create policy users_select_own on public.users
  for select using (id = auth.uid());

create policy users_update_own on public.users
  for update using (id = auth.uid());

create policy devices_select_own on public.devices
  for select using (user_id = auth.uid());

create policy sessions_select_own on public.sessions
  for select using (user_id = auth.uid());

create policy heartbeats_select_own on public.heartbeats
  for select using (user_id = auth.uid());

create policy output_events_select_own on public.output_events
  for select using (user_id = auth.uid());

create policy daily_stats_select_own on public.daily_stats
  for select using (user_id = auth.uid());

create policy streaks_select_own on public.streaks
  for select using (user_id = auth.uid());

create policy integrations_select_own on public.integrations
  for select using (user_id = auth.uid());

create policy trust_scores_select_own on public.trust_scores
  for select using (user_id = auth.uid());

create policy achievements_select_own on public.achievements
  for select using (user_id = auth.uid());

create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());

create policy squad_members_select_member on public.squad_members
  for select using (
    exists (
      select 1 from public.squad_members sm
      where sm.squad_id = squad_members.squad_id and sm.user_id = auth.uid()
    )
  );

create policy squads_select_member on public.squads
  for select using (
    exists (
      select 1 from public.squad_members sm
      where sm.squad_id = squads.id and sm.user_id = auth.uid()
    )
  );

create policy pairing_codes_none on public.pairing_codes
  for all using (false) with check (false);
