-- =============================================================
-- Komplettes Schema für Masters Brand Monitor
-- Idempotent: kann mehrfach ausgeführt werden (IF NOT EXISTS)
-- =============================================================

-- Extension für UUID-Generierung
create extension if not exists pgcrypto;

-- ===================== HITS =====================
create table if not exists public.hits (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  domain text not null,
  title text,
  snippet text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count int not null default 1,
  -- Unternehmensdaten (aus Impressum)
  company_name text,
  address text,
  email text,
  phone text,
  social_links jsonb,
  impressum_raw text,
  impressum_scraped_at timestamptz,
  -- KI-Bewertung
  ai_score int,
  ai_is_violation boolean,
  ai_reasoning text,
  ai_recommendation text,
  ai_violation_category text,
  ai_model text,
  ai_analyzed_at timestamptz,
  -- Erweitert
  is_violation boolean,
  subject_company_address text,
  address_key text,
  resolved_website text,
  -- Workflow
  status text not null default 'new',
  notes text,
  scan_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hits_url_idx on public.hits(url);
create index if not exists hits_domain_idx on public.hits(domain);
create index if not exists hits_score_idx on public.hits(ai_score);
create index if not exists hits_status_idx on public.hits(status);

alter table public.hits enable row level security;
do $$ begin
  create policy "auth rw hits" on public.hits for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== SCAN_RUNS =====================
create table if not exists public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  region text,
  triggered_by text,
  queries_run int not null default 0,
  raw_results int not null default 0,
  new_hits int not null default 0,
  updated_hits int not null default 0,
  status text not null default 'running',
  created_at timestamptz not null default now()
);

alter table public.scan_runs enable row level security;
do $$ begin
  create policy "auth rw scan_runs" on public.scan_runs for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== EXCLUDED_DOMAINS =====================
create table if not exists public.excluded_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.excluded_domains enable row level security;
do $$ begin
  create policy "auth rw excluded_domains" on public.excluded_domains for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== API_USAGE =====================
create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  day date not null default current_date,
  count int not null default 0,
  unique(provider, day)
);

alter table public.api_usage enable row level security;
do $$ begin
  create policy "auth rw api_usage" on public.api_usage for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- RPC Funktion zum Inkrementieren
drop function if exists public.increment_api_usage(text, int);
create or replace function public.increment_api_usage(p_provider text, p_delta int default 1)
returns void language plpgsql security definer as $$
begin
  insert into public.api_usage (provider, day, count)
  values (p_provider, current_date, p_delta)
  on conflict (provider, day) do update set count = api_usage.count + p_delta;
end;
$$;

-- ===================== SETTINGS =====================
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;
do $$ begin
  create policy "auth rw settings" on public.settings for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== TRADEMARKS =====================
