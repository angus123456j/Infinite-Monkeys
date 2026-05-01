-- Per-minute burst limits for edge functions (invoked with service_role only).

create table public.rate_limit_minute (
  subject_kind text not null check (subject_kind = any (array['user'::text, 'ip'::text])),
  subject_id text not null,
  bucket text not null,
  minute timestamptz not null,
  count int not null default 1,
  constraint rate_limit_minute_pkey primary key (subject_kind, subject_id, bucket, minute)
);

create index rate_limit_minute_minute_idx on public.rate_limit_minute (minute);

alter table public.rate_limit_minute enable row level security;

-- No policies: only service_role / table owner bypass; direct anon/authenticated access denied.

revoke all on table public.rate_limit_minute from public;

-- Atomic burst allow/deny within the current UTC minute (row-locked increment).
create or replace function public.consume_rate_limit_burst(
  p_subject_kind text,
  p_subject_id text,
  p_bucket text,
  p_limit_per_minute int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  m timestamptz := date_trunc('minute', timezone('utc', now()));
  c int;
begin
  if p_subject_kind not in ('user', 'ip') or p_subject_id is null or length(trim(p_subject_id)) < 1 then
    raise exception 'invalid subject';
  end if;
  if p_bucket is null or length(trim(p_bucket)) < 1 then
    raise exception 'invalid bucket';
  end if;
  if p_limit_per_minute is null or p_limit_per_minute < 1 then
    raise exception 'invalid limit';
  end if;

  loop
    select r.count into c from public.rate_limit_minute r
      where r.subject_kind = p_subject_kind
        and r.subject_id = p_subject_id
        and r.bucket = p_bucket
        and r.minute = m
      for update;
    if found then
      exit;
    end if;
    begin
      insert into public.rate_limit_minute (subject_kind, subject_id, bucket, minute, count)
      values (p_subject_kind, p_subject_id, p_bucket, m, 1);
      return true;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  if c >= p_limit_per_minute then
    return false;
  end if;

  update public.rate_limit_minute set count = c + 1
    where subject_kind = p_subject_kind
      and subject_id = p_subject_id
      and bucket = p_bucket
      and minute = m;
  return true;
end;
$$;

comment on function public.consume_rate_limit_burst(text, text, text, int) is
  'Called from Edge (service_role). Returns false when burst limit exceeded for current UTC minute.';

grant execute on function public.consume_rate_limit_burst(text, text, text, int) to service_role;

revoke execute on function public.consume_rate_limit_burst(text, text, text, int) from public;
