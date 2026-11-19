-- Spouses and children (decided by the adviser):
-- * Two clients can be linked as spouses. The link is two-way.
-- * Children belong to a family (household) shared by the spouses, so they are
--   entered once and show on both cards.
-- * A child can also belong to one spouse only (e.g. from an earlier marriage).
--
-- A client's children = the children of their household + their own children.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.clients
  add column household_id uuid references public.households (id) on delete set null,
  add column spouse_id uuid references public.clients (id) on delete set null,
  add constraint clients_not_own_spouse check (spouse_id is null or spouse_id <> id);
create index clients_household_idx on public.clients (household_id);
create unique index clients_spouse_idx on public.clients (spouse_id) where spouse_id is not null;

create table public.client_children (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  household_id uuid references public.households (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  birth_year smallint not null check (birth_year between 1950 and 2100),
  created_at timestamptz not null default now(),
  -- Shared (household) or one parent's own, never both and never neither.
  check ((household_id is null) <> (client_id is null))
);
create index client_children_household_idx on public.client_children (household_id);
create index client_children_client_idx on public.client_children (client_id);

-- Move the children already entered into the new structure, then drop the old column.
do $$
declare
  rec record;
  new_household uuid;
begin
  for rec in
    select id, organization_id, children_birth_years from public.clients where cardinality(children_birth_years) > 0
  loop
    insert into public.households (organization_id) values (rec.organization_id) returning id into new_household;
    update public.clients set household_id = new_household where id = rec.id;
    insert into public.client_children (organization_id, household_id, birth_year)
    select rec.organization_id, new_household, unnest(rec.children_birth_years);
  end loop;
end;
$$;

alter table public.clients drop column children_birth_years;

-- Row Level Security
alter table public.households enable row level security;
alter table public.client_children enable row level security;
revoke all on public.households, public.client_children from anon;

create policy "members read households" on public.households for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add households" on public.households for insert to authenticated
  with check (public.has_mfa() and public.is_org_member(organization_id));
create policy "members delete households" on public.households for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));

create policy "members read children" on public.client_children for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add children" on public.client_children for insert to authenticated
  with check (public.has_mfa() and public.is_org_member(organization_id));
create policy "members delete children" on public.client_children for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));

-- The household a client's shared children live in, created on first use.
create function public.ensure_household(p_client uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org uuid;
  current_household uuid;
begin
  select organization_id, household_id into org, current_household from public.clients where id = p_client;
  if org is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;
  if current_household is null then
    insert into public.households (organization_id) values (org) returning id into current_household;
    update public.clients set household_id = current_household where id = p_client;
  end if;
  return current_household;
end;
$$;

-- Replaces a client's children in one step: shared ones go to the household
-- (and so also show on the spouse), personal ones stay with this client.
create function public.set_client_children(p_client uuid, p_shared smallint[], p_personal smallint[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org uuid;
  household uuid;
begin
  if cardinality(p_shared) + cardinality(p_personal) > 20 then
    raise exception 'too many children' using errcode = '22023';
  end if;
  select organization_id into org from public.clients where id = p_client;
  if org is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;
  household := public.ensure_household(p_client);

  delete from public.client_children where household_id = household;
  delete from public.client_children where client_id = p_client;
  insert into public.client_children (organization_id, household_id, birth_year)
    select org, household, unnest(p_shared);
  insert into public.client_children (organization_id, client_id, birth_year)
    select org, p_client, unnest(p_personal);
end;
$$;

-- Links two clients as spouses. The second one joins the first one's household;
-- shared children both had already entered are moved together, and the adviser
-- is asked to check for duplicates.
create function public.link_spouses(p_client uuid, p_spouse uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.clients%rowtype;
  b public.clients%rowtype;
  household uuid;
begin
  select * into a from public.clients where id = p_client;
  select * into b from public.clients where id = p_spouse;
  if a.id is null or b.id is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;
  if a.id = b.id or a.organization_id <> b.organization_id then
    raise exception 'cannot link these clients' using errcode = '22023';
  end if;
  if (a.spouse_id is not null and a.spouse_id <> b.id) or (b.spouse_id is not null and b.spouse_id <> a.id) then
    raise exception 'already linked to someone else' using errcode = '23505';
  end if;

  household := public.ensure_household(a.id);
  if b.household_id is not null and b.household_id <> household then
    update public.client_children set household_id = household where household_id = b.household_id;
    delete from public.households where id = b.household_id;
  end if;

  update public.clients set household_id = household, spouse_id = b.id where id = a.id;
  update public.clients set household_id = household, spouse_id = a.id where id = b.id;
end;
$$;

-- Unlinks spouses. Each keeps a copy of the shared children in their own household.
create function public.unlink_spouse(p_client uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.clients%rowtype;
  new_household uuid;
begin
  select * into a from public.clients where id = p_client;
  if a.id is null or a.spouse_id is null then
    return;
  end if;
  insert into public.households (organization_id) values (a.organization_id) returning id into new_household;
  insert into public.client_children (organization_id, household_id, birth_year)
    select organization_id, new_household, birth_year from public.client_children where household_id = a.household_id;
  update public.clients set spouse_id = null where id = a.spouse_id;
  update public.clients set spouse_id = null, household_id = new_household where id = a.id;
end;
$$;

revoke all on function public.ensure_household(uuid) from public, anon;
revoke all on function public.set_client_children(uuid, smallint[], smallint[]) from public, anon;
revoke all on function public.link_spouses(uuid, uuid) from public, anon;
revoke all on function public.unlink_spouse(uuid) from public, anon;
grant execute on function public.ensure_household(uuid) to authenticated;
grant execute on function public.set_client_children(uuid, smallint[], smallint[]) to authenticated;
grant execute on function public.link_spouses(uuid, uuid) to authenticated;
grant execute on function public.unlink_spouse(uuid) to authenticated;
