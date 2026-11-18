// In-memory Api that enforces the same rules as the SQL functions in
// supabase/migrations/0001_init.sql, plus the demo sign-in controller.
// Port of ../lib/demo/demo_backend.dart — keep validation messages identical.

import type { AuthController, AuthSnapshot } from '../auth';
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
  Profile,
  ReviewScoreDraft,
  ScoreRow,
  StaffInvite,
  Track,
} from '../types';
import { roleLabel } from '../types';
import type { Api, BulkCreateMembersResult, MemberCredential, MemberDraft, PanelMemberSuggestion } from '../api';
import { denseRank, finalScore, presentationScore } from '../scoring';
import { DemoException, sleep, type DEval, type DMember, type DPanel, type DPaper, type DProfile, type DemoStore } from './store';

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cmpText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface DemoApiOptions {
  /** Artificial latency so loading states are visible, like a real network call. */
  lagMs?: number;
}

export class DemoApi implements Api {
  constructor(
    readonly s: DemoStore,
    private readonly opts: DemoApiOptions = {},
  ) {}

  private async lag(): Promise<void> {
    const ms = this.opts.lagMs ?? 150;
    if (ms > 0) await sleep(ms);
  }

  // ---------- access helpers ----------
  private get role(): AppRole | null {
    return this.s.currentUser?.role ?? null;
  }

  private requireChair(): void {
    if (this.role !== 'organizing_chair') throw new DemoException('Only the Organizing Chair can do this');
  }

  private requireStaff(): void {
    if (this.role !== 'organizing_chair' && this.role !== 'session_incharge') {
      throw new DemoException('Only a Session Incharge or the Organizing Chair can do this');
    }
  }

  private trackOpen(trackId: number): boolean {
    return this.s.track(trackId).finalizedAt == null;
  }

  private membersOf(panelId: string | null): DMember[] {
    return [...this.s.members.values()].filter((m) => m.panelId === panelId);
  }

  private get myPanelIds(): Set<string> {
    const ids = new Set<string>();
    for (const m of this.s.members.values()) {
      if (m.profileId != null && m.profileId === this.s.currentUserId) ids.add(m.panelId);
    }
    return ids;
  }

  private toEval(e: DEval): Evaluation {
    return {
      id: e.id,
      paperId: e.paperId,
      panelMemberId: e.memberId,
      submitted: e.submitted,
      marks: { ...e.marks },
      comments: e.comments,
    };
  }

  private toPaper(p: DPaper, onlyMine = false): Paper {
    const panel = p.panelId == null ? null : this.s.panels.get(p.panelId) ?? null;
    let evals = [...this.s.evals.values()].filter((e) => e.paperId === p.id);
    if (onlyMine) {
      evals = evals.filter((e) => this.s.members.get(e.memberId)?.profileId === this.s.currentUserId);
    }
    return {
      id: p.id,
      pid: p.pid,
      title: p.title,
      trackId: p.trackId,
      reviewScore: p.reviewScore,
      panelId: p.panelId,
      panelName: panel?.name ?? null,
      panelVenue: panel?.venue ?? null,
      panelScheduledAt: panel?.scheduledAt ?? null,
      authors: p.authors.map((a) => ({ ...a })),
      evaluations: evals.map((e) => this.toEval(e)),
    };
  }

  private toPanel(p: DPanel): Panel {
    return {
      id: p.id,
      name: p.name,
      trackId: p.trackId,
      venue: p.venue,
      scheduledAt: p.scheduledAt,
      members: this.membersOf(p.id)
        .map(
          (m): PanelMember => ({
            id: m.id,
            position: m.position,
            name: m.name,
            email: m.email,
            phone: m.phone,
            affiliation: m.affiliation,
            profileId: m.profileId,
          }),
        )
        .sort((a, b) => a.position - b.position),
      papers: [...this.s.papers.values()]
        .filter((paper) => paper.panelId === p.id)
        .map((paper) => this.toPaper(paper))
        .sort((a, b) => cmpText(a.pid, b.pid)),
    };
  }

