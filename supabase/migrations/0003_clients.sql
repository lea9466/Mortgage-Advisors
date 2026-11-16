-- Stage 2a: the client registry. Each client is entered once per adviser account
-- and later linked to one or more mortgage cases.
--
-- The ID number is never stored in plain text. The server encrypts it
-- (id_number_encrypted), keeps a keyed fingerprint for exact search
-- (id_number_index) and the last four digits for display (id_number_last4).

create extension if not exists pg_trgm with schema extensions;

create type public.marital_status as enum ('single', 'married', 'divorced', 'widowed', 'separated');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,

  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null check (char_length(last_name) between 1 and 60),
  full_name text generated always as (first_name || ' ' || last_name) stored,

  id_number_encrypted text check (char_length(id_number_encrypted) <= 200),
  id_number_index text check (char_length(id_number_index) <= 100),
  id_number_last4 text check (id_number_last4 ~ '^[0-9]{4}$'),
  id_issue_date date,
  id_expiry_date date,

  birth_date date,
  phone text check (phone ~ '^\+?[0-9]{9,14}$'),
  phone_alt text check (phone_alt ~ '^\+?[0-9]{9,14}$'),
  email text check (char_length(email) <= 254),

  marital_status public.marital_status,
  has_other_citizenship boolean not null default false,
  other_citizenship text check (char_length(other_citizenship) <= 60),
  children_birth_years smallint[] not null default '{}'
    check (cardinality(children_birth_years) <= 20
           and 1950 <= all (children_birth_years)
           and 2100 >= all (children_birth_years)),

  city text check (char_length(city) <= 80),
  street text check (char_length(street) <= 80),
  house_number text check (char_length(house_number) <= 10),

  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The three ID columns are written together or not at all.
  check (
    (id_number_encrypted is null) = (id_number_index is null)
    and (id_number_index is null) = (id_number_last4 is null)
  ),
  check (id_expiry_date is null or id_issue_date is null or id_expiry_date > id_issue_date)
);

-- One client per ID number within an adviser's account.
create unique index clients_org_id_number_idx
  on public.clients (organization_id, id_number_index)
  where id_number_index is not null;
create index clients_org_name_idx on public.clients (organization_id, last_name, first_name);
create index clients_full_name_trgm_idx on public.clients using gin (full_name extensions.gin_trgm_ops);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
revoke all on public.clients from anon;

create policy "members read clients of their organization"
  on public.clients for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));

create policy "members add clients to their organization"
  on public.clients for insert to authenticated
  with check (
    public.has_mfa()
    and created_by = (select auth.uid())
    and public.is_org_member(organization_id)
  );

create policy "members update clients of their organization"
  on public.clients for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));

-- No delete policy: clients are not deleted from the app. Removing a client
-- (for example on a privacy request) is a deliberate administrative step.
