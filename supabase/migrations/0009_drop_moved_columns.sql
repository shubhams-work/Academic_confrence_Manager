-- =====================================================================
-- Security audit fixes: the "contract" half of 0008.
--
-- 0008 copied review scores into paper_reviews and author contact details
-- into author_contacts, each behind a policy panelists cannot pass. The old
-- columns were left in place so the web app that was live at the time kept
-- working. This drops them, which is what actually stops panelists from
-- reading those values: until now they could still query the old columns.
--
-- Apply only after the web app that reads the new tables is deployed. The
-- web app live before that selects papers.review_score directly and would
-- break.
--
-- Nothing in the database still depends on these columns: 0008 moved the
-- paper_scores view and every function that read or wrote them. A forgotten
-- view would make the drop fail loudly; a forgotten plpgsql function would
-- not (function bodies are not dependency-tracked), which is why 0008
-- replaced each one explicitly.
-- =====================================================================

begin;

-- Last check before the data is gone for good: every value must already be
-- in its new home.
do $$
begin
  if exists (
    select 1 from public.papers p
     where p.review_score is not null
       and not exists (select 1 from public.paper_reviews r where r.paper_id = p.id)
  ) then
    raise exception 'A review score exists only in papers.review_score; not dropping it';
  end if;
  if exists (
    select 1 from public.authors a
     where (a.email is not null or a.phone is not null)
       and not exists (select 1 from public.author_contacts c where c.author_id = a.id)
  ) then
    raise exception 'An author contact exists only in authors; not dropping it';
  end if;
end $$;

alter table public.papers  drop column review_score;
alter table public.authors drop column email, drop column phone;

commit;

notify pgrst, 'reload schema';
