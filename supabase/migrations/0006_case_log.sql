-- Case log ("תיעוד והיסטוריית טיפול"): notes, calls, meetings and actions in a
-- case, newest first. The adviser writes entries; the app also records events
-- such as a stage change (kind 'system').
--
-- Entries are append-only, like a paper file: no update or delete policy, and
-- triggers block both, so the history of a case can be trusted.

create type public.case_log_kind as enum (
  'note',
  'client_call',
  'bank_call',
  'meeting',
  'action',
  'important',
  'system'
);

create table public.case_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  case_id uuid not null references public.cases (id) on delete restrict,
  kind public.case_log_kind not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index case_log_case_created_idx on public.case_log (case_id, created_at desc);
create index case_log_body_trgm_idx on public.case_log using gin (body extensions.gin_trgm_ops);

-- The entry must be written into a case of the same account.
create function public.case_log_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cases c where c.id = new.case_id and c.organization_id = new.organization_id) then
    raise exception 'case belongs to another account' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger case_log_same_org
  before insert on public.case_log
  for each row execute function public.case_log_same_org();

create function public.case_log_block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'case_log is append-only';
end;
$$;

create trigger case_log_no_update_delete
  before update or delete on public.case_log
  for each row execute function public.case_log_block_changes();

-- A new entry marks the case as updated, so the case list shows recent work first.
create function public.case_log_touch_case()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.cases set updated_at = now() where id = new.case_id;
  return null;
end;
$$;

create trigger case_log_touch_case
  after insert on public.case_log
  for each row execute function public.case_log_touch_case();

alter table public.case_log enable row level security;
revoke all on public.case_log from anon;

create policy "members read the case log" on public.case_log for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));
create policy "members write to the case log" on public.case_log for insert to authenticated
  with check (public.has_mfa() and created_by = (select auth.uid()) and public.is_org_member(organization_id));
