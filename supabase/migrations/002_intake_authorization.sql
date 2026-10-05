-- Access is granted explicitly by a database administrator. No membership is
-- inferred from signup metadata, email domains, or a client-supplied tenant ID.
begin;

create table public.intake_tenant_members (
  tenant_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (tenant_id, user_id)
);
alter table public.intake_tenant_members enable row level security;
revoke all on public.intake_tenant_members from anon, authenticated;
grant select on public.intake_tenant_members to authenticated;
create policy "members_read_own" on public.intake_tenant_members
  for select to authenticated using (user_id = auth.uid());

drop policy "authenticated_manage_intake" on public.intake;
create policy "members_manage_intake" on public.intake
  for all to authenticated
  using (exists (select 1 from public.intake_tenant_members m
    where m.user_id = auth.uid() and m.tenant_id = intake.tenant_id))
  with check (exists (select 1 from public.intake_tenant_members m
    where m.user_id = auth.uid() and m.tenant_id = intake.tenant_id));

-- TRUNCATE bypasses RLS; do not preserve the old GRANT ALL.
revoke all on public.clients from authenticated;
grant select, insert, update, delete on public.clients to authenticated;

drop policy "authenticated_manage_clients" on public.clients;
create policy "members_manage_clients" on public.clients
  for all to authenticated
  using (exists (select 1 from public.intake_tenant_members m
    where m.user_id = auth.uid() and m.tenant_id = clients.tenant_id))
  with check (exists (select 1 from public.intake_tenant_members m
    where m.user_id = auth.uid() and m.tenant_id = clients.tenant_id)
    and (intake_id is null or exists (select 1 from public.intake i
      where i.id = clients.intake_id and i.tenant_id = clients.tenant_id)));

-- Stop rather than silently delete data if previous conversions already made duplicates.
create unique index clients_one_per_intake on public.clients(intake_id);

-- Runs with the caller's JWT/RLS. One transaction and row lock make retries and
-- concurrent conversions return the original client without overwriting edits.
create function public.convert_intake(
  p_intake_id uuid, p_extra_data jsonb default '{}'::jsonb, p_notes text default ''
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  source public.intake%rowtype;
  client_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_extra_data is null or jsonb_typeof(p_extra_data) <> 'object' then
    raise exception 'extra_data must be an object' using errcode = '22023';
  end if;
  select * into source from public.intake where id = p_intake_id for update;
  if not found then
    raise exception 'Intake unavailable' using errcode = '42501';
  end if;
  select id into client_id from public.clients where intake_id = source.id;
  if client_id is null then
    insert into public.clients(tenant_id, intake_id, name, email, phone, data, notes)
      values (source.tenant_id, source.id, source.name, source.email, source.phone,
        coalesce(source.data, '{}'::jsonb) || p_extra_data, p_notes)
      returning id into client_id;
  end if;
  update public.intake set status = 'done' where id = source.id;
  return client_id;
end;
$$;
revoke all on function public.convert_intake(uuid, jsonb, text) from public, anon;
grant execute on function public.convert_intake(uuid, jsonb, text) to authenticated;
commit;
