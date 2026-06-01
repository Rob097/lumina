-- Supabase-compatible auth shim for local/CI testing on a bare Postgres.
-- Production Supabase already provides all of this; here we recreate just enough that the
-- migrations apply unchanged and RLS behaves exactly as it will in production.

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- Resolve the JWT subject the same way Supabase does: request.jwt.claims ->> 'sub'.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

-- The roles PostgREST/Supabase rely on. NOLOGIN; tests `set role` into them.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;