  private toProfile(p: DProfile): Profile {
    return { id: p.id, email: p.email, fullName: p.fullName, phone: p.phone, role: p.role };
  }

  private blank(v: unknown): string | null {
    const t = typeof v === 'string' ? v.trim() : null;
    return t == null || t === '' ? null : t;
  }

  // ---------- reference data ----------
  async profile(userId: string): Promise<Profile | null> {
    const p = this.s.profiles.get(userId);
    return p ? this.toProfile(p) : null;
  }

  async tracks(): Promise<Track[]> {
    await this.lag();
    return this.s.tracks.map((t) => ({ id: t.id, name: t.name, sortOrder: t.id, finalizedAt: t.finalizedAt == null ? null : t.finalizedAt.toISOString() }));
  }

  async criteria(): Promise<Criterion[]> {
    return [...this.s.criteria];
  }

  // ---------- papers ----------
  async papers(trackId?: number): Promise<Paper[]> {
    await this.lag();
    this.requireStaff();
    return [...this.s.papers.values()]
      .filter((p) => trackId == null || p.trackId === trackId)
      .map((p) => this.toPaper(p))
      .sort((a, b) => cmpText(a.pid, b.pid));
  }

  async myPapers(): Promise<Paper[]> {
    await this.lag();
    const mine = this.myPanelIds;
    return [...this.s.papers.values()]
      .filter((p) => p.panelId != null && mine.has(p.panelId))
      .map((p) => this.toPaper(p, true))
      .sort((a, b) => cmpText(a.pid, b.pid));
  }

