-- Referenzfälle: Kuratierte Beispiele für die KI-Klassifizierung
-- Werden in den Gemini-Prompt injiziert um Bewertungen zu verbessern.

create table public.reference_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company_name text,
  url text,
  category text not null check (category in (
    'clear_violation',
    'suspected_violation',
    'borderline',
    'generic_use',
    'own_brand',
    'other_industry',
    'false_positive'
  )),
  score integer not null check (score between 1 and 10),
  reasoning text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reference_cases enable row level security;

create policy "authenticated_all" on public.reference_cases
  for all using (auth.role() = 'authenticated');
