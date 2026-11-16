-- Stage 1 foundation: organizations (tenants), memberships, audit log, file registry.
-- Every table has Row Level Security. Every policy requires a completed second
-- factor (aal2) and membership in the row's organization.

-- ---------------------------------------------------------------------------
-- Organizations and memberships
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'member', 'support');

create table public.memberships (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- Helper functions used by policies
-- ---------------------------------------------------------------------------
create function public.has_mfa()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false);
$$;

-- security definer: policies on memberships call this, and it must read
-- memberships without triggering those same policies again.
create function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
  );
$$;

create function public.is_org_owner(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function public.has_mfa() from public, anon;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_org_owner(uuid) from public, anon;
grant execute on function public.has_mfa() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (char_length(action) between 1 and 80),
  entity_type text check (entity_type is null or char_length(entity_type) between 1 and 80),
  entity_id text check (entity_id is null or char_length(entity_id) between 1 and 80),
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 8192),
  created_at timestamptz not null default now()
);
create index audit_log_org_created_idx on public.audit_log (organization_id, created_at desc);

create function public.audit_log_block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_block_changes();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_block_changes();

-- ---------------------------------------------------------------------------
-- File registry: one row per stored object, vendor-neutral
-- ---------------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  storage_provider text not null check (storage_provider in ('supabase', 's3', 'local')),
  storage_key text not null unique check (char_length(storage_key) between 1 and 200),
  original_name text not null check (char_length(original_name) between 1 and 255),
  content_type text not null check (char_length(content_type) between 1 and 127),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  is_sensitive boolean not null default false,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index files_org_created_idx on public.files (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;
alter table public.files enable row level security;

revoke all on public.organizations, public.memberships, public.audit_log, public.files from anon;

-- Organizations and memberships are created by an administrator (SQL editor or
-- secret key). Signed-in users can only read their own.
create policy "members read their organization"
  on public.organizations for select to authenticated
  using (public.has_mfa() and public.is_org_member(id));

create policy "members read memberships of their organization"
  on public.memberships for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));

-- Audit log: members add entries in their own name; only owners read them.
-- No update or delete policy exists, and the triggers above block both anyway.
create policy "members append audit entries"
  on public.audit_log for insert to authenticated
  with check (
    public.has_mfa()
    and actor_id = (select auth.uid())
    and public.is_org_member(organization_id)
  );

create policy "owners read the audit log"
  on public.audit_log for select to authenticated
  using (public.has_mfa() and public.is_org_owner(organization_id));

-- Files: members of the organization only. Rows are never hard-deleted by users.
create policy "members read files of their organization"
  on public.files for select to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id));

create policy "members register files in their organization"
  on public.files for insert to authenticated
  with check (
    public.has_mfa()
    and uploaded_by = (select auth.uid())
    and public.is_org_member(organization_id)
  );

create policy "members update files of their organization"
  on public.files for update to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id))
  with check (public.has_mfa() and public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Private storage bucket. No storage policies are created on purpose: only the
-- server (secret key) reads and writes objects, after its own permission check.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('case-files', 'case-files', false, 26214400)
on conflict (id) do nothing;
