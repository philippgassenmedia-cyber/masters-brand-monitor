-- Erweitere scan_type und status CHECK-Constraints auf scheduled_scans

alter table public.scheduled_scans
  drop constraint if exists scheduled_scans_scan_type_check;

alter table public.scheduled_scans
  add constraint scheduled_scans_scan_type_check
  check (scan_type in ('web', 'dpma', 'euipo', 'handelsregister', 'all'));

alter table public.scheduled_scans
  drop constraint if exists scheduled_scans_status_check;

alter table public.scheduled_scans
  add constraint scheduled_scans_status_check
  check (status in ('pending', 'running', 'completed', 'failed', 'partial', 'expired', 'cancelled'));
