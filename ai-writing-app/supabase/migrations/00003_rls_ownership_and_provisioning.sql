-- Tighten RLS on user data tables; replace allow_all policies.
-- Provision profiles + subscriptions for every new auth user (incl. OAuth).

-- ——— documents ———
drop policy if exists "allow_all_documents" on public.documents;

create policy "documents_select_own" on public.documents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "documents_insert_own" on public.documents
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "documents_update_own" on public.documents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "documents_delete_own" on public.documents
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ——— contexts ———
drop policy if exists "allow_all_contexts" on public.contexts;

create policy "contexts_select_own" on public.contexts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "contexts_insert_own" on public.contexts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "contexts_update_own" on public.contexts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "contexts_delete_own" on public.contexts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ——— monkey_agents: own rows + readable templates; only service role can mutate templates ———
drop policy if exists "allow_all_monkey_agents" on public.monkey_agents;

create policy "monkey_agents_select_own_or_template" on public.monkey_agents
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or is_template = true
  );

create policy "monkey_agents_insert_owned_copy" on public.monkey_agents
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and is_template = false
  );

create policy "monkey_agents_update_owned_non_template" on public.monkey_agents
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and is_template = false
  )
  with check (
    user_id = (select auth.uid())
    and is_template = false
  );

create policy "monkey_agents_delete_owned_non_template" on public.monkey_agents
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and is_template = false
  );

-- ——— Auto-provision profile + free subscription (email + OAuth) ———
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  profile_email text;
begin
  profile_email := coalesce(
    nullif(btrim(new.email::text), ''),
    nullif(btrim(new.raw_user_meta_data->>'email'), ''),
    'user+' || new.id::text || '@noemail.app'
  );

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    profile_email,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '')
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, tier)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
