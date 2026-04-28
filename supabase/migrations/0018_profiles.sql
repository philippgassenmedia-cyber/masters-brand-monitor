-- User profiles: approval status + display name
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  approved boolean not null default false,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Trigger: automatically create profile (unapproved) on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, approved)
  values (new.id, false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-approve all existing users (preserve existing approvals)
insert into public.profiles (id, approved)
select id, true
from auth.users
on conflict (id) do nothing;
