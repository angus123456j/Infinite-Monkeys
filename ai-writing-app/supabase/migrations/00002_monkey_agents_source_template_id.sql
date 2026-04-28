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
