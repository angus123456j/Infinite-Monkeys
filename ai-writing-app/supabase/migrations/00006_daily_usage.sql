-- Per-user daily counters for free-tier quotas (UTC calendar day).

create table public.daily_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null default ((timezone('utc', now()))::date),
  sentences_used integer not null default 0,
  scrutiny_scans integer not null default 0,
  unique (user_id, date)
);

create index daily_usage_user_date_idx on public.daily_usage (user_id, date);

alter table public.daily_usage enable row level security;

create policy "daily_usage_select_own" on public.daily_usage for select to authenticated using (
  user_id = (select auth.uid())
);

create policy "daily_usage_insert_own" on public.daily_usage for insert to authenticated with check (
  user_id = (select auth.uid())
);

create policy "daily_usage_update_own" on public.daily_usage for update to authenticated using (
  user_id = (select auth.uid())
) with check (
  user_id = (select auth.uid())
);

-- Client: atomic +1 scrutiny scan (JWT user).
create or replace function public.increment_daily_scrutiny() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (timezone('utc', now()))::date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.daily_usage (user_id, date, scrutiny_scans, sentences_used)
    values (auth.uid(), d, 1, 0)
  on conflict (user_id, date)
    do update set scrutiny_scans = public.daily_usage.scrutiny_scans + 1;
end;
$$;

revoke all on function public.increment_daily_scrutiny() from public;

grant execute on function public.increment_daily_scrutiny() to authenticated;

-- Edge (service role): add sentence-equivalent count after a rewrite.
create or replace function public.add_daily_sentences(p_user_id uuid, p_date date, p_delta int) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_delta is null or p_delta < 0 then
    raise exception 'invalid arguments';
  end if;
  insert into public.daily_usage (user_id, date, sentences_used, scrutiny_scans)
    values (p_user_id, p_date, p_delta, 0)
  on conflict (user_id, date)
    do update set sentences_used = public.daily_usage.sentences_used + excluded.sentences_used;
end;
$$;

revoke all on function public.add_daily_sentences(uuid, date, int) from public;

grant execute on function public.add_daily_sentences(uuid, date, int) to service_role;
