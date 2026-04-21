-- Geplante Scans (Einzel-Termine + wiederkehrend)
create table if not exists public.scheduled_scans (
  id uuid primary key default gen_random_uuid(),
  -- Wann soll der Scan laufen?
  scheduled_at timestamptz not null,
  -- Was soll gescannt werden?
  scan_type text not null default 'all' check (scan_type in ('web', 'dpma', 'all')),
  -- Wiederkehrend oder einmalig?
  recurring boolean not null default false,
  -- Status
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  -- Wer hat es geplant?
  created_by text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_scans_due_idx
  on public.scheduled_scans(scheduled_at, status)
  where status = 'pending';

alter table public.scheduled_scans enable row level security;
create policy "auth rw scheduled_scans"
  on public.scheduled_scans for all to authenticated using (true) with check (true);
