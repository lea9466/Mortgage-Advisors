-- Stage 4b: tracking the documents a case needs.
--
-- The basic list lives in the app's code. Each adviser can add items of their
-- own (document_requirements); those appear in the list of every open case.
-- A case's list (case_requirements) is a copy, one row per item, or per item
-- and borrower, with a status. Items are never deleted from a case's list:
-- "not needed" is a status, so opening the case never brings them back.

create type public.requirement_status as enum ('missing', 'received', 'approved', 'needs_fix', 'not_needed');

-- The adviser's own items, added to every list.
create table public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  category public.document_category not null default 'other',
  -- One per borrower (pay slips) or one for the whole case (purchase contract).
  per_borrower boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index document_requirements_org_idx on public.document_requirements (organization_id, created_at);

alter table public.document_requirements enable row level security;
revoke all on public.document_requirements from anon;

create policy "members read requirement templates" on public.document_requirements for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add requirement templates" on public.document_requirements for insert to authenticated
  with check (public.has_mfa() and created_by = (select auth.uid()) and public.is_org_member(organization_id));
create policy "members edit requirement templates" on public.document_requirements for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));
-- Removing an item stops it from being added to more cases; lists that already have it keep their copy.
create policy "members remove requirement templates" on public.document_requirements for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));

-- A case's list.
create table public.case_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  case_id uuid not null references public.cases (id) on delete restrict,
  -- Empty: for the whole case. Otherwise one of the case's borrowers.
  client_id uuid,
  -- Where the item came from: 'base:<key>', 'custom:<template id>' or 'manual:<id>'.
  -- The same item is added once per case and borrower.
  template_key text not null check (char_length(template_key) between 1 and 100),
  title text not null check (char_length(title) between 1 and 200),
  category public.document_category not null default 'other',
  status public.requirement_status not null default 'missing',
  note text check (char_length(note) <= 300),
  document_id uuid references public.case_documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete restrict,
  unique nulls not distinct (case_id, client_id, template_key),
  -- When a borrower leaves the case, their items go with them.
  foreign key (case_id, client_id) references public.case_borrowers (case_id, client_id) on delete cascade
);
create index case_requirements_case_idx on public.case_requirements (case_id);

-- The item, its case and its linked document stay in one account and one case.
create function public.case_requirement_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.case_id := old.case_id;
    new.client_id := old.client_id;
    new.template_key := old.template_key;
    new.updated_at := now();
  end if;
  if not exists (select 1 from public.cases c where c.id = new.case_id and c.organization_id = new.organization_id) then
    raise exception 'requirement belongs to another account' using errcode = '23514';
  end if;
  if new.document_id is not null and not exists (
    select 1 from public.case_documents d where d.id = new.document_id and d.case_id = new.case_id
  ) then
    raise exception 'linked document is not in this case' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger case_requirements_same_org
  before insert or update on public.case_requirements
  for each row execute function public.case_requirement_same_org();

alter table public.case_requirements enable row level security;
revoke all on public.case_requirements from anon;

create policy "members read case requirements" on public.case_requirements for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add case requirements" on public.case_requirements for insert to authenticated
  with check (public.has_mfa() and public.is_org_member(organization_id));
-- Status, note and linked document. No delete policy: "not needed" is a status.
create policy "members edit case requirements" on public.case_requirements for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));
