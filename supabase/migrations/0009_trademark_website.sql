alter table public.trademarks
  add column if not exists resolved_website text;

alter table public.trademarks
  add column if not exists website_profile jsonb;
