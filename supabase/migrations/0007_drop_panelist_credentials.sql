-- =====================================================================
-- Drop the stored panelist passwords
--
-- Panelists no longer receive a generated password. bulk_create_members now
-- calls inviteUserByEmail, Supabase mails a one-time link, and each panelist
-- chooses their own password on the app's "Set a new password" screen. Staff
-- who need to get someone in issue a fresh one-time link instead
-- (panelist_signin_link), so there is nothing left to read out of this table.
--
-- That removes the tradeoff 0005 documented: readable passwords sitting in a
-- table that any staff account - or any database dump - could be read from.
--
-- Dropping it also drops its RLS policy and grants.
-- =====================================================================

drop table if exists public.panelist_credentials;
