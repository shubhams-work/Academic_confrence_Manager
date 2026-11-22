-- =====================================================================
-- Security audit fixes: the "expand" half.
--
-- Everything here is additive, so the web app that is live while this runs
-- keeps working. The old columns (papers.review_score, authors.email/phone)
-- are left in place and dropped by 0009 once the new web app is deployed.
--
--   M2  Panelists could read review scores and author contact details.
--       RLS is row-level, not column-level: anyone allowed to see a paper row
--       saw every column of it, and panelists may see the papers they judge.
--       Hiding the columns in the UI changed nothing, because a panelist can
--       query PostgREST directly with their own token. So the sensitive
--       columns move into tables of their own, with their own policies:
--         paper_reviews    staff only (incharges' Panel detail shows it)
--         author_contacts  Organizing Chair only (only the Chair's paper form
--                          uses them)
--   M3  signin_link_log records every sign-in link staff issue for a panelist,
--       since such a link lets whoever holds it sign in as that panelist.
--   L1  save_evaluation no longer lets a draft save overwrite a submission
--       that landed between its status check and its write.
--   L5  Panels in a finalized track cannot be edited or deleted, and only the
--       Session Incharge who created a panel (or the Chair) may change it.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- M2: review scores
-- ---------------------------------------------------------------------
create table public.paper_reviews (
  paper_id      uuid primary key references public.papers (id) on delete cascade,
  -- Not null: "no review score" is the absence of a row, not a null value.
  review_score  numeric(4, 1) not null check (review_score between 0 and 50),
  updated_at    timestamptz not null default now()
);

alter table public.paper_reviews enable row level security;

create policy paper_reviews_select on public.paper_reviews
  for select to authenticated
  using (public.is_staff());

-- Supabase grants new tables to anon/authenticated by default. Reads go
-- through the policy above; writes only through the security definer RPCs.
revoke all on public.paper_reviews from anon, authenticated;
grant select on public.paper_reviews to authenticated;

insert into public.paper_reviews (paper_id, review_score)
select id, review_score
  from public.papers
 where review_score is not null;

-- ---------------------------------------------------------------------
-- M2: author contact details
-- ---------------------------------------------------------------------
create table public.author_contacts (
  author_id  uuid primary key references public.authors (id) on delete cascade,
  email      text,
  phone      text,
  check (email is not null or phone is not null)
);

alter table public.author_contacts enable row level security;

create policy author_contacts_select on public.author_contacts
  for select to authenticated
  using (public.is_chair());

revoke all on public.author_contacts from anon, authenticated;
grant select on public.author_contacts to authenticated;

insert into public.author_contacts (author_id, email, phone)
select id, email, phone
  from public.authors
 where email is not null or phone is not null;

-- The copy must be exact. If it is not, abort the whole migration rather
-- than leave a half-moved dataset that 0009 would then make permanent.
do $$
declare
  v_src_reviews   int;
  v_dst_reviews   int;
  v_src_contacts  int;
  v_dst_contacts  int;
begin
  select count(*) into v_src_reviews  from public.papers  where review_score is not null;
  select count(*) into v_dst_reviews  from public.paper_reviews;
  select count(*) into v_src_contacts from public.authors where email is not null or phone is not null;
  select count(*) into v_dst_contacts from public.author_contacts;
  if v_src_reviews <> v_dst_reviews or v_src_contacts <> v_dst_contacts then
    raise exception 'Copy mismatch: reviews %/% contacts %/%',
      v_dst_reviews, v_src_reviews, v_dst_contacts, v_src_contacts;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- M3: sign-in link audit trail
-- ---------------------------------------------------------------------
create table public.signin_link_log (
  id               uuid primary key default gen_random_uuid(),
  issued_by        uuid references public.profiles (id) on delete set null,
  issued_by_email  text not null,
  target_email     text not null,
  -- 'email': mailed to the panelist's own inbox. 'copy': returned to the
  -- caller, who could use it themselves - the case worth auditing.
  mode             text not null check (mode in ('email', 'copy')),
  issued_at        timestamptz not null default now()
);

create index signin_link_log_target_idx on public.signin_link_log (target_email, issued_at desc);

alter table public.signin_link_log enable row level security;

create policy signin_link_log_select on public.signin_link_log
  for select to authenticated
  using (public.is_chair());

-- Written only by the panelist_signin_link edge function (service role).
revoke all on public.signin_link_log from anon, authenticated;
grant select on public.signin_link_log to authenticated;

-- ---------------------------------------------------------------------
-- M2: the results view reads review scores from their new home.
-- Same columns, same order and types as 0006; security_invoker is kept, so a
-- caller who may not read paper_reviews simply gets null review scores.
-- ---------------------------------------------------------------------
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
         p.panel_id, pn.name as panel_name, pr.review_score,
         coalesce(a.submitted_count, 0)::int as submitted_count,
         (select count(*) from public.panel_members pm where pm.panel_id = p.panel_id)::int as member_count,
         round(a.presentation_score, 2) as presentation_score,
         round(coalesce(a.presentation_score, 0) + coalesce(pr.review_score, 0), 2) as final_score
  from public.papers p
  join public.tracks t              on t.id = p.track_id
  left join public.panels pn        on pn.id = p.panel_id
  left join public.paper_reviews pr on pr.paper_id = p.id
  left join agg a                   on a.paper_id = p.id
)
select base.*,
       dense_rank() over (
         partition by track_id
         order by final_score        desc,
                  review_score       desc nulls last,
                  presentation_score desc nulls last
       )::int as rank
