-- Stage 4a: documents in a case.
--
-- The file itself is a row in `files` (vendor-neutral key, checked type, hash).
-- A case document puts that file in a case, with a title, a category and,
-- optionally, the borrower it belongs to. Documents are never hard-deleted from
-- the app: "delete" hides them (deleted_at), the original file stays.
-- Edited copies (stage 4d) will point at their source through parent_document_id.

create type public.document_category as enum (
  'identity',
  'income',
  'bank_statements',
  'property',
  'liabilities',
  'bank_approvals',
  'medical',
  'other'
);

create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  case_id uuid not null references public.cases (id) on delete restrict,
  file_id uuid not null unique references public.files (id) on delete restrict,
  client_id uuid,
  category public.document_category not null default 'other',
  title text not null check (char_length(title) between 1 and 200),
  parent_document_id uuid references public.case_documents (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- When a borrower is named, it must be a borrower of this case.
  foreign key (case_id, client_id) references public.case_borrowers (case_id, client_id) on delete restrict
);
create index case_documents_case_idx on public.case_documents (case_id, created_at desc) where deleted_at is null;

-- The document, its file and its case stay in one account; case and file never change.
create function public.case_document_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.case_id := old.case_id;
    new.file_id := old.file_id;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  if not exists (select 1 from public.cases c where c.id = new.case_id and c.organization_id = new.organization_id)
     or not exists (select 1 from public.files f where f.id = new.file_id and f.organization_id = new.organization_id) then
    raise exception 'document belongs to another account' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger case_documents_same_org
  before insert or update on public.case_documents
  for each row execute function public.case_document_same_org();

alter table public.case_documents enable row level security;
revoke all on public.case_documents from anon;

create policy "members read documents" on public.case_documents for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members add documents" on public.case_documents for insert to authenticated
  with check (public.has_mfa() and created_by = (select auth.uid()) and public.is_org_member(organization_id));
-- Rename, recategorize, or hide (deleted_at). No delete policy.
create policy "members edit documents" on public.case_documents for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));
