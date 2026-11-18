-- =====================================================================
-- Fix: reset_training_data() failed from the web app with
--   "DELETE requires a WHERE clause"
--
-- PostgREST connects as `authenticator`, which Supabase configures with
-- session_preload_libraries = supautils, safeupdate. The safeupdate extension
-- rejects any DELETE or UPDATE that has no WHERE clause, and that applies
-- inside a security definer function too, because it is a session-level
-- setting rather than a privilege.
--
-- The migration itself applied fine over the Supabase CLI / SQL editor, which
-- connect as `postgres` and do not preload safeupdate — so this only ever
-- showed up when the button was actually pressed.
--
-- Every delete below now carries an always-true qualification. The rows
-- affected are identical; only the parse tree changes.
-- =====================================================================

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
  -- and null out papers.panel_id. The `is not null` quals exist only to
  -- satisfy safeupdate: the primary keys are NOT NULL, so every row matches.
  delete from public.evaluations   where id is not null;
  delete from public.panels        where id is not null;
  update public.papers set review_score = null, updated_at = now() where review_score is not null;
  delete from public.track_results where track_id is not null;
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

revoke execute on function public.reset_training_data(text) from public, anon;
grant execute on function public.reset_training_data(text) to authenticated;
