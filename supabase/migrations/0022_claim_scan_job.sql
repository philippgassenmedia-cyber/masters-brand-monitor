-- Atomic job claim: only one agent can claim a job at a time.
-- Uses FOR UPDATE SKIP LOCKED so concurrent agents skip already-locked rows.

create or replace function claim_next_scan_job()
returns table(id uuid, scan_type text)
language plpgsql
security definer
as $$
begin
  return query
  update public.scheduled_scans s
  set status = 'running',
      started_at = now()
  where s.id = (
    select id
    from public.scheduled_scans
    where status = 'pending'
      and scan_type in ('dpma', 'euipo', 'handelsregister', 'all')
      and scheduled_at >= now() - interval '2 hours'
      and scheduled_at <= now()
    order by scheduled_at
    limit 1
    for update skip locked
  )
  returning s.id, s.scan_type;
end;
$$;
