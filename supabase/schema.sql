-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- It creates the table that stores past searches.

create table if not exists public.startup_searches (
  id bigint generated always as identity primary key,
  lookup_key text not null unique,
  startup_name text not null,
  founder_name text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- Block public access. Only the website's server (using the secret key) can read and write.
alter table public.startup_searches enable row level security;
