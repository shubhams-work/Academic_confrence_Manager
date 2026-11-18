-- =====================================================================
-- Conference Evaluation Platform — initial schema
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- =====================================================================

-- ---------- Types ----------
create type public.app_role as enum ('organizing_chair', 'session_incharge', 'panel_member');
create type public.eval_status as enum ('draft', 'submitted');

-- ---------- Tables ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  phone       text,
  role        public.app_role,
  created_at  timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (email);

create table public.tracks (
  id            smallint primary key,
  name          text not null unique,
  sort_order    smallint not null,
  finalized_at  timestamptz,
  finalized_by  uuid references public.profiles (id) on delete set null
);

insert into public.tracks (id, name, sort_order) values
  (1, 'Computing', 1),
  (2, 'Semiconductor', 2),
  (3, 'Mechatronics', 3),
  (4, 'Intelligent Systems', 4),
  (5, 'Communications', 5);

create table public.panels (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  track_id      smallint not null references public.tracks (id),
  venue         text,
  scheduled_at  timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index panels_track_idx on public.panels (track_id);

-- Exactly two members per panel (positions 1 and 2); only written via save_panel().
create table public.panel_members (
  id           uuid primary key default gen_random_uuid(),
  panel_id     uuid not null references public.panels (id) on delete cascade,
  position     smallint not null check (position in (1, 2)),
  name         text not null,
  phone        text,
  email        text not null check (email = lower(email)),
  affiliation  text,
  profile_id   uuid references public.profiles (id) on delete set null,
  unique (panel_id, position),
  constraint panel_members_panel_email_key unique (panel_id, email) deferrable initially deferred
);
create index panel_members_email_idx on public.panel_members (email);
create index panel_members_profile_idx on public.panel_members (profile_id);

create table public.papers (
  id            uuid primary key default gen_random_uuid(),
  pid           text not null unique,
  title         text not null,
  track_id      smallint not null references public.tracks (id),
  review_score  numeric(4, 1) check (review_score between 0 and 50),
  panel_id      uuid references public.panels (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index papers_track_idx on public.papers (track_id);
create index papers_panel_idx on public.papers (panel_id);

create table public.authors (
  id           uuid primary key default gen_random_uuid(),
  paper_id     uuid not null references public.papers (id) on delete cascade,
  position     smallint not null default 1,
  name         text not null,
  affiliation  text,
  email        text,
  phone        text
);
create index authors_paper_idx on public.authors (paper_id);

-- Pre-approved staff emails (Organizing Chair / Session Incharge).
create table public.staff_invites (
  email       text primary key check (email = lower(email)),
  role        public.app_role not null check (role <> 'panel_member'),
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.criteria (
  id          smallint primary key,
  code        text not null unique,
  name        text not null,
  max_marks   smallint not null check (max_marks > 0),
  sort_order  smallint not null
);

insert into public.criteria (id, code, name, max_marks, sort_order) values
  (1, 'technical',    'Technical Content & Depth',   10, 1),
  (2, 'originality',  'Originality & Innovation',    10, 2),
  (3, 'presentation', 'Presentation Skills',         10, 3),
  (4, 'slides',       'Slide Quality',               10, 4),
  (5, 'qa',           'Q&A / Understanding of Work', 10, 5);

create table public.evaluations (
  id               uuid primary key default gen_random_uuid(),
  paper_id         uuid not null references public.papers (id) on delete cascade,
  panel_member_id  uuid not null references public.panel_members (id) on delete cascade,
  comments         text,
  status           public.eval_status not null default 'draft',
  updated_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  unique (paper_id, panel_member_id)
);
create index evaluations_member_idx on public.evaluations (panel_member_id);

create table public.evaluation_scores (
  evaluation_id  uuid not null references public.evaluations (id) on delete cascade,
  criterion_id   smallint not null references public.criteria (id),
  marks          smallint not null check (marks >= 0),
  primary key (evaluation_id, criterion_id)
);

-- Frozen snapshot written by finalize_track().
create table public.track_results (
  track_id            smallint not null references public.tracks (id) on delete cascade,
  paper_id            uuid,
  pid                 text not null,
  title               text not null,
  panel_name          text,
  presentation_score  numeric(5, 2),
  review_score        numeric(4, 1),
  final_score         numeric(5, 2) not null,
  rank                int not null,
  submitted_count     int not null,
  member_count        int not null,
  primary key (track_id, pid)
);

-- ---------- Helper functions (security definer: bypass RLS, no recursion) ----------
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_chair()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'organizing_chair', false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('organizing_chair', 'session_incharge'), false)
$$;

create or replace function public.my_panel_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select panel_id from public.panel_members where profile_id = auth.uid()
$$;

create or replace function public.track_is_open(p_track_id smallint)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select finalized_at is null from public.tracks where id = p_track_id), false)
$$;

-- ---------- Signup: assign role from invites / panel membership ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(new.email);
  v_role  public.app_role;
begin
  select role into v_role from public.staff_invites where email = v_email;
  if v_role is null and exists (select 1 from public.panel_members where email = v_email) then
    v_role := 'panel_member';
  end if;

  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    v_email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    v_role
  );

  update public.panel_members set profile_id = new.id where email = v_email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Staff invite added/changed after the person already signed up -> update role.
