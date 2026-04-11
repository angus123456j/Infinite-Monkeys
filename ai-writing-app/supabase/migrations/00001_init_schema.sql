-- Supabase migration: initial schema ported from Prisma/MySQL
-- Uses quoted camelCase column names to match existing frontend interfaces.

create table "documents" (
  "id"              text primary key default gen_random_uuid()::text,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),
  "title"           text not null,
  "content"         text not null default '',
  "folderId"        text,
  "monkeyTimeline"  jsonb not null default '[]'::jsonb
);

create table "contexts" (
  "id"          text primary key default gen_random_uuid()::text,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),
  "title"       text not null,
  "description" text not null default '',
  "tags"        jsonb not null default '[]'::jsonb,
  "lastUsedAt"  timestamptz
);

create table "monkey_agents" (
  "id"            text primary key default gen_random_uuid()::text,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now(),
  "name"          text not null,
  "role"          text not null,
  "strengths"     text not null default '',
  "avatar"        varchar(512),
  "defaultPrompt" text not null default '',
  "identity"      text not null default '',
  "behavior"      text not null default '',
  "constraints"   text not null default ''
);

-- Auto-update "updatedAt" on row modification
create or replace function update_updated_at()
returns trigger as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_updated_at
  before update on "documents"
  for each row execute function update_updated_at();

create trigger contexts_updated_at
  before update on "contexts"
  for each row execute function update_updated_at();

create trigger monkey_agents_updated_at
  before update on "monkey_agents"
  for each row execute function update_updated_at();

-- Row Level Security (permissive for now — tighten when adding Supabase Auth users)
alter table "documents" enable row level security;
alter table "contexts" enable row level security;
alter table "monkey_agents" enable row level security;

create policy "allow_all_documents" on "documents"
  for all using (true) with check (true);

create policy "allow_all_contexts" on "contexts"
  for all using (true) with check (true);

create policy "allow_all_monkey_agents" on "monkey_agents"
  for all using (true) with check (true);

-- Indexes for common query patterns
create index "documents_createdAt_idx" on "documents" ("createdAt" desc);
create index "contexts_lastUsedAt_idx" on "contexts" ("lastUsedAt" desc nulls last);
create index "monkey_agents_updatedAt_idx" on "monkey_agents" ("updatedAt" desc);
