-- Menschliches Feedback zu KI-Bewertungen
create table if not exists public.hit_feedback (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('hit', 'trademark')),
  item_id uuid not null,
  -- Bewertung: war der KI-Score korrekt?
  rating text not null check (rating in ('correct', 'too_high', 'too_low', 'false_positive', 'missed')),
  correct_score int check (correct_score is null or (correct_score >= 0 and correct_score <= 10)),
  comment text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists hit_feedback_item_idx on public.hit_feedback(item_type, item_id);

alter table public.hit_feedback enable row level security;
create policy "auth rw hit_feedback"
  on public.hit_feedback for all to authenticated using (true) with check (true);