  async importPapers(rows: PaperDraftJson[]): Promise<{ inserted: number; updated: number }> {
    await this.lag();
    this.requireChair();
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      const pid = (r.pid ?? '').trim();
      const title = (r.title ?? '').trim();
      if (pid === '' || title === '') throw new DemoException('Paper ID and Title are required');
      const trackName = (r.track ?? '').trim().toLowerCase();
      const track = this.s.tracks.find((t) => t.name.toLowerCase() === trackName);
      if (!track) throw new DemoException(`Unknown track "${r.track}" for paper ${pid}`);
      if (!this.trackOpen(track.id)) throw new DemoException(`Track "${track.name}" is finalized; reopen it before changing paper ${pid}`);
      const review = r.review_score ?? null;

      const existing = [...this.s.papers.values()].find((p) => p.pid === pid) ?? null;
      let paper: DPaper;
      if (existing == null) {
        paper = { id: this.s.newId('pp'), pid, title, trackId: track.id, reviewScore: review, panelId: null, authors: [] };
        this.s.papers.set(paper.id, paper);
        inserted++;
      } else {
        if (!this.trackOpen(existing.trackId)) throw new DemoException(`Paper ${pid} belongs to a finalized track`);
        paper = existing;
        paper.title = title;
        paper.reviewScore = review ?? existing.reviewScore;
        if (existing.trackId !== track.id) {
          existing.panelId = null;
          existing.trackId = track.id;
        }
        updated++;
      }
      if ('authors' in r && r.authors != null) {
        paper.authors = r.authors
          .filter((a) => (a.name ?? '').trim() !== '')
          .map(
            (a): Author => ({
              name: a.name.trim(),
              affiliation: this.blank(a.affiliation),
              email: this.blank(a.email)?.toLowerCase() ?? null,
              phone: this.blank(a.phone),
            }),
          );
      }
    }
    return { inserted, updated };
  }

  async savePaper(draft: PaperDraftJson): Promise<void> {
    await this.importPapers([draft]);
  }

  async importReviewScores(rows: ReviewScoreDraft[]): Promise<{ updated: number; unknown: string[] }> {
    await this.lag();
    this.requireChair();
    let updated = 0;
    const unknown: string[] = [];
    for (const r of rows) {
      const p = [...this.s.papers.values()].find((x) => x.pid === r.pid) ?? null;
      if (p == null) {
        unknown.push(r.pid);
        continue;
      }
      if (!this.trackOpen(p.trackId)) throw new DemoException(`Paper ${p.pid} belongs to a finalized track`);
      p.reviewScore = r.score;
      updated++;
    }
    return { updated, unknown };
  }

  async deletePaper(id: string): Promise<void> {
    await this.lag();
    this.requireChair();
    const p = this.s.papers.get(id);
    if (!p) return;
    if (!this.trackOpen(p.trackId)) throw new DemoException('This paper belongs to a finalized track');
    this.s.papers.delete(id);
    for (const [k, e] of this.s.evals) {
      if (e.paperId === id) this.s.evals.delete(k);
    }
  }

  // ---------- panels ----------
  async panels(trackId?: number): Promise<Panel[]> {
    await this.lag();
    this.requireStaff();
    return [...this.s.panels.values()]
      .filter((p) => trackId == null || p.trackId === trackId)
      .map((p) => this.toPanel(p))
      .sort((a, b) => cmpText(a.name, b.name));
  }

  async panel(id: string): Promise<Panel | null> {
    await this.lag();
    this.requireStaff();
    const p = this.s.panels.get(id);
    return p ? this.toPanel(p) : null;
  }

  async savePanel(input: {
    id?: string;
    name: string;
    trackId: number;
    venue?: string | null;
    scheduledAt?: string | null;
    members: PanelMemberInput[];
  }): Promise<string> {
    await this.lag();
    this.requireStaff();
    const { id, name, trackId, members } = input;
    const venue = input.venue ?? null;
    const scheduledAt = input.scheduledAt ?? null;
    if (name.trim() === '') throw new DemoException('Panel name is required');
    if (members.length !== 2) throw new DemoException('A panel must have exactly 2 members');
    const emails = members.map((m) => m.email.trim().toLowerCase());
    if (emails[0] === emails[1]) throw new DemoException('The two panel members must have different emails');
    for (let i = 0; i < 2; i++) {
      if (members[i]!.name.trim() === '') throw new DemoException(`Name of member ${i + 1} is required`);
      if (!emailRe.test(emails[i]!)) throw new DemoException(`Email of member ${i + 1} is not valid`);
    }

    let panel: DPanel;
    if (id == null) {
      panel = { id: this.s.newId('pn'), name: name.trim(), trackId, venue: null, scheduledAt: null };
      this.s.panels.set(panel.id, panel);
    } else {
      const existing = this.s.panels.get(id);
      if (!existing) throw new DemoException('Panel not found');
      if ([...this.s.papers.values()].some((p) => p.panelId === id && p.trackId !== trackId)) {
        throw new DemoException("Unassign this panel's papers before changing its track");
      }
      panel = existing;
    }
    panel.name = name.trim();
    panel.trackId = trackId;
    panel.venue = venue == null || venue.trim() === '' ? null : venue.trim();
    panel.scheduledAt = scheduledAt;

    for (let i = 0; i < 2; i++) {
      const inputMember = members[i]!;
      const email = emails[i]!;
      const old = this.membersOf(panel.id).find((m) => m.position === i + 1) ?? null;
      if (old != null && old.email !== email) {
        if ([...this.s.evals.values()].some((e) => e.memberId === old.id && e.submitted)) {
          throw new DemoException(`Member ${i + 1} has already submitted scores and cannot be replaced`);
        }
        for (const [k, e] of this.s.evals) {
          if (e.memberId === old.id) this.s.evals.delete(k);
        }
      }
      const profile = this.s.profileByEmail(email);
      const m: DMember =
        old ?? { id: this.s.newId('m'), panelId: panel.id, position: i + 1, name: '', email, phone: null, affiliation: null, profileId: null };
      m.name = inputMember.name.trim();
      m.email = email;
      m.phone = inputMember.phone.trim() === '' ? null : inputMember.phone.trim();
      m.affiliation = inputMember.affiliation.trim() === '' ? null : inputMember.affiliation.trim();
      m.profileId = profile?.id ?? null;
      this.s.members.set(m.id, m);
      if (profile && profile.role == null) profile.role = 'panel_member';
    }
    return panel.id;
  }

  async deletePanel(id: string): Promise<void> {
    await this.lag();
    this.requireStaff();
    const memberIds = new Set(this.membersOf(id).map((m) => m.id));
    if ([...this.s.evals.values()].some((e) => memberIds.has(e.memberId) && e.submitted)) {
      throw new DemoException('This panel already has submitted scores and cannot be deleted');
    }
    for (const [k, e] of this.s.evals) {
      if (memberIds.has(e.memberId)) this.s.evals.delete(k);
    }
    for (const [k, m] of this.s.members) {
      if (m.panelId === id) this.s.members.delete(k);
    }
    for (const p of this.s.papers.values()) {
      if (p.panelId === id) p.panelId = null;
    }
    this.s.panels.delete(id);
  }

  async setPaperPanel(paperIds: string[], panelId: string | null): Promise<void> {
    await this.lag();
    this.requireStaff();
    const panel = panelId == null ? null : this.s.panels.get(panelId) ?? null;
    if (panelId != null && panel == null) throw new DemoException('Panel not found');
    for (const id of paperIds) {
      const p = this.s.papers.get(id);
      if (!p) continue;
      if (!this.trackOpen(p.trackId)) throw new DemoException(`Paper ${p.pid} belongs to a finalized track`);
      if (panel != null && p.trackId !== panel.trackId) {
        throw new DemoException(`Paper ${p.pid} is in a different track than the panel`);
      }
      if (p.panelId !== panelId) {
        if ([...this.s.evals.values()].some((e) => e.paperId === id && e.submitted)) {
          throw new DemoException(`Paper ${p.pid} already has submitted scores; ask the Chair to unlock them first`);
        }
        for (const [k, e] of this.s.evals) {
          if (e.paperId === id) this.s.evals.delete(k);
        }
        p.panelId = panelId;
      }
    }
  }

  // ---------- evaluations ----------
  async saveEvaluation(input: {
    paperId: string;
    marks: Record<string, number>;
    comments: string;
    submit: boolean;
  }): Promise<void> {
    await this.lag();
    const p = this.s.papers.get(input.paperId);
    if (!p) throw new DemoException('Paper not found');
    const member = this.membersOf(p.panelId).find((m) => m.profileId === this.s.currentUserId) ?? null;
    if (!member) throw new DemoException('You are not on the panel for this paper');
    if (!this.trackOpen(p.trackId)) throw new DemoException('Results for this track are finalized');

    const existing = [...this.s.evals.values()].find((e) => e.paperId === input.paperId && e.memberId === member.id) ?? null;
    if (existing?.submitted === true) throw new DemoException('You have already submitted scores for this paper');

    const byId: Record<number, number> = {};
    for (const c of this.s.criteria) {
      const v = input.marks[c.code];
      if (v == null) {
        if (input.submit) throw new DemoException(`Please mark "${c.name}" before submitting`);
        continue;
      }
      if (v < 0 || v > c.maxMarks) throw new DemoException(`"${c.name}" must be a whole number from 0 to ${c.maxMarks}`);
      byId[c.id] = v;
    }
    const e: DEval =
      existing ?? { id: this.s.newId('ev'), paperId: input.paperId, memberId: member.id, marks: {}, submitted: false, comments: null };
    e.marks = byId;
    e.submitted = input.submit;
    e.comments = input.comments.trim() === '' ? null : input.comments.trim();
    this.s.evals.set(e.id, e);
  }

  async unlockEvaluation(evaluationId: string): Promise<void> {
    await this.lag();
    this.requireChair();
    const e = this.s.evals.get(evaluationId);
    if (!e) return;
    const paper = this.s.papers.get(e.paperId);
    if (!paper) throw new DemoException('Paper not found');
    if (!this.trackOpen(paper.trackId)) throw new DemoException('Reopen the track before unlocking scores');
    e.submitted = false;
  }

  // ---------- results ----------
  async liveScores(trackId?: number): Promise<ScoreRow[]> {
    await this.lag();
    this.requireStaff();
    const rows: ScoreRow[] = [];
    for (const t of this.s.tracks) {
      if (trackId != null && t.id !== trackId) continue;
      const papers = [...this.s.papers.values()].filter((p) => p.trackId === t.id);
      const data: { p: DPaper; pres: number | null; fin: number; submitted: number; memberCount: number }[] = [];
      for (const p of papers) {
        const memberIds = new Set(this.membersOf(p.panelId).map((m) => m.id));
        const totals = [...this.s.evals.values()]
          .filter((e) => e.paperId === p.id && e.submitted && memberIds.has(e.memberId))
          .map((e) => Object.values(e.marks).reduce((x, y) => x + y, 0));
        const pres = presentationScore(totals);
        data.push({
          p,
          pres,
          fin: finalScore(pres, p.reviewScore),
          submitted: totals.length,
          memberCount: p.panelId == null ? 0 : memberIds.size,
        });
      }
      const ranks = denseRank(data.map((d) => d.fin));
      data.forEach((d, i) => {
        rows.push({
          paperId: d.p.id,
          pid: d.p.pid,
          title: d.p.title,
          trackId: t.id,
          panelName: d.p.panelId == null ? null : this.s.panels.get(d.p.panelId)?.name ?? null,
          presentationScore: d.pres,
          reviewScore: d.p.reviewScore,
          finalScore: d.fin,
          rank: ranks[i]!,
          submittedCount: d.submitted,
          memberCount: d.memberCount,
        });
      });
    }
    rows.sort((a, b) => a.trackId - b.trackId || a.rank - b.rank || cmpText(a.pid, b.pid));
    return rows;
  }

  async finalizedScores(trackId?: number): Promise<ScoreRow[]> {
    await this.lag();
    this.requireStaff();
    const rows: ScoreRow[] = [];
    for (const [key, value] of this.s.snapshots) {
      if (trackId == null || key === trackId) rows.push(...value);
    }
    return rows;
  }

  async finalizeTrack(trackId: number): Promise<void> {
    this.requireChair();
    this.s.snapshots.set(trackId, await this.liveScores(trackId));
    this.s.track(trackId).finalizedAt = new Date();
  }

  async reopenTrack(trackId: number): Promise<void> {
    await this.lag();
    this.requireChair();
    this.s.snapshots.delete(trackId);
    this.s.track(trackId).finalizedAt = null;
  }

  // ---------- staff ----------
  async staffInvites(): Promise<StaffInvite[]> {
    await this.lag();
    this.requireChair();
    return [...this.s.invites.entries()]
      .map(([email, role]) => ({ email, role }))
      .sort((a, b) => cmpText(a.email, b.email));
  }

  async addStaffInvite(email: string, role: AppRole): Promise<void> {
    await this.lag();
    this.requireChair();
    const e = email.trim().toLowerCase();
    this.s.invites.set(e, role);
    const p = this.s.profileByEmail(e);
    if (p) p.role = role;
  }

  async removeStaffInvite(email: string): Promise<void> {
    await this.lag();
    this.requireChair();
    this.s.invites.delete(email);
    const p = this.s.profileByEmail(email);
    if (p) {
      p.role = [...this.s.members.values()].some((m) => m.email === email) ? 'panel_member' : null;
    }
  }

  async staffProfiles(): Promise<Profile[]> {
    this.requireChair();
    return [...this.s.profiles.values()]
      .filter((p) => p.role === 'organizing_chair' || p.role === 'session_incharge')
      .map((p) => this.toProfile(p));
  }

  async bulkCreateMembers(rows: MemberDraft[]): Promise<BulkCreateMembersResult> {
    await this.lag();
    this.requireStaff();
    const creds: MemberCredential[] = [];
    let created = 0;
    let skipped = 0;
    for (const r of rows) {
      const email = r.email.trim().toLowerCase();
      const name = r.name.trim();
      if (name === '' || !emailRe.test(email)) {
        creds.push({ email, password: '', name, status: 'error', note: 'Invalid name or email' });
        continue;
      }
      const existing = [...this.s.profiles.values()].find((p) => p.email === email);
      if (existing) {
        if (existing.role == null) existing.role = 'panel_member';
        creds.push({ email, password: '', name, status: 'exists' });
        skipped++;
        continue;
      }
      const password = demoRandomPassword();
      const id = crypto.randomUUID();
      this.s.profiles.set(id, {
        id,
        email,
        fullName: name,
        phone: r.phone ?? null,
        role: 'panel_member',
      });
      creds.push({ email, password, name, status: 'created' });
      created++;
    }
    const errors = creds.filter((c) => c.status === 'error').length;
    return { created, skipped, errors, credentials: creds };
  }

  async availablePanelMembers(): Promise<PanelMemberSuggestion[]> {
    this.requireStaff();
    const byEmail = new Map<string, PanelMemberSuggestion>();
    for (const p of this.s.profiles.values()) {
      if (p.role !== 'panel_member') continue;
      const email = p.email.trim().toLowerCase();
      if (email === '') continue;
      byEmail.set(email, { email, name: p.fullName, phone: p.phone ?? '', affiliation: '' });
    }
    for (const m of this.s.members.values()) {
      const email = m.email.trim().toLowerCase();
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

function demoRandomPassword(len = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[(buf[i] ?? 0) % alphabet.length];
  return out;
}

// ---------------------------------------------------------------------------
// Demo sign-in: any password works; quick-login buttons for each role.
// Port of DemoAuthController in ../lib/demo/demo_backend.dart.

export class DemoAuth implements AuthController {
  notice: string | null = null;

  private listeners = new Set<() => void>();
  private snap: AuthSnapshot;

  constructor(readonly s: DemoStore) {
    this.snap = this.build();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getSnapshot(): AuthSnapshot {
    return this.snap;
  }

  private build(): AuthSnapshot {
    const p = this.s.currentUser;
    return {
      loading: false,
      signedIn: this.s.currentUserId != null,
      email: p?.email ?? null,
      profile: p ? { id: p.id, email: p.email, fullName: p.fullName, phone: p.phone, role: p.role } : null,
      role: p?.role ?? null,
      recoveringPassword: false,
      error: null,
      notice: this.notice,
      isDemo: true,
      demoAccounts: [...this.s.profiles.values()]
        .filter((x) => x.role != null)
        .map((x) => [`${roleLabel[x.role!]} — ${x.fullName}`, x.email] as [string, string]),
    };
  }

  private notify(): void {
    this.snap = this.build();
    for (const l of this.listeners) l();
  }

  async signIn(email: string, _password: string): Promise<void> {
    await sleep(150);
    const p = this.s.profileByEmail(email);
    if (!p) {
      throw new DemoException(`No demo account for ${email.trim()}. Use a demo account below, or Sign up with an invited email.`);
    }
    this.notice = null;
    this.s.currentUserId = p.id;
    this.notify();
  }

  async signUp(input: { email: string; password: string; fullName: string; phone: string }): Promise<boolean> {
    await sleep(150);
    const e = input.email.trim().toLowerCase();
    if (this.s.profileByEmail(e) != null) {
      throw new DemoException('An account with this email already exists. Sign in instead.');
    }
    const role =
      this.s.invites.get(e) ?? ([...this.s.members.values()].some((m) => m.email === e) ? ('panel_member' as AppRole) : null);
    const p: DProfile = { id: this.s.newId('u'), email: e, fullName: input.fullName.trim(), role, phone: input.phone.trim() };
    this.s.profiles.set(p.id, p);
    for (const m of this.s.members.values()) {
      if (m.email === e) m.profileId = p.id;
    }
    this.s.currentUserId = p.id;
    this.notify();
    return false; // no email confirmation in demo mode
  }

  async sendPasswordReset(_email: string): Promise<void> {}

  async setNewPassword(_password: string): Promise<void> {}

  async signOut(): Promise<void> {
    this.s.currentUserId = null;
    this.notify();
  }

  async refreshProfile(): Promise<void> {
    this.notify();
  }
}
