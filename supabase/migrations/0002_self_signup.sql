-- Self sign-up: an adviser who signed up and finished the second factor opens
-- their own account (organization) and becomes its owner.
--
-- Users still cannot insert into organizations or memberships directly. This
-- function is the only way in, and it allows exactly one account per user, so
-- nobody can attach themselves to another adviser's account.

create function public.create_my_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_name text := btrim(org_name);
  new_org uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.has_mfa() then
    raise exception 'second factor required' using errcode = '42501';
  end if;
  if clean_name is null or char_length(clean_name) not between 2 and 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;

  -- Serialize concurrent calls by the same user, then allow one account only.
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if exists (select 1 from public.memberships m where m.user_id = uid) then
    raise exception 'already has an account' using errcode = '23505';
  end if;

  insert into public.organizations (name) values (clean_name) returning id into new_org;
  insert into public.memberships (organization_id, user_id, role) values (new_org, uid, 'owner');
  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (new_org, uid, 'organization.create', 'organization', new_org::text);

  return new_org;
end;
$$;

revoke all on function public.create_my_organization(text) from public, anon;
grant execute on function public.create_my_organization(text) to authenticated;
