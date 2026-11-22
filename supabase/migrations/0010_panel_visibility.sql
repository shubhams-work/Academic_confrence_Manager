-- Panel visibility: a Session Incharge sees only the panels they created
-- (and everything hanging off them); the Organizing Chair sees all panels
-- globally. Panelists are unchanged — they see only their own panels.
--
-- Background: write access (save_panel / delete_panel) was already scoped to
-- the creator or Chair in 0008. Read access was not: panels_select,
-- panel_members_select, papers_select and evaluations_select all used
-- is_staff(), so every incharge could see every other incharge's work. This
-- closes that gap ("full wall"):
--
--   * panels / panel_members : creator or Chair (panelists: their panels).
--   * papers                 : Chair all; incharge sees UNASSIGNED papers
--                              (needed to assign) plus papers on their own
--                              panels; panelists see their panels' papers.
--   * evaluations            : Chair all; incharge sees progress for their own
--                              panels; panelists see their own.
--
-- evaluation_scores (marks) and track_results (finalized snapshot) are already
-- Chair-only (0002), and paper_scores is a security_invoker view, so an
-- incharge's live Results scope to their own papers automatically — no view or
-- marks-policy change is required here.

-- Panels created by the current user (security definer: bypasses panels RLS so
-- it can be used inside other tables' policies without recursion).
create or replace function public.my_created_panel_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.panels where created_by = auth.uid()
$$;

revoke execute on function public.my_created_panel_ids() from public, anon;
grant execute on function public.my_created_panel_ids() to authenticated;

-- ---------- Row-Level Security ----------

drop policy if exists panels_select on public.panels;
create policy panels_select on public.panels for select to authenticated
  using (
    public.is_chair()
    or created_by = auth.uid()
    or id in (select public.my_panel_ids())
  );

drop policy if exists panel_members_select on public.panel_members;
create policy panel_members_select on public.panel_members for select to authenticated
  using (
    public.is_chair()
    or panel_id in (select public.my_created_panel_ids())
    or panel_id in (select public.my_panel_ids())
  );

-- Chair sees every paper. A Session Incharge sees unassigned papers (so they
-- can pick them during assignment) and papers on panels they created. A
-- panelist sees only papers on the panels they sit on.
drop policy if exists papers_select on public.papers;
create policy papers_select on public.papers for select to authenticated
  using (
    public.is_chair()
    or (public.is_staff() and panel_id is null)
    or panel_id in (select public.my_created_panel_ids())
    or panel_id in (select public.my_panel_ids())
  );

-- Chair sees all evaluations. A Session Incharge tracks progress only for the
-- panels they created; a panelist sees only their own.
drop policy if exists evaluations_select on public.evaluations;
create policy evaluations_select on public.evaluations for select to authenticated
  using (
    public.is_chair()
    or panel_member_id in (
      select pm.id
        from public.panel_members pm
       where pm.profile_id = auth.uid()
          or pm.panel_id in (select public.my_created_panel_ids())
    )
  );

-- ---------- Write guard: assignment stays inside your own panels ----------
-- Identical to 0008/0001 plus two creator guards so an incharge cannot assign
-- papers TO, or pull papers OFF, a panel they do not own. The Chair is exempt.
create or replace function public.set_paper_panel(p_paper_ids uuid[], p_panel_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_paper         public.papers%rowtype;
  v_panel_track   smallint;
  v_panel_creator uuid;
  v_cur_creator   uuid;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_panel_id is not null then
    select track_id, created_by into v_panel_track, v_panel_creator
      from public.panels where id = p_panel_id;
    if v_panel_track is null then raise exception 'Panel not found'; end if;
    if not public.is_chair() and v_panel_creator is distinct from auth.uid() then
      raise exception 'You can only assign papers to a panel you created'
        using errcode = '42501';
    end if;
  end if;

  for v_paper in select * from public.papers where id = any (p_paper_ids) loop
    if not public.track_is_open(v_paper.track_id) then
      raise exception 'Paper % belongs to a finalized track', v_paper.pid;
    end if;
    if p_panel_id is not null and v_paper.track_id <> v_panel_track then
      raise exception 'Paper % is in a different track than the panel', v_paper.pid;
    end if;
    if v_paper.panel_id is distinct from p_panel_id then
      -- Moving the paper off its current panel: an incharge may only do that
      -- when the paper is unassigned or already on one of their own panels.
      if not public.is_chair() and v_paper.panel_id is not null then
        select created_by into v_cur_creator from public.panels where id = v_paper.panel_id;
        if v_cur_creator is distinct from auth.uid() then
          raise exception 'Paper % is on another incharge''s panel', v_paper.pid
            using errcode = '42501';
        end if;
      end if;
      if exists (select 1 from public.evaluations where paper_id = v_paper.id and status = 'submitted') then
        raise exception 'Paper % already has submitted scores; ask the Chair to unlock them first', v_paper.pid;
      end if;
      delete from public.evaluations where paper_id = v_paper.id;
      update public.papers set panel_id = p_panel_id, updated_at = now() where id = v_paper.id;
    end if;
  end loop;
end $$;
