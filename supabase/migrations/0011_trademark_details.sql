alter table public.trademarks
  add column if not exists inhaber_anschrift text;

alter table public.trademarks
  add column if not exists vertreter text;

alter table public.trademarks
  add column if not exists markenform text;

alter table public.trademarks
  add column if not exists schutzdauer_bis date;
