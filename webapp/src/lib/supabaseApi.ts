// Supabase implementation. Row-Level Security on the server decides what
// each role can actually see; writes that need validation go through RPCs.
// Port of ../lib/core/supabase_repository.dart: same selects, RPC names,
// params and chunking.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AppRole,
  Author,
  Criterion,
  Evaluation,
  Panel,
  PanelMember,
  PanelMemberInput,
  Paper,
  PaperDraftJson,
  PanelistSummary,
  Profile,
  ResetSummary,
  ReviewScoreDraft,
  ScoreRow,
  StaffInvite,
  Track,
} from './types';
import type { Api, BulkCreateMembersResult, MemberCredential, MemberDraft, PanelMemberSuggestion } from './api';
import { supabaseUrl, supabasePublishableKey } from './config';

let client: SupabaseClient | null = null;

/** The shared Supabase client (created once, only when configured). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
    }
    client = createClient(supabaseUrl, supabasePublishableKey);
  }
  return client;
}

// ---------- Row shapes (JSON boundary) ----------

interface ProfileRow {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  role?: AppRole | null;
  can_reset_data?: boolean | null;
}

interface ResetSummaryRow {
  evaluations?: number | null;
  panels?: number | null;
  panel_members?: number | null;
  review_scores?: number | null;
  tracks_reopened?: number | null;
}

interface TrackRow {
  id: number;
  name: string;
  sort_order: number;
  finalized_at?: string | null;
}

interface CriterionRow {
  id: number;
  code: string;
  name: string;
  max_marks: number;
}

interface AuthorRow {
  name: string;
  affiliation?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: number | null;
}

interface EvalScoreRow {
  criterion_id: number;
  marks: number;
}

interface EvaluationRow {
  id: string;
  paper_id: string;
  panel_member_id: string;
  status: string;
  comments?: string | null;
  evaluation_scores?: EvalScoreRow[] | null;
}

interface PaperRow {
  id: string;
  pid: string;
  title: string;
  track_id: number;
  review_score?: number | null;
  panel_id?: string | null;
  authors?: AuthorRow[] | null;
  panels?: { name: string | null; venue: string | null; scheduled_at: string | null } | null;
  evaluations?: EvaluationRow[] | null;
}

interface PanelMemberRow {
  id: string;
  position: number;
  name: string;
  email: string;
  phone?: string | null;
  affiliation?: string | null;
  profile_id: string | null;
}

interface PanelRow {
  id: string;
  name: string;
  track_id: number;
  venue?: string | null;
  scheduled_at?: string | null;
  created_by?: string | null;
  creator?: { full_name?: string | null; email?: string | null } | null;
  panel_members?: PanelMemberRow[] | null;
  papers?: PaperRow[] | null;
}

interface ScoreRowRow {
  paper_id?: string | null;
  pid: string;
  title: string;
  track_id: number;
  panel_name?: string | null;
  presentation_score?: number | null;
  review_score?: number | null;
  final_score?: number | null;
  rank: number;
  submitted_count: number;
  member_count: number;
}

interface StaffInviteRow {
  email: string;
  role: AppRole;
}

// ---------- Mappers ----------

function mapProfile(j: ProfileRow): Profile {
  return {
    id: j.id,
    email: j.email,
    fullName: j.full_name ?? '',
    phone: j.phone ?? null,
    role: j.role ?? null,
    canResetData: j.can_reset_data === true,
  };
}

function mapTrack(j: TrackRow): Track {
  return { id: j.id, name: j.name, sortOrder: j.sort_order, finalizedAt: j.finalized_at ?? null };
}

function mapCriterion(j: CriterionRow): Criterion {
  return { id: j.id, code: j.code, name: j.name, maxMarks: j.max_marks };
}

function mapEvaluation(j: EvaluationRow): Evaluation {
  const marks: Record<number, number> = {};
  for (const s of j.evaluation_scores ?? []) marks[s.criterion_id] = s.marks;
  return {
    id: j.id,
    paperId: j.paper_id,
    panelMemberId: j.panel_member_id,
    submitted: j.status === 'submitted',
    comments: j.comments ?? null,
    marks,
  };
}

function mapPaper(j: PaperRow): Paper {
  const authors: Author[] = [...(j.authors ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((a) => ({ name: a.name, affiliation: a.affiliation ?? null, email: a.email ?? null, phone: a.phone ?? null }));
  const panel = j.panels ?? null;
  return {
    id: j.id,
    pid: j.pid,
    title: j.title,
    trackId: j.track_id,
    reviewScore: j.review_score ?? null,
    panelId: j.panel_id ?? null,
    panelName: panel?.name ?? null,
    panelVenue: panel?.venue ?? null,
    panelScheduledAt: panel?.scheduled_at ?? null,
    authors,
    evaluations: (j.evaluations ?? []).map(mapEvaluation),
  };
}

function mapPanelMember(j: PanelMemberRow): PanelMember {
  return {
    id: j.id,
    position: j.position,
    name: j.name,
    email: j.email,
    phone: j.phone ?? null,
    affiliation: j.affiliation ?? null,
    profileId: j.profile_id ?? null,
  };
}

function mapPanel(j: PanelRow): Panel {
  const creator = j.creator ?? null;
  return {
    id: j.id,
    name: j.name,
    trackId: j.track_id,
    venue: j.venue ?? null,
    scheduledAt: j.scheduled_at ?? null,
    createdById: j.created_by ?? null,
    // Null for a panel member: RLS only lets staff read other profiles.
    createdByName:
      creator == null
        ? null
        : creator.full_name != null && creator.full_name.trim() !== ''
          ? creator.full_name
          : (creator.email ?? null),
    members: (j.panel_members ?? []).slice().sort((a, b) => a.position - b.position).map(mapPanelMember),
    papers: (j.papers ?? []).map(mapPaper).sort((a, b) => cmpText(a.pid, b.pid)),
  };
}

function mapScoreRow(j: ScoreRowRow): ScoreRow {
  return {
    paperId: j.paper_id ?? null,
    pid: j.pid,
    title: j.title,
    trackId: j.track_id,
    panelName: j.panel_name ?? null,
    presentationScore: j.presentation_score ?? null,
    reviewScore: j.review_score ?? null,
    finalScore: j.final_score ?? 0,
    rank: j.rank,
    submittedCount: j.submitted_count,
    memberCount: j.member_count,
  };
}

function cmpText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------- Implementation ----------

const paperCols =
  'id,pid,title,track_id,review_score,panel_id,authors(name,affiliation,email,phone,position),panels(name,venue,scheduled_at)';

const panelCols =
  'id,name,track_id,venue,scheduled_at,created_by,' +
  'creator:profiles!panels_created_by_fkey(full_name,email),' +
  'panel_members(id,position,name,email,phone,affiliation,profile_id),' +
  'papers(id,pid,title,track_id,review_score,panel_id,authors(name,affiliation,email,phone,position),' +
  'evaluations(id,paper_id,panel_member_id,status,comments,evaluation_scores(criterion_id,marks)))';

export class SupabaseApi implements Api {
  // ---------- Reference data ----------
  async profile(userId: string): Promise<Profile | null> {
    const { data, error } = await getSupabase().from('profiles').select().eq('id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapProfile(data as ProfileRow) : null;
  }

  async tracks(): Promise<Track[]> {
    const { data, error } = await getSupabase().from('tracks').select().order('sort_order');
    if (error) throw new Error(error.message);
    return (data ?? []).map((j: TrackRow) => mapTrack(j));
  }

  async criteria(): Promise<Criterion[]> {
    const { data, error } = await getSupabase().from('criteria').select().order('sort_order');
    if (error) throw new Error(error.message);
    return (data ?? []).map((j: CriterionRow) => mapCriterion(j));
  }

  // ---------- Papers ----------
  async papers(trackId?: number): Promise<Paper[]> {
    let q = getSupabase().from('papers').select(paperCols);
    if (trackId != null) q = q.eq('track_id', trackId);
    const { data, error } = await q.order('pid').limit(5000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PaperRow[]).map((j) => mapPaper(j));
  }

  /** Papers assigned to the signed-in panel member, with *their own* evaluations (RLS filters both). */
  async myPapers(): Promise<Paper[]> {
    const { data, error } = await getSupabase()
      .from('papers')
      .select(`${paperCols},evaluations(id,paper_id,panel_member_id,status,comments,evaluation_scores(criterion_id,marks))`)
      .not('panel_id', 'is', null)
      .order('pid');
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PaperRow[]).map((j) => mapPaper(j));
  }

  async importPapers(rows: PaperDraftJson[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { data, error } = await getSupabase().rpc('import_papers', { p_rows: chunk });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { inserted?: number; updated?: number };
      inserted += res.inserted ?? 0;
      updated += res.updated ?? 0;
    }
    return { inserted, updated };
  }

  async savePaper(draft: PaperDraftJson): Promise<void> {
    const { error } = await getSupabase().rpc('import_papers', { p_rows: [draft] });
    if (error) throw new Error(error.message);
  }

  async importReviewScores(rows: ReviewScoreDraft[]): Promise<{ updated: number; unknown: string[] }> {
    let updated = 0;
    const unknown: string[] = [];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { data, error } = await getSupabase().rpc('import_review_scores', {
        p_rows: chunk.map((r) => r.toJson()),
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { updated?: number; unknown?: string[] };
      updated += res.updated ?? 0;
      unknown.push(...(res.unknown ?? []));
    }
    return { updated, unknown };
  }

  async deletePaper(id: string): Promise<void> {
    const { error } = await getSupabase().from('papers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // ---------- Panels ----------
  async panels(trackId?: number): Promise<Panel[]> {
    let q = getSupabase().from('panels').select(panelCols);
    if (trackId != null) q = q.eq('track_id', trackId);
    const { data, error } = await q.order('name');
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PanelRow[]).map((j) => mapPanel(j));
  }

  async panel(id: string): Promise<Panel | null> {
    const { data, error } = await getSupabase().from('panels').select(panelCols).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapPanel(data as unknown as PanelRow) : null;
  }

  async savePanel(input: {
    id?: string;
    name: string;
    trackId: number;
    venue?: string | null;
    scheduledAt?: string | null;
    members: PanelMemberInput[];
  }): Promise<string> {
    const { data, error } = await getSupabase().rpc('save_panel', {
      p_panel_id: input.id ?? null,
      p_name: input.name,
      p_track_id: input.trackId,
      p_venue: input.venue ?? null,
      p_scheduled_at: input.scheduledAt ?? null,
      p_members: input.members.map((m) => ({ name: m.name, email: m.email, phone: m.phone, affiliation: m.affiliation })),
    });
    if (error) throw new Error(error.message);
    return String(data);
  }

  async deletePanel(id: string): Promise<void> {
    const { error } = await getSupabase().rpc('delete_panel', { p_panel_id: id });
    if (error) throw new Error(error.message);
  }

  async setPaperPanel(paperIds: string[], panelId: string | null): Promise<void> {
    const { error } = await getSupabase().rpc('set_paper_panel', { p_paper_ids: paperIds, p_panel_id: panelId });
    if (error) throw new Error(error.message);
  }

  // ---------- Evaluations ----------
  async saveEvaluation(input: {
    paperId: string;
    marks: Record<string, number>;
    comments: string;
    submit: boolean;
  }): Promise<void> {
    const { error } = await getSupabase().rpc('save_evaluation', {
      p_paper_id: input.paperId,
      p_marks: input.marks,
      p_comments: input.comments,
      p_submit: input.submit,
    });
    if (error) throw new Error(error.message);
  }

  async unlockEvaluation(evaluationId: string): Promise<void> {
    const { error } = await getSupabase().rpc('unlock_evaluation', { p_evaluation_id: evaluationId });
    if (error) throw new Error(error.message);
  }

  // ---------- Results ----------
  async liveScores(trackId?: number): Promise<ScoreRow[]> {
    let q = getSupabase().from('paper_scores').select();
    if (trackId != null) q = q.eq('track_id', trackId);
    const { data, error } = await q.order('track_id').order('rank').order('pid').limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((j: ScoreRowRow) => mapScoreRow(j));
  }

  async finalizedScores(trackId?: number): Promise<ScoreRow[]> {
    let q = getSupabase().from('track_results').select();
    if (trackId != null) q = q.eq('track_id', trackId);
    const { data, error } = await q.order('track_id').order('rank').order('pid').limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((j: ScoreRowRow) => mapScoreRow(j));
  }

  async finalizeTrack(trackId: number): Promise<void> {
    const { error } = await getSupabase().rpc('finalize_track', { p_track_id: trackId });
    if (error) throw new Error(error.message);
  }

  async reopenTrack(trackId: number): Promise<void> {
    const { error } = await getSupabase().rpc('reopen_track', { p_track_id: trackId });
    if (error) throw new Error(error.message);
  }

  // ---------- Staff invites ----------
  async staffInvites(): Promise<StaffInvite[]> {
    const { data, error } = await getSupabase().from('staff_invites').select().order('email');
    if (error) throw new Error(error.message);
    return (data ?? []).map((j: StaffInviteRow) => ({ email: j.email, role: j.role }));
  }

  async addStaffInvite(email: string, role: AppRole): Promise<void> {
    const { data: sessionData } = await getSupabase().auth.getSession();
    const { error } = await getSupabase().from('staff_invites').upsert({
      email: email.trim().toLowerCase(),
      role,
      invited_by: sessionData.session?.user?.id ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async removeStaffInvite(email: string): Promise<void> {
    const { error } = await getSupabase().from('staff_invites').delete().eq('email', email);
    if (error) throw new Error(error.message);
  }

  // ---------- Training reset ----------
  async setResetAccess(email: string, enabled: boolean): Promise<void> {
    const { error } = await getSupabase().rpc('set_reset_access', {
      p_email: email.trim().toLowerCase(),
      p_enabled: enabled,
    });
    if (error) throw new Error(error.message);
  }

  async resetTrainingData(confirmPhrase: string): Promise<ResetSummary> {
    const { data, error } = await getSupabase().rpc('reset_training_data', {
      p_confirm: confirmPhrase,
    });
    if (error) throw new Error(error.message);
    const j = (data ?? {}) as ResetSummaryRow;
    return {
      evaluations: j.evaluations ?? 0,
      panels: j.panels ?? 0,
      panelMembers: j.panel_members ?? 0,
      reviewScores: j.review_scores ?? 0,
      tracksReopened: j.tracks_reopened ?? 0,
    };
  }

  async staffProfiles(): Promise<Profile[]> {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select()
      .in('role', ['organizing_chair', 'session_incharge'])
      .order('email');
    if (error) throw new Error(error.message);
    return (data ?? []).map((j: ProfileRow) => mapProfile(j));
  }

  async bulkCreateMembers(rows: MemberDraft[], role: AppRole = 'panel_member'): Promise<BulkCreateMembersResult> {
    const { data, error } = await getSupabase().functions.invoke<BulkCreateMembersResult>(
      'bulk_create_members',
      { body: { rows, role } },
    );
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No response from bulk_create_members.');
    return {
      created: data.created,
      skipped: data.skipped,
      errors: data.errors,
      credentials: (data.credentials ?? []) as MemberCredential[],
    };
  }

  /**
   * Every panelist in the system, independent of panel assignment: the union of
   * panel_member profiles (people with an account) and panel_members rows
   * (people placed on a panel, who may not have signed up yet). Someone on no
   * panel comes back with an empty `panels` array - that is the idle case.
   */
  async allPanelists(): Promise<PanelistSummary[]> {
    const sb = getSupabase();
    const [profs, pms, creds] = await Promise.all([
      sb.from('profiles').select('id, email, full_name, phone').eq('role', 'panel_member'),
      sb
        .from('panel_members')
        .select('id, name, email, phone, affiliation, profile_id, panel_id, panels(id, name, track_id)'),
      sb.from('panelist_credentials').select('email, password'),
    ]);
    if (profs.error) throw new Error(profs.error.message);
    if (pms.error) throw new Error(pms.error.message);
    if (creds.error) throw new Error(creds.error.message);

    const byEmail = new Map<string, PanelistSummary>();
    const take = (email: string): PanelistSummary => {
      const key = email.trim().toLowerCase();
      let row = byEmail.get(key);
      if (row == null) {
        row = {
          name: '',
          email: key,
          phone: null,
          affiliation: null,
          signedUp: false,
          password: null,
          panels: [],
        };
        byEmail.set(key, row);
      }
      return row;
    };

    for (const p of (profs.data ?? []) as {
      id: string;
      email: string;
      full_name?: string | null;
      phone?: string | null;
    }[]) {
      const row = take(p.email);
      row.signedUp = true;
      if (p.full_name != null && p.full_name.trim() !== '') row.name = p.full_name;
      if (row.phone == null) row.phone = p.phone ?? null;
    }

    type PanelEmbed = { id: string; name: string; track_id: number };
    for (const m of (pms.data ?? []) as unknown as {
      name: string;
      email: string;
      phone?: string | null;
      affiliation?: string | null;
      profile_id?: string | null;
      // PostgREST returns the embedded parent as an object; the generated
      // types widen it to an array, so accept either.
      panels?: PanelEmbed | PanelEmbed[] | null;
    }[]) {
      const row = take(m.email);
      if (row.name === '') row.name = m.name;
      if (row.phone == null) row.phone = m.phone ?? null;
      if (row.affiliation == null) row.affiliation = m.affiliation ?? null;
      if (m.profile_id != null) row.signedUp = true;
      const embed = m.panels ?? null;
      const panel: PanelEmbed | null = Array.isArray(embed) ? (embed[0] ?? null) : embed;
      if (panel != null && !row.panels.some((x) => x.id === panel.id)) {
        row.panels.push({ id: panel.id, name: panel.name, trackId: panel.track_id });
      }
    }

    for (const c of (creds.data ?? []) as { email: string; password: string }[]) {
      const row = byEmail.get(c.email.trim().toLowerCase());
      if (row != null) row.password = c.password;
    }

    for (const row of byEmail.values()) {
      if (row.name === '') row.name = row.email;
      row.panels.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async resetPanelistPassword(email: string): Promise<{ email: string; password: string }> {
    const { data, error } = await getSupabase().functions.invoke<{
      email: string;
      password: string;
      error?: string;
    }>('reset_panelist_password', { body: { email: email.trim().toLowerCase() } });
    if (error) throw new Error(error.message);
    if (!data || !data.password) throw new Error(data?.error ?? 'Could not reset the password.');
    return { email: data.email, password: data.password };
  }

  async availablePanelMembers(): Promise<PanelMemberSuggestion[]> {
    const sb = getSupabase();
    const [profs, pms] = await Promise.all([
      sb.from('profiles').select('email, full_name, phone').eq('role', 'panel_member'),
      sb.from('panel_members').select('email, name, phone, affiliation'),
    ]);
    if (profs.error) throw new Error(profs.error.message);
    if (pms.error) throw new Error(pms.error.message);

    const byEmail = new Map<string, PanelMemberSuggestion>();
    for (const p of profs.data ?? []) {
      const email = (p.email ?? '').trim().toLowerCase();
      if (email === '') continue;
      byEmail.set(email, { email, name: p.full_name ?? '', phone: p.phone ?? '', affiliation: '' });
    }
    // panel_members carries affiliation; merge it in (and fill any gaps).
    for (const m of pms.data ?? []) {
      const email = (m.email ?? '').trim().toLowerCase();
      if (email === '') continue;
      const prev = byEmail.get(email);
      byEmail.set(email, {
        email,
        name: m.name || prev?.name || '',
        phone: m.phone || prev?.phone || '',
        affiliation: m.affiliation || prev?.affiliation || '',
      });
    }
    return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
