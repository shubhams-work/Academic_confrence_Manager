-- =====================================================================
-- Stored panelist passwords
--
-- Supabase Auth keeps only a bcrypt hash, so a password can never be read
-- back. To let staff see a panelist's password in the app, the generated
-- password is also written here in readable form when the account is created
-- or reset.
--
-- This is deliberately not how passwords are normally handled: anyone who can
-- read this table learns every panelist's password, and so does anyone who
-- obtains a database dump. It is scoped as tightly as the feature allows:
--   * only staff (Organizing Chair / Session Incharge) can select from it;
--   * nobody can write to it through the API - rows are written only by the
--     edge functions, which use the service role and bypass RLS;
--   * it holds panelist accounts only, never staff accounts.
--
-- Passwords set outside the app (a panelist changing their own, or a reset
-- link) are NOT reflected here, so a row can be stale. The app labels it as
-- "last issued" rather than "current" for that reason.
-- =====================================================================

create table if not exists public.panelist_credentials (
  email       text primary key check (email = lower(email)),
  password    text not null,
  issued_at   timestamptz not null default now(),
  issued_by   uuid references public.profiles (id) on delete set null
);

alter table public.panelist_credentials enable row level security;

-- Staff can read; no insert/update/delete policy exists, so the only writer is
-- the service role used by the edge functions.
drop policy if exists panelist_credentials_select on public.panelist_credentials;
create policy panelist_credentials_select on public.panelist_credentials
  for select to authenticated
  using (public.is_staff());

revoke all on public.panelist_credentials from anon;
grant select on public.panelist_credentials to authenticated;