create table if not exists public.trademarks (
  id uuid primary key default gen_random_uuid(),
  aktenzeichen text not null,
  markenname text not null,
  anmelder text,
  anmeldetag text,
  veroeffentlichungstag text,
  widerspruchsfrist_ende text,
  status text,
  nizza_klassen int[] default '{}',
  quelle text,
  quelle_detail text,
  match_type text,
  markenstamm text,
  register_url text,
  relevance_score int,
  branchenbezug text,
  prioritaet text,
  begruendung text,
  raw_email_id uuid,
  workflow_status text not null default 'new',
  notes text,
  -- Erweiterte Felder (Migrations 0009-0011)
  resolved_website text,
  website_profile jsonb,
  waren_dienstleistungen text,
  inhaber_anschrift text,
  vertreter text,
  markenform text,
  schutzdauer_bis date,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists trademarks_az_stamm_idx
  on public.trademarks(aktenzeichen, markenstamm);
create index if not exists trademarks_score_idx on public.trademarks(relevance_score);

alter table public.trademarks enable row level security;
do $$ begin
  create policy "auth rw trademarks" on public.trademarks for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== BRAND_STEMS =====================
create table if not exists public.brand_stems (
  id uuid primary key default gen_random_uuid(),
  stamm text not null unique,
  description text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.brand_stems enable row level security;
do $$ begin
  create policy "auth rw brand_stems" on public.brand_stems for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- Default-Stamm einfügen (nur Pflichtfelder, da Spaltenname variiert)
insert into public.brand_stems (stamm, aktiv)
values ('master', true)
on conflict (stamm) do nothing;

-- ===================== IMAP_ACCOUNTS =====================
create table if not exists public.imap_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  imap_host text not null,
  imap_port int not null default 993,
  username text not null,
  password_encrypted text not null,
  use_ssl boolean not null default true,
  inbox_folder text not null default 'INBOX',
  processed_folder text not null default 'INBOX/Processed',
  review_folder text not null default 'INBOX/Review',
  is_active boolean not null default true,
  last_check_at timestamptz,
  last_check_status text,
  last_check_message text,
  created_at timestamptz not null default now()
);

alter table public.imap_accounts enable row level security;
do $$ begin
  create policy "auth rw imap_accounts" on public.imap_accounts for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== PROCESSED_EMAILS =====================
create table if not exists public.processed_emails (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  subject text,
  from_address text,
  received_at timestamptz,
  hits_found int not null default 0,
  errors text[] default '{}',
  processed_at timestamptz not null default now(),
  imap_account_id uuid references public.imap_accounts(id) on delete set null
);

alter table public.processed_emails enable row level security;
do $$ begin
  create policy "auth rw processed_emails" on public.processed_emails for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== DEAD_LETTER_QUEUE =====================
create table if not exists public.dead_letter_queue (
  id uuid primary key default gen_random_uuid(),
  message_id text,
  subject text,
  from_address text,
  received_at timestamptz,
  error_message text,
  raw_body text,
  imap_account_id uuid references public.imap_accounts(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.dead_letter_queue enable row level security;
do $$ begin
  create policy "auth rw dead_letter_queue" on public.dead_letter_queue for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== MONITORING_SUBSCRIPTIONS =====================
create table if not exists public.monitoring_subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  frequency text not null default 'weekly',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.monitoring_subscriptions enable row level security;
do $$ begin
  create policy "auth rw monitoring_subscriptions" on public.monitoring_subscriptions for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== LAWYER_EXPORTS =====================
create table if not exists public.lawyer_exports (
  id uuid primary key default gen_random_uuid(),
  exported_at timestamptz not null default now(),
  format text not null check (format in ('csv', 'pdf')),
  hit_count int not null default 0,
  trademark_count int not null default 0,
  exported_by text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.export_items (
  id uuid primary key default gen_random_uuid(),
  export_id uuid not null references public.lawyer_exports(id) on delete cascade,
  item_type text not null check (item_type in ('hit', 'trademark')),
  item_id uuid not null,
  lawyer_status text not null default 'exported'
    check (lawyer_status in ('exported', 'sent_to_lawyer', 'warned', 'cease_desist', 'lawsuit', 'settled', 'dismissed')),
  lawyer_status_updated_at timestamptz,
  lawyer_notes text,
  created_at timestamptz not null default now()
);

create index if not exists export_items_export_idx on public.export_items(export_id);
create index if not exists export_items_item_idx on public.export_items(item_type, item_id);

alter table public.lawyer_exports enable row level security;
alter table public.export_items enable row level security;
do $$ begin
  create policy "auth rw lawyer_exports" on public.lawyer_exports for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "auth rw export_items" on public.export_items for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== EMAIL_RECIPIENTS =====================
create table if not exists public.email_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.email_recipients enable row level security;
do $$ begin
  create policy "auth rw email_recipients" on public.email_recipients for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== HIT_FEEDBACK =====================
create table if not exists public.hit_feedback (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('hit', 'trademark')),
  item_id uuid not null,
  rating text not null check (rating in ('correct', 'too_high', 'too_low', 'false_positive', 'missed')),
  correct_score int check (correct_score is null or (correct_score >= 0 and correct_score <= 10)),
  comment text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists hit_feedback_item_idx on public.hit_feedback(item_type, item_id);

alter table public.hit_feedback enable row level security;
do $$ begin
  create policy "auth rw hit_feedback" on public.hit_feedback for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== SCHEDULED_SCANS =====================
create table if not exists public.scheduled_scans (
  id uuid primary key default gen_random_uuid(),
  scheduled_at timestamptz not null,
  scan_type text not null default 'all' check (scan_type in ('web', 'dpma', 'all')),
  recurring boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  created_by text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_scans_due_idx
  on public.scheduled_scans(scheduled_at, status)
  where status = 'pending';

alter table public.scheduled_scans enable row level security;
do $$ begin
  create policy "auth rw scheduled_scans" on public.scheduled_scans for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ===================== DONE =====================
-- Alle Tabellen erstellt. Dieses Script kann beliebig oft ausgeführt werden.
