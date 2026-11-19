// Plain domain types mapped from Supabase rows (see ../lib/core/models.dart).

export type AppRole = 'organizing_chair' | 'session_incharge' | 'panel_member';

export const roleLabel: Record<AppRole, string> = {
  organizing_chair: 'Organizing Chair',
  session_incharge: 'Session Incharge',
  panel_member: 'Panel Member',
};

export function isStaffRole(role: AppRole | null | undefined): boolean {
  return role === 'organizing_chair' || role === 'session_incharge';
}

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: AppRole | null;
  /** May run the training reset (granted/revoked by the Organizing Chair). */
  canResetData: boolean;
}

/** Typed by hand to confirm a training reset; also checked server-side. */
export const RESET_CONFIRM_PHRASE = 'RESET TRAINING DATA';

/** What a training reset cleared. */
export interface ResetSummary {
  evaluations: number;
  panels: number;
  panelMembers: number;
  reviewScores: number;
  tracksReopened: number;
}

export interface Track {
  id: number;
  name: string;
  sortOrder: number;
  finalizedAt: string | null;
}

export interface Criterion {
  id: number;
  code: string;
  name: string;
  maxMarks: number;
}

export interface Author {
  name: string;
  affiliation?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface Evaluation {
  id: string;
  paperId: string;
  panelMemberId: string;
  submitted: boolean;
  comments?: string | null;
  /** criterionId -> marks */
  marks: Record<number, number>;
}

export interface Paper {
  id: string;
  pid: string;
  title: string;
  trackId: number;
  reviewScore: number | null;
  panelId: string | null;
  panelName?: string | null;
  panelVenue?: string | null;
  panelScheduledAt?: string | null;
  authors: Author[];
  evaluations: Evaluation[];
}

export interface PanelMember {
  id: string;
  position: number;
  name: string;
  email: string;
  phone?: string | null;
  affiliation?: string | null;
  profileId: string | null;
}

export interface PanelMemberInput {
  name: string;
  email: string;
  phone: string;
  affiliation: string;
}

export interface Panel {
  id: string;
  name: string;
  trackId: number;
  venue?: string | null;
  scheduledAt?: string | null;
  /** Who created the panel. Name is null for panel members (RLS hides other profiles). */
  createdById?: string | null;
  createdByName?: string | null;
  members: PanelMember[];
  papers: Paper[];
}

/** One row of the results table (live view or finalized snapshot). */
export interface ScoreRow {
  paperId?: string | null;
  pid: string;
  title: string;
  trackId: number;
  panelName?: string | null;
  presentationScore: number | null;
  reviewScore: number | null;
  finalScore: number;
  rank: number;
  submittedCount: number;
  memberCount: number;
}

export interface StaffInvite {
  email: string;
  role: AppRole;
}

// Derived helpers (mirrors of the Dart model getters).

export function evalTotal(e: Evaluation): number {
  return Object.values(e.marks).reduce((a, b) => a + b, 0);
}

export function panelSubmittedCount(p: Panel): number {
  return p.papers.reduce((sum, x) => sum + x.evaluations.filter((e) => e.submitted).length, 0);
}

export function panelExpectedCount(p: Panel): number {
  return p.papers.length * p.members.length;
}

export function isScoringComplete(r: ScoreRow): boolean {
  return r.memberCount > 0 && r.submittedCount >= r.memberCount;
}

export function isReviewMissing(r: ScoreRow): boolean {
  return r.reviewScore == null;
}

export function isUnassigned(r: ScoreRow): boolean {
  return r.memberCount === 0;
}

export function hasWarning(r: ScoreRow): boolean {
  return !isScoringComplete(r) || isReviewMissing(r);
}

export function authorContact(a: Author): string {
  return [a.email, a.phone].filter((s): s is string => s != null && s !== '').join(' · ');
}

// Re-exported so everything can be imported from './types'.
export type {
  AuthorDraft,
  AuthorDraftJson,
  ImportIssue,
  PaperDraft,
  PaperDraftJson,
  PaperImportResult,
  ReviewImportResult,
  ReviewScoreDraft,
  ReviewScoreDraftJson,
} from './importParse';
