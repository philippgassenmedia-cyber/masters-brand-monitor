-- Fügt fehlende Spalten zur hits-Tabelle hinzu (falls noch nicht vorhanden)
alter table public.hits
  add column if not exists scan_run_id uuid references public.scan_runs(id) on delete set null;

create index if not exists hits_scan_run_idx on public.hits(scan_run_id);
