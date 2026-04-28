-- Add monkeyTimeline to contexts so agent invocations can be persisted there too.

alter table public.contexts
  add column if not exists "monkeyTimeline" jsonb not null default '[]'::jsonb;

