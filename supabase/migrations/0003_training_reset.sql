-- =====================================================================
-- Training reset ("dry run" mode)
--
-- A user holding profiles.can_reset_data may wipe the event's working data
-- in one call, so the same database can be used for a rehearsal and then
-- handed back clean. Papers and authors survive: only the things produced
-- during an event are cleared.
--
-- Access is a per-user flag, not a role: the Organizing Chair grants it from
-- the Staff screen before the rehearsal and revokes it before the real event.
-- The RPC itself re-checks the flag, so hiding the button is not the only
-- defence, and every run is recorded in reset_log.
-- =====================================================================

alter table public.profiles
  add column if not exists can_reset_data boolean not null default false;

create table if not exists public.reset_log (
  id              uuid primary key default gen_random_uuid(),
  performed_by    uuid references public.profiles (id) on delete set null,
  performed_email text not null,
  performed_at    timestamptz not null default now(),
  evaluations     int not null,
  panels          int not null,
  panel_members   int not null,
  review_scores   int not null,
  tracks_reopened int not null
);

alter table public.reset_log enable row level security;

drop policy if exists reset_log_select on public.reset_log;
create policy reset_log_select on public.reset_log for select to authenticated
  using (public.is_chair() or performed_by = auth.uid());

-- ---------- Helper ----------
create or replace function public.can_reset()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select can_reset_data from public.profiles where id = auth.uid()), false)
$$;

-- ---------- Grant / revoke the flag (Organizing Chair only) ----------
create or replace function public.set_reset_access(p_email text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.is_chair() then
    raise exception 'Only the Organizing Chair can change reset access' using errcode = '42501';
  end if;
  update public.profiles set can_reset_data = coalesce(p_enabled, false) where email = v_email;
  if not found then
    raise exception 'No account with email % has signed up yet', v_email;
  end if;
end $$;

-- ---------- The reset ----------
-- p_confirm must be exactly 'RESET TRAINING DATA'; the phrase is checked
-- server-side so a stray click or a replayed request cannot wipe anything.
create or replace function public.reset_training_data(p_confirm text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_evals   int;
  v_panels  int;
  v_members int;
  v_reviews int;
  v_tracks  int;
  v_email   text;
begin
  if not public.can_reset() then
    raise exception 'You do not have permission to reset event data' using errcode = '42501';
  end if;
  if coalesce(p_confirm, '') <> 'RESET TRAINING DATA' then
    raise exception 'Type RESET TRAINING DATA to confirm the reset';
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  select count(*) into v_evals   from public.evaluations;
  select count(*) into v_panels  from public.panels;
  select count(*) into v_members from public.panel_members;
  select count(*) into v_reviews from public.papers where review_score is not null;
  select count(*) into v_tracks  from public.tracks where finalized_at is not null;

  -- Evaluations cascade to evaluation_scores; panels cascade to panel_members
  -- and null out papers.panel_id.
  delete from public.evaluations;
  delete from public.panels;
  update public.papers set review_score = null, updated_at = now() where review_score is not null;
  delete from public.track_results;
  update public.tracks set finalized_at = null, finalized_by = null where finalized_at is not null;

  insert into public.reset_log
    (performed_by, performed_email, evaluations, panels, panel_members, review_scores, tracks_reopened)
  values (auth.uid(), coalesce(v_email, ''), v_evals, v_panels, v_members, v_reviews, v_tracks);

  return jsonb_build_object(
    'evaluations', v_evals,
    'panels', v_panels,
    'panel_members', v_members,
    'review_scores', v_reviews,
    'tracks_reopened', v_tracks
  );
end $$;

-- ---------- Privileges ----------
revoke execute on function public.can_reset() from public, anon;
revoke execute on function public.set_reset_access(text, boolean) from public, anon;
revoke execute on function public.reset_training_data(text) from public, anon;
grant execute on function public.can_reset() to authenticated;
grant execute on function public.set_reset_access(text, boolean) to authenticated;
grant execute on function public.reset_training_data(text) to authenticated;
