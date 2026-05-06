-- Kommentar-Feed pro Treffer (interne Status-Updates / Gesprächsnotizen)
create table if not exists hit_notes (
  id          uuid primary key default gen_random_uuid(),
  hit_id      uuid not null references hits(id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 2000),
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists hit_notes_hit_id_idx on hit_notes (hit_id, created_at);

alter table hit_notes enable row level security;

create policy "Eingeloggte Nutzer können Notizen lesen"
  on hit_notes for select
  using (auth.role() = 'authenticated');

create policy "Eingeloggte Nutzer können Notizen erstellen"
  on hit_notes for insert
  with check (auth.role() = 'authenticated');

create policy "Ersteller darf eigene Notizen löschen"
  on hit_notes for delete
  using (created_by = auth.jwt()->>'email');
