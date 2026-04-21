-- E-Mail-Empfänger für automatische Scan-Reports
create table if not exists public.email_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.email_recipients enable row level security;
create policy "auth rw email_recipients"
  on public.email_recipients for all to authenticated using (true) with check (true);
