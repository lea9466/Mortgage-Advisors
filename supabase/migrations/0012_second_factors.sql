-- More ways to complete the second sign-in step (requested 2026-11-21):
-- * the authenticator app (Supabase TOTP, as before, gives aal2);
-- * a one-time code sent by email;
-- * a computer remembered for 30 days after one of the above.
--
-- Supabase's own MFA only knows TOTP and phone, so email codes and remembered
-- computers are recorded here, per sign-in session. has_mfa(), which every RLS
-- policy uses, accepts either an aal2 session or a session recorded here.
--
-- Only the server (secret key) writes these tables: they have RLS enabled and
-- no policies at all, so a signed-in user cannot mark their own session as verified.

create table public.mfa_sessions (
  -- Deleting the sign-in session (sign out, expiry) removes the verification with it.
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  method text not null check (method in ('email', 'trusted_device')),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.mfa_email_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references auth.sessions (id) on delete cascade,
  code_hash text not null,
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index mfa_email_codes_user_idx on public.mfa_email_codes (user_id, created_at desc);

create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Only a hash of the device's secret is stored; the secret itself lives in an httpOnly cookie.
  token_hash text not null unique,
  label text check (char_length(label) <= 200),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null
);
create index trusted_devices_user_idx on public.trusted_devices (user_id);

alter table public.mfa_sessions enable row level security;
alter table public.mfa_email_codes enable row level security;
alter table public.trusted_devices enable row level security;
revoke all on public.mfa_sessions, public.mfa_email_codes, public.trusted_devices from anon, authenticated;

-- The rule every policy relies on: the second step is done for this session.
-- security definer: it must read mfa_sessions, which users cannot read.
create or replace function public.has_mfa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
      or exists (
        select 1
        from public.mfa_sessions s
        where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
          and s.user_id = (select auth.uid())
          and s.expires_at > now()
      );
$$;

revoke all on function public.has_mfa() from public, anon;
grant execute on function public.has_mfa() to authenticated;
