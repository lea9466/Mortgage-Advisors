-- Simpler children model (proposed by Lea, replaces households from 0008/0009):
-- * Every child belongs to the client who entered it, with a "shared" flag.
-- * A client's card shows their own children plus their spouse's shared children.
-- * Linking spouses only sets spouse_id: no child is moved or deleted.
-- * Shared children can be edited from either spouse's card.
-- * Unlinking copies the shared children to the other spouse, so neither loses them.

-- 1. Convert existing rows: household children become shared children of one
--    client in that household; personal children stay personal.
alter table public.client_children add column shared boolean not null default true;

update public.client_children ch
set client_id = (select min(c.id::text)::uuid from public.clients c where c.household_id = ch.household_id),
    shared = true
where ch.household_id is not null;

update public.client_children set shared = false where household_id is null;
delete from public.client_children where client_id is null;

-- 2. Remove the household structure.
alter table public.client_children drop constraint client_children_check;
alter table public.client_children drop column household_id;
alter table public.client_children alter column client_id set not null;

drop function public.set_client_children(uuid, smallint[], smallint[]);
drop function public.link_spouses(uuid, uuid);
drop function public.unlink_spouse(uuid);
drop function public.ensure_household(uuid);

alter table public.clients drop column household_id;
drop table public.households;

create index client_children_shared_idx on public.client_children (client_id) where shared;

-- 3. Functions for the new model.

-- Saves the children shown in one client's form. The shared ones are the
-- family's shared children (whoever entered them), so the spouse's shared rows
-- are replaced too and all shared children end up owned by this client.
create function public.set_client_children(p_client uuid, p_shared smallint[], p_personal smallint[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org uuid;
  partner uuid;
begin
  if cardinality(p_shared) + cardinality(p_personal) > 20 then
    raise exception 'too many children' using errcode = '22023';
  end if;
  select organization_id, spouse_id into org, partner from public.clients where id = p_client;
  if org is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  delete from public.client_children where client_id = p_client;
  if partner is not null then
    delete from public.client_children where client_id = partner and shared;
  end if;
  insert into public.client_children (organization_id, client_id, birth_year, shared)
    select org, p_client, unnest(p_shared), true;
  insert into public.client_children (organization_id, client_id, birth_year, shared)
    select org, p_client, unnest(p_personal), false;
end;
$$;

-- Links two clients as spouses. Nothing else changes.
create function public.link_spouses(p_client uuid, p_spouse uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.clients%rowtype;
  b public.clients%rowtype;
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
  update public.clients set spouse_id = b.id where id = a.id;
  update public.clients set spouse_id = a.id where id = b.id;
end;
$$;

-- Unlinks spouses. Each gets a copy of the other's shared children, so both
-- keep all the children they shared. Personal children are not copied.
create function public.unlink_spouse(p_client uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.clients%rowtype;
  own_shared smallint[];
  spouse_shared smallint[];
begin
  select * into a from public.clients where id = p_client;
  if a.id is null or a.spouse_id is null then
    return;
  end if;

  -- Read both lists first, then copy each to the other side.
  select coalesce(array_agg(birth_year), '{}') into own_shared
    from public.client_children where client_id = a.id and shared;
  select coalesce(array_agg(birth_year), '{}') into spouse_shared
    from public.client_children where client_id = a.spouse_id and shared;

  insert into public.client_children (organization_id, client_id, birth_year, shared)
    select a.organization_id, a.id, unnest(spouse_shared), true;
  insert into public.client_children (organization_id, client_id, birth_year, shared)
    select a.organization_id, a.spouse_id, unnest(own_shared), true;

  update public.clients set spouse_id = null where id = a.spouse_id;
  update public.clients set spouse_id = null where id = a.id;
end;
$$;

revoke all on function public.set_client_children(uuid, smallint[], smallint[]) from public, anon;
revoke all on function public.link_spouses(uuid, uuid) from public, anon;
revoke all on function public.unlink_spouse(uuid) from public, anon;
grant execute on function public.set_client_children(uuid, smallint[], smallint[]) to authenticated;
grant execute on function public.link_spouses(uuid, uuid) to authenticated;
grant execute on function public.unlink_spouse(uuid) to authenticated;