create or replace function public.sync_staff_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles p
       set role = case when exists (select 1 from public.panel_members m where m.email = p.email)
                       then 'panel_member'::public.app_role else null end
     where p.email = old.email;
    return old;
  end if;
  update public.profiles set role = new.role where email = new.email;
  return new;
end $$;

create trigger staff_invites_sync
  after insert or update or delete on public.staff_invites
  for each row execute function public.sync_staff_invite();

-- ---------- Results view (RLS of the caller applies) ----------
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
       dense_rank() over (partition by track_id order by final_score desc)::int as rank
from base;

-- ---------- RPCs ----------

-- Upsert papers (+ replace their authors). Used by Excel import and manual add/edit.
-- p_rows: [{pid, title, track, review_score?, authors:[{name, affiliation, email, phone}]}]
create or replace function public.import_papers(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r          jsonb;
  a          jsonb;
  v_track    smallint;
  v_id       uuid;
  v_inserted boolean;
  v_pos      int;
  v_new      int := 0;
  v_upd      int := 0;
  v_old_track smallint;
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

    insert into public.papers (pid, title, track_id, review_score)
    values (trim(r ->> 'pid'), trim(r ->> 'title'), v_track, nullif(r ->> 'review_score', '')::numeric)
    on conflict (pid) do update
      set title        = excluded.title,
          track_id     = excluded.track_id,
          review_score = coalesce(excluded.review_score, public.papers.review_score),
          panel_id     = case when public.papers.track_id = excluded.track_id
                              then public.papers.panel_id else null end,
          updated_at   = now()
    returning id, (xmax = 0) into v_id, v_inserted;

    if v_inserted then v_new := v_new + 1; else v_upd := v_upd + 1; end if;

    if r ? 'authors' then
      delete from public.authors where paper_id = v_id;
      v_pos := 0;
      for a in select * from jsonb_array_elements(r -> 'authors') loop
        v_pos := v_pos + 1;
        if coalesce(trim(a ->> 'name'), '') <> '' then
          insert into public.authors (paper_id, position, name, affiliation, email, phone)
          values (v_id, v_pos, trim(a ->> 'name'),
                  nullif(trim(a ->> 'affiliation'), ''),
                  nullif(lower(trim(a ->> 'email')), ''),
                  nullif(trim(a ->> 'phone'), ''));
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_new, 'updated', v_upd);
end $$;

