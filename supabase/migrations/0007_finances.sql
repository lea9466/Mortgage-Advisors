-- Stage 3: incomes, liabilities and bank accounts.
--
-- These belong to a borrower *in a specific case*, not to the client card, so a
-- new case can hold updated figures without changing an old one. Every row
-- points at the (case, client) pair in case_borrowers. That pair cannot be
-- removed while it still has financial rows, so figures are never lost by
-- removing a borrower by mistake.
-- Amounts are whole shekels.

create type public.income_kind as enum ('employee', 'self_employed', 'kollel', 'allowance', 'other');
create type public.liability_kind as enum ('bank_loan', 'car_loan', 'gemach', 'credit_card', 'mortgage', 'other');

create table public.case_incomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  case_id uuid not null,
  client_id uuid not null,
  kind public.income_kind not null,
  -- Employer, line of business, kollel name, allowance type or description, by kind.
  title text not null check (char_length(title) between 1 and 120),
  job_title text check (char_length(job_title) <= 80),
  seniority_months integer check (seniority_months between 0 and 720),
  monthly_amount bigint not null check (monthly_amount between 0 and 100000000),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (case_id, client_id) references public.case_borrowers (case_id, client_id) on delete restrict
);
create index case_incomes_case_idx on public.case_incomes (case_id);

create table public.case_liabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  case_id uuid not null,
  client_id uuid not null,
  kind public.liability_kind not null,
  lender text check (char_length(lender) <= 80),
  balance bigint check (balance between 0 and 10000000000),
  monthly_payment bigint not null check (monthly_payment between 0 and 100000000),
  remaining_months integer check (remaining_months between 0 and 600),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (case_id, client_id) references public.case_borrowers (case_id, client_id) on delete restrict
);
create index case_liabilities_case_idx on public.case_liabilities (case_id);

-- The account number is encrypted by the server; only the last 4 digits are readable.
create table public.case_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  case_id uuid not null,
  client_id uuid not null,
  bank text not null check (bank in (
    'hapoalim', 'leumi', 'mizrahi_tefahot', 'discount', 'first_international', 'jerusalem',
    'mercantile', 'massad', 'yahav', 'postal', 'one_zero', 'other'
  )),
  branch text check (branch ~ '^[0-9]{1,4}$'),
  account_number_encrypted text not null check (char_length(account_number_encrypted) <= 200),
  account_last4 text not null check (account_last4 ~ '^[0-9]{1,4}$'),
  is_joint boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (case_id, client_id) references public.case_borrowers (case_id, client_id) on delete restrict
);
create index case_bank_accounts_case_idx on public.case_bank_accounts (case_id);

-- Rows stay inside the case's account, and the account never changes after insert.
create function public.finance_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.case_id := old.case_id;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  if not exists (select 1 from public.cases c where c.id = new.case_id and c.organization_id = new.organization_id) then
    raise exception 'case belongs to another account' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger case_incomes_same_org before insert or update on public.case_incomes
  for each row execute function public.finance_same_org();
create trigger case_liabilities_same_org before insert or update on public.case_liabilities
  for each row execute function public.finance_same_org();
create trigger case_bank_accounts_same_org before insert or update on public.case_bank_accounts
  for each row execute function public.finance_same_org();

-- Row Level Security: members of the account read and edit; nobody else.
alter table public.case_incomes enable row level security;
alter table public.case_liabilities enable row level security;
alter table public.case_bank_accounts enable row level security;
revoke all on public.case_incomes, public.case_liabilities, public.case_bank_accounts from anon;

create policy "members read incomes" on public.case_incomes for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add incomes" on public.case_incomes for insert to authenticated
  with check (public.has_mfa() and created_by = (select auth.uid()) and public.is_org_member(organization_id));
create policy "members edit incomes" on public.case_incomes for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));
create policy "members delete incomes" on public.case_incomes for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));

create policy "members read liabilities" on public.case_liabilities for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add liabilities" on public.case_liabilities for insert to authenticated
  with check (public.has_mfa() and created_by = (select auth.uid()) and public.is_org_member(organization_id));
create policy "members edit liabilities" on public.case_liabilities for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));
create policy "members delete liabilities" on public.case_liabilities for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));

create policy "members read bank accounts" on public.case_bank_accounts for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add bank accounts" on public.case_bank_accounts for insert to authenticated
  with check (public.has_mfa() and created_by = (select auth.uid()) and public.is_org_member(organization_id));
create policy "members edit bank accounts" on public.case_bank_accounts for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));
create policy "members delete bank accounts" on public.case_bank_accounts for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
