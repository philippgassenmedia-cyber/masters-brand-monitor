-- Job-Queue: Vercel erstellt Jobs, lokaler Agent führt sie aus
CREATE TABLE dpma_scan_jobs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  picked_up_at timestamptz,
  finished_at timestamptz,
  status      text        DEFAULT 'pending'
    CHECK (status IN ('pending','running','done','failed','cancelled')),
  stems       text[]      NOT NULL,
  options     jsonb       DEFAULT '{}',
  created_by  text
);

-- SSE-Events die der lokale Agent streamt und Vercel weiterleitet
CREATE TABLE dpma_scan_events (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     uuid        NOT NULL REFERENCES dpma_scan_jobs(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  event      jsonb       NOT NULL
);

CREATE INDEX dpma_scan_events_job_id_idx ON dpma_scan_events(job_id, id);
