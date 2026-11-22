-- =====================================================================
-- Results tie-breakers
--
-- Rank within a track by:
--   1. final_score (/100)        descending
--   2. review_score (/50)        descending, nulls last
--   3. presentation_score (/50)  descending, nulls last
--
-- Papers equal on all three share a dense rank. finalize_track() copies
-- these ranks into track_results, so it needs no change. The backfill at
-- the end re-ranks tracks that were finalized under the old rule; it
-- changes rank numbers only, never scores or finalized_at.
-- =====================================================================

create or replace view public.paper_scores
with (security_invoker = true) as
with member_totals as (
  select e.paper_id, e.status, sum(s.marks)::numeric as total
  from public.evaluations e
  join public.papers p         on p.id = e.paper_id
  join public.panel_members m  on m.id = e.panel_member_id and m.panel_id = p.panel_id
  join public.evaluation_scores s on s.evaluation_id = e.id
  group by e.id, e.paper_id, e.status
),
agg as (
  select paper_id,
         count(*) filter (where status = 'submitted')        as submitted_count,
         avg(total) filter (where status = 'submitted')      as presentation_score
  from member_totals
  group by paper_id
),
base as (
  select p.id as paper_id, p.pid, p.title, p.track_id, t.name as track_name,
         p.panel_id, pn.name as panel_name, p.review_score,
         coalesce(a.submitted_count, 0)::int as submitted_count,
         (select count(*) from public.panel_members pm where pm.panel_id = p.panel_id)::int as member_count,
         round(a.presentation_score, 2) as presentation_score,
         round(coalesce(a.presentation_score, 0) + coalesce(p.review_score, 0), 2) as final_score
  from public.papers p
  join public.tracks t       on t.id = p.track_id
  left join public.panels pn on pn.id = p.panel_id
  left join agg a            on a.paper_id = p.id
)
select base.*,
       dense_rank() over (
         partition by track_id
         order by final_score        desc,
                  review_score       desc nulls last,
                  presentation_score desc nulls last
       )::int as rank
from base;

-- Re-rank snapshots written before this rule existed. Scores and
-- finalized_at are untouched; only the rank number can change.
with ranked as (
  select track_id,
         pid,
         dense_rank() over (
           partition by track_id
           order by final_score        desc,
                    review_score       desc nulls last,
                    presentation_score desc nulls last
         )::int as new_rank
  from public.track_results
)
update public.track_results tr
   set rank = r.new_rank
  from ranked r
 where tr.track_id = r.track_id
   and tr.pid = r.pid
   and tr.rank is distinct from r.new_rank;