-- p_rows: [{pid, review_score}]
create or replace function public.import_review_scores(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r        jsonb;
  v_paper  public.papers%rowtype;
  v_upd    int := 0;
  v_unknown text[] := '{}';
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
    update public.papers
       set review_score = nullif(r ->> 'review_score', '')::numeric, updated_at = now()
     where id = v_paper.id;
    v_upd := v_upd + 1;
  end loop;

  return jsonb_build_object('updated', v_upd, 'unknown', to_jsonb(v_unknown));
end $$;

-- Create or update a panel with exactly two members.
-- p_members: [{name, phone, email, affiliation}, {…}]
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
  v_id    uuid;
  v_m     jsonb;
  v_pos   int := 0;
  v_email text;
  v_old   public.panel_members%rowtype;
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

  if p_panel_id is null then
    insert into public.panels (name, track_id, venue, scheduled_at, created_by)
    values (trim(p_name), p_track_id, nullif(trim(p_venue), ''), p_scheduled_at, auth.uid())
    returning id into v_id;
  else
    select id into v_id from public.panels where id = p_panel_id;
    if v_id is null then raise exception 'Panel not found'; end if;
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

create or replace function public.delete_panel(p_panel_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
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

-- Assign papers to a panel (p_panel_id = null to unassign).
create or replace function public.set_paper_panel(p_paper_ids uuid[], p_panel_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_paper public.papers%rowtype;
  v_panel_track smallint;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_panel_id is not null then
    select track_id into v_panel_track from public.panels where id = p_panel_id;
    if v_panel_track is null then raise exception 'Panel not found'; end if;
  end if;

  for v_paper in select * from public.papers where id = any (p_paper_ids) loop
    if not public.track_is_open(v_paper.track_id) then
      raise exception 'Paper % belongs to a finalized track', v_paper.pid;
    end if;
    if p_panel_id is not null and v_paper.track_id <> v_panel_track then
      raise exception 'Paper % is in a different track than the panel', v_paper.pid;
    end if;
    if v_paper.panel_id is distinct from p_panel_id then
      if exists (select 1 from public.evaluations where paper_id = v_paper.id and status = 'submitted') then
        raise exception 'Paper % already has submitted scores; ask the Chair to unlock them first', v_paper.pid;
      end if;
      delete from public.evaluations where paper_id = v_paper.id;
      update public.papers set panel_id = p_panel_id, updated_at = now() where id = v_paper.id;
    end if;
  end loop;
end $$;

-- Panel member saves a draft or submits marks.
-- p_marks: {"technical": 8, "originality": 7, ...}
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
  returning id into v_id;

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

create or replace function public.unlock_evaluation(p_evaluation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_track smallint;
begin
  if not public.is_chair() then
    raise exception 'Only the Organizing Chair can unlock scores' using errcode = '42501';
  end if;
  select p.track_id into v_track
    from public.evaluations e join public.papers p on p.id = e.paper_id
   where e.id = p_evaluation_id;
  if not public.track_is_open(v_track) then
    raise exception 'Reopen the track before unlocking scores';
  end if;
  update public.evaluations set status = 'draft', submitted_at = null, updated_at = now()
   where id = p_evaluation_id;
end $$;

create or replace function public.finalize_track(p_track_id smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_chair() then
    raise exception 'Only the Organizing Chair can finalize results' using errcode = '42501';
  end if;
  delete from public.track_results where track_id = p_track_id;
  insert into public.track_results
    (track_id, paper_id, pid, title, panel_name, presentation_score, review_score,
     final_score, rank, submitted_count, member_count)
  select track_id, paper_id, pid, title, panel_name, presentation_score, review_score,
         final_score, rank, submitted_count, member_count
    from public.paper_scores
   where track_id = p_track_id;
  update public.tracks set finalized_at = now(), finalized_by = auth.uid() where id = p_track_id;
end $$;

create or replace function public.reopen_track(p_track_id smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_chair() then
    raise exception 'Only the Organizing Chair can reopen a track' using errcode = '42501';
  end if;
  delete from public.track_results where track_id = p_track_id;
  update public.tracks set finalized_at = null, finalized_by = null where id = p_track_id;
end $$;

-- Lightweight endpoint for the keep-alive job (callable with the anon key).
create or replace function public.ping()
returns text language sql stable as $$ select 'ok'::text $$;

-- ---------- Row-Level Security ----------
alter table public.profiles          enable row level security;
alter table public.tracks            enable row level security;
alter table public.panels            enable row level security;
alter table public.panel_members     enable row level security;
alter table public.papers            enable row level security;
alter table public.authors           enable row level security;
alter table public.staff_invites     enable row level security;
alter table public.criteria          enable row level security;
alter table public.evaluations       enable row level security;
alter table public.evaluation_scores enable row level security;
alter table public.track_results     enable row level security;

-- profiles: see yourself (staff see everyone); edit only your own name/phone.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone) on public.profiles to authenticated;

create policy tracks_select on public.tracks for select to authenticated using (true);
create policy criteria_select on public.criteria for select to authenticated using (true);

create policy papers_select on public.papers for select to authenticated
  using (public.is_staff() or panel_id in (select public.my_panel_ids()));
create policy papers_delete on public.papers for delete to authenticated
  using (public.is_chair() and public.track_is_open(track_id));

create policy authors_select on public.authors for select to authenticated
  using (exists (select 1 from public.papers p where p.id = authors.paper_id));

create policy panels_select on public.panels for select to authenticated
  using (public.is_staff() or id in (select public.my_panel_ids()));

create policy panel_members_select on public.panel_members for select to authenticated
  using (public.is_staff() or panel_id in (select public.my_panel_ids()));

create policy staff_invites_chair on public.staff_invites for all to authenticated
  using (public.is_chair()) with check (public.is_chair());

create policy evaluations_select on public.evaluations for select to authenticated
  using (
    public.is_staff()
    or panel_member_id in (select id from public.panel_members where profile_id = auth.uid())
  );

create policy evaluation_scores_select on public.evaluation_scores for select to authenticated
  using (exists (select 1 from public.evaluations e where e.id = evaluation_scores.evaluation_id));

create policy track_results_select on public.track_results for select to authenticated
  using (public.is_staff());

-- ---------- Function privileges ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.ping() to anon;