from base;

-- ---------------------------------------------------------------------
-- M2: import_papers writes review scores and contacts to the new tables.
-- Same signature and input shape as 0001.
-- ---------------------------------------------------------------------
create or replace function public.import_papers(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r           jsonb;
  a           jsonb;
  v_track     smallint;
  v_id        uuid;
  v_author    uuid;
  v_inserted  boolean;
  v_pos       int;
  v_new       int := 0;
  v_upd       int := 0;
  v_old_track smallint;
  v_review    numeric;
  v_email     text;
  v_phone     text;
begin
  if not public.is_chair() then
    raise exception 'Only the Organizing Chair can import papers' using errcode = '42501';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(r ->> 'pid'), '') = '' or coalesce(trim(r ->> 'title'), '') = '' then
      raise exception 'Paper ID and Title are required';
    end if;

    select id into v_track from public.tracks where lower(name) = lower(trim(r ->> 'track'));
    if v_track is null then
      raise exception 'Unknown track "%" for paper %', r ->> 'track', r ->> 'pid';
    end if;
    if not public.track_is_open(v_track) then
      raise exception 'Track "%" is finalized; reopen it before changing paper %', r ->> 'track', r ->> 'pid';
    end if;

    select track_id into v_old_track from public.papers where pid = trim(r ->> 'pid');
    if v_old_track is not null and v_old_track <> v_track and not public.track_is_open(v_old_track) then
      raise exception 'Paper % belongs to a finalized track', r ->> 'pid';
    end if;

    insert into public.papers (pid, title, track_id)
    values (trim(r ->> 'pid'), trim(r ->> 'title'), v_track)
    on conflict (pid) do update
      set title      = excluded.title,
          track_id   = excluded.track_id,
          panel_id   = case when public.papers.track_id = excluded.track_id
                            then public.papers.panel_id else null end,
          updated_at = now()
    returning id, (xmax = 0) into v_id, v_inserted;

    if v_inserted then v_new := v_new + 1; else v_upd := v_upd + 1; end if;

    -- A blank review score keeps the existing one, as before.
    v_review := nullif(trim(coalesce(r ->> 'review_score', '')), '')::numeric;
    if v_review is not null then
      insert into public.paper_reviews (paper_id, review_score, updated_at)
      values (v_id, v_review, now())
      on conflict (paper_id) do update
        set review_score = excluded.review_score, updated_at = now();
    end if;

    if r ? 'authors' then
      -- Cascades to author_contacts.
      delete from public.authors where paper_id = v_id;
      v_pos := 0;
      for a in select * from jsonb_array_elements(r -> 'authors') loop
        v_pos := v_pos + 1;
        if coalesce(trim(a ->> 'name'), '') <> '' then
          insert into public.authors (paper_id, position, name, affiliation)
          values (v_id, v_pos, trim(a ->> 'name'), nullif(trim(a ->> 'affiliation'), ''))
          returning id into v_author;

          v_email := nullif(lower(trim(a ->> 'email')), '');
          v_phone := nullif(trim(a ->> 'phone'), '');
          if v_email is not null or v_phone is not null then
            insert into public.author_contacts (author_id, email, phone)
            values (v_author, v_email, v_phone);
          end if;
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_new, 'updated', v_upd);
end $$;

