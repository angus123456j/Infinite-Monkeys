-- Server-enforced trial quotas for Supabase anonymous users (5h epoch buckets).

create table public.anonymous_trial_window (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket_id bigint not null,
  rewrite_count int not null default 0,
  scrutiny_count int not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, bucket_id)
);

create index anonymous_trial_window_bucket_idx on public.anonymous_trial_window (bucket_id);

alter table public.anonymous_trial_window enable row level security;

revoke all on table public.anonymous_trial_window from public;

-- Caller must present JWT; only users with anonymous identity may consume.
create or replace function public.try_consume_anonymous_trial_rewrite(p_bucket_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  is_anon boolean;
  cur int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1 from auth.identities
    where user_id = auth.uid() and provider = 'anonymous'
  ) into is_anon;

  if not coalesce(is_anon, false) then
    raise exception 'not_anonymous_user';
  end if;

  select rewrite_count into cur
  from public.anonymous_trial_window
  where user_id = auth.uid() and bucket_id = p_bucket_id
  for update;

  if not found then
    insert into public.anonymous_trial_window (user_id, bucket_id, rewrite_count, scrutiny_count)
    values (auth.uid(), p_bucket_id, 1, 0);
    return true;
  end if;

  if cur >= 3 then
    return false;
  end if;

  update public.anonymous_trial_window
  set rewrite_count = cur + 1,
      updated_at = timezone('utc', now())
  where user_id = auth.uid() and bucket_id = p_bucket_id;
  return true;
end;
$$;

create or replace function public.try_consume_anonymous_trial_scrutiny(p_bucket_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  is_anon boolean;
  cur int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1 from auth.identities
    where user_id = auth.uid() and provider = 'anonymous'
  ) into is_anon;

  if not coalesce(is_anon, false) then
    raise exception 'not_anonymous_user';
  end if;

  select scrutiny_count into cur
  from public.anonymous_trial_window
  where user_id = auth.uid() and bucket_id = p_bucket_id
  for update;

  if not found then
    insert into public.anonymous_trial_window (user_id, bucket_id, rewrite_count, scrutiny_count)
    values (auth.uid(), p_bucket_id, 0, 1);
    return true;
  end if;

  if cur >= 1 then
    return false;
  end if;

  update public.anonymous_trial_window
  set scrutiny_count = cur + 1,
      updated_at = timezone('utc', now())
  where user_id = auth.uid() and bucket_id = p_bucket_id;
  return true;
end;
$$;

revoke all on function public.try_consume_anonymous_trial_rewrite(bigint) from public;
revoke all on function public.try_consume_anonymous_trial_scrutiny(bigint) from public;

grant execute on function public.try_consume_anonymous_trial_rewrite(bigint) to authenticated;
grant execute on function public.try_consume_anonymous_trial_scrutiny(bigint) to authenticated;
