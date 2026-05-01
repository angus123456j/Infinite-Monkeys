-- Anonymous users are identified by JWT claim `is_anonymous`, not by a row in
-- auth.identities (see https://supabase.com/docs/guides/auth/auth-anonymous).
-- The previous check against auth.identities caused RPC failures and 500s from
-- the rewrite edge function for all anonymous sessions.

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

  is_anon := coalesce((auth.jwt()->>'is_anonymous')::boolean, false);

  if not is_anon then
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

  is_anon := coalesce((auth.jwt()->>'is_anonymous')::boolean, false);

  if not is_anon then
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
