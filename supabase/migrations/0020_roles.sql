-- Add role column to profiles table
-- lawyer = full access (same as current default)
-- viewer = read-only, mobile-optimized overview

alter table public.profiles
  add column if not exists role text not null default 'viewer'
  check (role in ('lawyer', 'viewer'));

-- All currently existing/approved users become lawyers
update public.profiles set role = 'lawyer' where approved = true;

-- Allow any authenticated user to read all profiles (for user management UI)
-- Use service-role client on server — no additional RLS policy needed.

-- Allow users to read their own profile (role included)
-- The existing "profiles_select_own" policy already covers this.
