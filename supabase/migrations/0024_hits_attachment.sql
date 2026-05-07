-- PDF-Anhänge für importierte Treffer (gespeichert in Supabase Storage)
alter table public.hits add column if not exists attachment_url text;
