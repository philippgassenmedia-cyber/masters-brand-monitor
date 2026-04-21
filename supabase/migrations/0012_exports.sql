-- Export-Log: jeder Export wird protokolliert
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

-- Verknüpfung: welche Hits/Trademarks in welchem Export enthalten waren
create table if not exists public.export_items (
  id uuid primary key default gen_random_uuid(),
  export_id uuid not null references public.lawyer_exports(id) on delete cascade,
  item_type text not null check (item_type in ('hit', 'trademark')),
  item_id uuid not null,
  -- Status-Tracking nach dem Export
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

create policy "auth rw lawyer_exports"
  on public.lawyer_exports for all to authenticated using (true) with check (true);
create policy "auth rw export_items"
  on public.export_items for all to authenticated using (true) with check (true);
