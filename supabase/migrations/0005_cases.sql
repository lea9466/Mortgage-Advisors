-- Stage 2b: mortgage cases, the borrowers in each case, and the insights centre.
--
-- A case belongs to one adviser account. Borrowers are links to clients in the
-- registry, so a client is entered once and can appear in many cases.
-- Amounts are whole shekels.

create type public.case_stage as enum (
  'first_meeting',
  'collecting_documents',
  'submitted_to_banks',
  'approval_in_principle',
  'negotiating_offers',
  'signatures',
  'execution',
  'cancelled'
);

create type public.mortgage_purpose as enum (
  'purchase',
  'refinance',
  'renovation',
  'debt_consolidation',
  'any_purpose',
  'reverse_mortgage'
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  case_year smallint not null,
  case_seq integer not null check (case_seq > 0),
  purpose public.mortgage_purpose not null,
  stage public.case_stage not null default 'first_meeting',

  -- Every case shows a property value. For a purchase it is the contract price.
  requested_amount bigint check (requested_amount between 0 and 10000000000),
  property_value bigint check (property_value between 0 and 10000000000),

  -- Purchase only.
  contract_price bigint check (contract_price between 0 and 10000000000),
  equity bigint check (equity between 0 and 10000000000),
  hand text check (hand in ('first', 'second')),
  apartment_class text check (apartment_class in ('single', 'replacement', 'investment')),

  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, case_year, case_seq)
);
create index cases_org_stage_idx on public.cases (organization_id, stage, updated_at desc);

-- Case numbers run per account per year: 2026-1, 2026-2 ...
create function public.set_case_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.case_year := extract(year from now() at time zone 'Asia/Jerusalem')::smallint;
  perform pg_advisory_xact_lock(hashtext(new.organization_id::text || ':' || new.case_year::text));
  select coalesce(max(c.case_seq), 0) + 1 into new.case_seq
  from public.cases c
  where c.organization_id = new.organization_id and c.case_year = new.case_year;
  return new;
end;
$$;

create trigger cases_set_number
  before insert on public.cases
  for each row execute function public.set_case_number();

create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

-- The case number never changes after it is given.
create function public.cases_keep_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.case_year := old.case_year;
  new.case_seq := old.case_seq;
  new.organization_id := old.organization_id;
  new.created_by := old.created_by;
  return new;
end;
$$;

create trigger cases_keep_number
  before update on public.cases
  for each row execute function public.cases_keep_number();

create table public.case_borrowers (
  case_id uuid not null references public.cases (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (case_id, client_id)
);
create index case_borrowers_client_idx on public.case_borrowers (client_id);

-- A borrower link must stay inside one account: the case and the client both
-- belong to the organization written on the link.
create function public.case_borrower_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cases c where c.id = new.case_id and c.organization_id = new.organization_id)
     or not exists (select 1 from public.clients cl where cl.id = new.client_id and cl.organization_id = new.organization_id) then
    raise exception 'case and client must belong to the same account' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger case_borrowers_same_org
  before insert or update on public.case_borrowers
  for each row execute function public.case_borrower_same_org();

-- Opens a case with its first borrower in one transaction, so a case never
-- exists without a borrower. Runs as the caller: RLS applies to both inserts.
create function public.open_case(p_purpose public.mortgage_purpose, p_client uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org uuid;
  new_case uuid;
begin
  select cl.organization_id into org from public.clients cl where cl.id = p_client;
  if org is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;
  insert into public.cases (organization_id, purpose, created_by)
  values (org, p_purpose, (select auth.uid()))
  returning id into new_case;
  insert into public.case_borrowers (case_id, client_id, organization_id, position)
  values (new_case, p_client, org, 0);
  return new_case;
end;
$$;

revoke all on function public.open_case(public.mortgage_purpose, uuid) from public, anon;
grant execute on function public.open_case(public.mortgage_purpose, uuid) to authenticated;

-- Lessons learned while working on cases, e.g. how a bank treats new income.
-- Written from a case, collected in one place. Never put client details here.
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  body text not null check (char_length(body) between 2 and 1000),
  bank text check (bank in ('hapoalim', 'leumi', 'mizrahi_tefahot', 'discount', 'first_international', 'jerusalem', 'mercantile', 'other')),
  source_case_id uuid references public.cases (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index insights_org_created_idx on public.insights (organization_id, created_at desc);

-- Row Level Security
alter table public.cases enable row level security;
alter table public.case_borrowers enable row level security;
alter table public.insights enable row level security;
revoke all on public.cases, public.case_borrowers, public.insights from anon;

create policy "members read cases" on public.cases for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members open cases" on public.cases for insert to authenticated
  with check (public.has_mfa() and created_by = (select auth.uid()) and public.is_org_member(organization_id));
create policy "members update cases" on public.cases for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));
-- No delete policy for cases: a case that did not go ahead is marked "cancelled".

create policy "members read borrowers" on public.case_borrowers for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add borrowers" on public.case_borrowers for insert to authenticated
  with check (public.has_mfa() and public.is_org_member(organization_id));
-- Removing a borrower from a case does not delete the client.
create policy "members remove borrowers" on public.case_borrowers for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));

create policy "members read insights" on public.insights for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add insights" on public.insights for insert to authenticated
  with check (public.has_mfa() and created_by = (select auth.uid()) and public.is_org_member(organization_id));
create policy "members remove insights" on public.insights for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
