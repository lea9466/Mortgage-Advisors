-- Fix: linking spouses lost the children of the second spouse.
--
-- link_spouses moved the children between households with an UPDATE, but
-- client_children had no update policy, so RLS silently moved nothing. The
-- old household was then deleted, and its children were deleted with it
-- (on delete cascade).
--
-- Three layers so this cannot happen again:
-- 1. members may update children (needed to move them between households);
-- 2. deleting a household that still has children is refused (restrict, not cascade);
-- 3. link_spouses checks that every child moved before deleting the old household.

create policy "members update children" on public.client_children for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));

alter table public.client_children
  drop constraint client_children_household_id_fkey,
  add constraint client_children_household_id_fkey
    foreign key (household_id) references public.households (id) on delete restrict;

create or replace function public.link_spouses(p_client uuid, p_spouse uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.clients%rowtype;
  b public.clients%rowtype;
  household uuid;
  left_behind integer;
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
    select count(*) into left_behind from public.client_children where household_id = b.household_id;
    if left_behind > 0 then
      raise exception 'children could not be moved' using errcode = '42501';
    end if;
    update public.clients set household_id = household where household_id = b.household_id;
    delete from public.households where id = b.household_id;
  end if;

  update public.clients set household_id = household, spouse_id = b.id where id = a.id;
  update public.clients set household_id = household, spouse_id = a.id where id = b.id;
end;
$$;
