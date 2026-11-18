-- Scores are visible only to the Organizing Chair.
--
-- Session incharges manage panels/members and still see evaluation *progress*
-- (started / submitted) via evaluations_select, but not the marks themselves.
-- Panel members keep read access to their OWN evaluation scores.
--
-- evaluations_select is intentionally left unchanged (is_staff OR own): the
-- incharge needs evaluation status to track which panels have finished.

-- Marks: chair sees all; a member sees only their own evaluation's scores.
drop policy if exists evaluation_scores_select on public.evaluation_scores;
create policy evaluation_scores_select on public.evaluation_scores for select to authenticated
  using (
    public.is_chair()
    or exists (
      select 1
        from public.evaluations e
        join public.panel_members pm on pm.id = e.panel_member_id
       where e.id = evaluation_scores.evaluation_id
         and pm.profile_id = auth.uid()
    )
  );

-- Finalized score snapshot: chair only (was is_staff).
drop policy if exists track_results_select on public.track_results;
create policy track_results_select on public.track_results for select to authenticated
  using (public.is_chair());
