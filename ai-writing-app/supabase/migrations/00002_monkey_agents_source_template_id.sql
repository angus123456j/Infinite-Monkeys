-- Add provenance tracking for saved agents.
-- This keeps template agents in the neural net and user-owned copies in Drive.

alter table public.monkey_agents
  add column if not exists source_template_id text null;

create index if not exists monkey_agents_source_template_id_idx
  on public.monkey_agents (source_template_id);

-- Ensure expected ownership fields exist (some environments were edited manually).
alter table public.monkey_agents
  add column if not exists user_id uuid null;

alter table public.monkey_agents
  add column if not exists is_template boolean not null default false;

-- FK is safe to add only if missing; Postgres doesn't support IF NOT EXISTS for constraints,
-- so we leave it to manual/CLI-managed schema if already present.

-- ——— Schema expected by 00003 (RLS + handle_new_user) ———
-- 00001 did not add user_id on documents/contexts; profiles/subscriptions were never created.

alter table public.documents
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.contexts
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists documents_user_id_idx on public.documents (user_id);
create index if not exists contexts_user_id_idx on public.contexts (user_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