-- ---------------------------------------------------------------------
-- M2: import_review_scores. A blank score clears it, as before.
-- ---------------------------------------------------------------------
create or replace function public.import_review_scores(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r         jsonb;
  v_paper   public.papers%rowtype;
  v_upd     int := 0;
  v_unknown text[] := '{}';
  v_review  numeric;
begin
  if not public.is_chair() then
    raise exception 'Only the Organizing Chair can upload review scores' using errcode = '42501';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    select * into v_paper from public.papers where pid = trim(r ->> 'pid');
    if not found then
      v_unknown := v_unknown || (r ->> 'pid');
      continue;
    end if;
    if not public.track_is_open(v_paper.track_id) then
      raise exception 'Paper % belongs to a finalized track', v_paper.pid;
    end if;

    v_review := nullif(trim(coalesce(r ->> 'review_score', '')), '')::numeric;
    if v_review is null then
      delete from public.paper_reviews where paper_id = v_paper.id;
    else
      insert into public.paper_reviews (paper_id, review_score, updated_at)
      values (v_paper.id, v_review, now())
      on conflict (paper_id) do update
        set review_score = excluded.review_score, updated_at = now();
    end if;
    update public.papers set updated_at = now() where id = v_paper.id;
    v_upd := v_upd + 1;
  end loop;

  return jsonb_build_object('updated', v_upd, 'unknown', to_jsonb(v_unknown));
end $$;

-- ---------------------------------------------------------------------
-- M2: the training reset clears review scores in their new home.
-- Otherwise identical to 0004, including the always-true WHERE clauses that
-- the safeupdate extension demands of every DELETE/UPDATE.
-- ---------------------------------------------------------------------
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
  select count(*) into v_reviews from public.paper_reviews;
  select count(*) into v_tracks  from public.tracks where finalized_at is not null;

  delete from public.evaluations   where id is not null;
  delete from public.panels        where id is not null;
  delete from public.paper_reviews where paper_id is not null;
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

-- ---------------------------------------------------------------------
-- L1: save_evaluation. Identical to 0001 except the upsert.
-- The early "already submitted" check reads the row without locking it, so a
-- submit committing between that check and the write used to be overwritten
-- by a draft save from another tab. The WHERE on the conflict update is
-- evaluated against the row after ON CONFLICT has locked it, so a submitted
-- row can no longer be touched, and nothing returned means it was submitted.
-- ---------------------------------------------------------------------
create or replace function public.save_evaluation(
  p_paper_id uuid,
  p_marks    jsonb,
  p_comments text,
  p_submit   boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_paper  public.papers%rowtype;
  v_member uuid;
  v_eval   public.evaluations%rowtype;
  v_id     uuid;
  c        public.criteria%rowtype;
  v_raw    text;
  v_mark   int;
begin
  select * into v_paper from public.papers where id = p_paper_id;
  if not found then raise exception 'Paper not found'; end if;

  select id into v_member from public.panel_members
   where panel_id = v_paper.panel_id and profile_id = auth.uid();
  if v_member is null then
    raise exception 'You are not on the panel for this paper' using errcode = '42501';
  end if;
  if not public.track_is_open(v_paper.track_id) then
    raise exception 'Results for this track are finalized';
  end if;

  select * into v_eval from public.evaluations
   where paper_id = p_paper_id and panel_member_id = v_member;
  if found and v_eval.status = 'submitted' then
    raise exception 'You have already submitted scores for this paper';
  end if;

  -- validate marks
  for c in select * from public.criteria order by sort_order loop
    v_raw := p_marks ->> c.code;
    if v_raw is null then
      if p_submit then raise exception 'Please mark "%" before submitting', c.name; end if;
      continue;
    end if;
    if v_raw !~ '^\d{1,3}$' then
      raise exception '"%" must be a whole number from 0 to %', c.name, c.max_marks;
    end if;
    if v_raw::int > c.max_marks then
      raise exception '"%" must be a whole number from 0 to %', c.name, c.max_marks;
    end if;
  end loop;

  insert into public.evaluations (paper_id, panel_member_id, comments, status, updated_at, submitted_at)
  values (p_paper_id, v_member, nullif(trim(p_comments), ''),
          case when p_submit then 'submitted'::public.eval_status else 'draft' end,
          now(), case when p_submit then now() end)
  on conflict (paper_id, panel_member_id) do update
    set comments = excluded.comments, status = excluded.status,
        updated_at = now(), submitted_at = excluded.submitted_at
    where public.evaluations.status = 'draft'
  returning id into v_id;

  if v_id is null then
    raise exception 'You have already submitted scores for this paper';
  end if;

  delete from public.evaluation_scores where evaluation_id = v_id;
  for c in select * from public.criteria order by sort_order loop
    v_raw := p_marks ->> c.code;
    if v_raw is not null then
      v_mark := v_raw::int;
      insert into public.evaluation_scores (evaluation_id, criterion_id, marks) values (v_id, c.id, v_mark);
    end if;
  end loop;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- L5: save_panel. Identical to 0001 plus two guards:
--   * finalized tracks are frozen (previously only papers and scores were);
--   * an existing panel may be changed only by its creator or the Chair.
--     Panels whose creator account was deleted (created_by null) fall to the
--     Chair, who can always step in.
-- ---------------------------------------------------------------------
create or replace function public.save_panel(
  p_panel_id     uuid,
  p_name         text,
  p_track_id     smallint,
  p_venue        text,
  p_scheduled_at timestamptz,
  p_members      jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id         uuid;
  v_m          jsonb;
  v_pos        int := 0;
  v_email      text;
  v_old        public.panel_members%rowtype;
  v_old_track  smallint;
  v_creator    uuid;
begin
  if not public.is_staff() then
    raise exception 'Only a Session Incharge or the Organizing Chair can manage panels' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Panel name is required';
  end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) <> 2 then
    raise exception 'A panel must have exactly 2 members';
  end if;
  if lower(trim(p_members -> 0 ->> 'email')) = lower(trim(p_members -> 1 ->> 'email')) then
    raise exception 'The two panel members must have different emails';
  end if;
  if not public.track_is_open(p_track_id) then
    raise exception 'That track is finalized; reopen it before changing its panels';
  end if;

  if p_panel_id is null then
    insert into public.panels (name, track_id, venue, scheduled_at, created_by)
    values (trim(p_name), p_track_id, nullif(trim(p_venue), ''), p_scheduled_at, auth.uid())
    returning id into v_id;
  else
    select id, track_id, created_by into v_id, v_old_track, v_creator
      from public.panels where id = p_panel_id;
    if v_id is null then raise exception 'Panel not found'; end if;
    if not public.is_chair() and v_creator is distinct from auth.uid() then
      raise exception 'Only the Session Incharge who created this panel, or the Organizing Chair, can change it'
        using errcode = '42501';
    end if;
    if not public.track_is_open(v_old_track) then
      raise exception 'This panel''s track is finalized; reopen it before changing the panel';
    end if;
    if exists (select 1 from public.papers where panel_id = v_id and track_id <> p_track_id) then
      raise exception 'Unassign this panel''s papers before changing its track';
    end if;
    update public.panels
       set name = trim(p_name), track_id = p_track_id,
           venue = nullif(trim(p_venue), ''), scheduled_at = p_scheduled_at
     where id = v_id;
  end if;

  for v_m in select * from jsonb_array_elements(p_members) loop
    v_pos := v_pos + 1;
    v_email := lower(trim(v_m ->> 'email'));
    if coalesce(trim(v_m ->> 'name'), '') = '' then
      raise exception 'Name of member % is required', v_pos;
    end if;
    if coalesce(v_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Email of member % is not valid', v_pos;
    end if;

    select * into v_old from public.panel_members where panel_id = v_id and position = v_pos;
    if found and v_old.email <> v_email then
      if exists (select 1 from public.evaluations where panel_member_id = v_old.id and status = 'submitted') then
        raise exception 'Member % has already submitted scores and cannot be replaced', v_pos;
      end if;
      delete from public.evaluations where panel_member_id = v_old.id;
    end if;

    insert into public.panel_members (panel_id, position, name, phone, email, affiliation, profile_id)
    values (v_id, v_pos, trim(v_m ->> 'name'), nullif(trim(v_m ->> 'phone'), ''), v_email,
            nullif(trim(v_m ->> 'affiliation'), ''),
            (select id from public.profiles where email = v_email))
    on conflict (panel_id, position) do update
      set name = excluded.name, phone = excluded.phone, email = excluded.email,
          affiliation = excluded.affiliation, profile_id = excluded.profile_id;

    update public.profiles set role = 'panel_member' where email = v_email and role is null;
  end loop;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- L5: delete_panel gets the same creator-or-Chair and open-track guards.
-- ---------------------------------------------------------------------
create or replace function public.delete_panel(p_panel_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_track    smallint;
  v_creator  uuid;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select track_id, created_by into v_track, v_creator from public.panels where id = p_panel_id;
  if not found then
    return;
  end if;
  if not public.is_chair() and v_creator is distinct from auth.uid() then
    raise exception 'Only the Session Incharge who created this panel, or the Organizing Chair, can delete it'
      using errcode = '42501';
  end if;
  if not public.track_is_open(v_track) then
    raise exception 'This panel''s track is finalized; reopen it before deleting the panel';
  end if;
  if exists (
    select 1 from public.evaluations e
    join public.panel_members m on m.id = e.panel_member_id
    where m.panel_id = p_panel_id and e.status = 'submitted'
  ) then
    raise exception 'This panel already has submitted scores and cannot be deleted';
  end if;
  delete from public.panels where id = p_panel_id;
end $$;

-- ---------------------------------------------------------------------
-- Privileges. CREATE OR REPLACE keeps existing grants, but state them
-- explicitly, as 0003 does, so nothing depends on that subtlety.
-- ---------------------------------------------------------------------
revoke execute on function public.import_papers(jsonb)                                         from public, anon;
revoke execute on function public.import_review_scores(jsonb)                                  from public, anon;
revoke execute on function public.reset_training_data(text)                                    from public, anon;
revoke execute on function public.save_evaluation(uuid, jsonb, text, boolean)                  from public, anon;
revoke execute on function public.save_panel(uuid, text, smallint, text, timestamptz, jsonb)   from public, anon;
revoke execute on function public.delete_panel(uuid)                                           from public, anon;
grant  execute on function public.import_papers(jsonb)                                         to authenticated;
grant  execute on function public.import_review_scores(jsonb)                                  to authenticated;
grant  execute on function public.reset_training_data(text)                                    to authenticated;
grant  execute on function public.save_evaluation(uuid, jsonb, text, boolean)                  to authenticated;
grant  execute on function public.save_panel(uuid, text, smallint, text, timestamptz, jsonb)   to authenticated;
grant  execute on function public.delete_panel(uuid)                                           to authenticated;

commit;

notify pgrst, 'reload schema';
