// All data access used by the screens. Implemented by SupabaseApi.
// Port of ../lib/core/repository.dart.

import type {
  AppRole,
  Criterion,
  Panel,
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
import { SupabaseApi } from './supabaseApi';

export interface Api {
  // ---------- Reference data ----------
  profile(userId: string): Promise<Profile | null>;
  tracks(): Promise<Track[]>;
  criteria(): Promise<Criterion[]>;

  // ---------- Papers ----------
  papers(trackId?: number): Promise<Paper[]>;
  /** Papers assigned to the signed-in panel member, with only their own evaluations. */
  myPapers(): Promise<Paper[]>;
  importPapers(rows: PaperDraftJson[]): Promise<{ inserted: number; updated: number }>;
  savePaper(draft: PaperDraftJson): Promise<void>;
  importReviewScores(rows: ReviewScoreDraft[]): Promise<{ updated: number; unknown: string[] }>;
  deletePaper(id: string): Promise<void>;

  // ---------- Panels ----------
  panels(trackId?: number): Promise<Panel[]>;
  panel(id: string): Promise<Panel | null>;
  savePanel(input: {
    id?: string;
    name: string;
    trackId: number;
    venue?: string | null;
    scheduledAt?: string | null;
    members: PanelMemberInput[];
  }): Promise<string>;
  deletePanel(id: string): Promise<void>;
  setPaperPanel(paperIds: string[], panelId: string | null): Promise<void>;

  // ---------- Evaluations ----------
  saveEvaluation(input: {
    paperId: string;
    /** criterion code -> marks */
    marks: Record<string, number>;
    comments: string;
    submit: boolean;
  }): Promise<void>;
  unlockEvaluation(evaluationId: string): Promise<void>;

  // ---------- Results ----------
  liveScores(trackId?: number): Promise<ScoreRow[]>;
  finalizedScores(trackId?: number): Promise<ScoreRow[]>;
  finalizeTrack(trackId: number): Promise<void>;
  reopenTrack(trackId: number): Promise<void>;

  // ---------- Staff ----------
  staffInvites(): Promise<StaffInvite[]>;
  addStaffInvite(email: string, role: AppRole): Promise<void>;
  removeStaffInvite(email: string): Promise<void>;
  staffProfiles(): Promise<Profile[]>;
  /** Grant or revoke a signed-up user's permission to run the training reset. */
  setResetAccess(email: string, enabled: boolean): Promise<void>;

  // ---------- Training reset ----------
  /** Clears evaluations, panels/members and review scores. Papers are kept. */
  resetTrainingData(confirmPhrase: string): Promise<ResetSummary>;

  // ---------- Panel members (bulk) ----------
  /** Creates sign-in accounts. `role` defaults to 'panel_member'; 'session_incharge' is chair-only. */
  bulkCreateMembers(rows: MemberDraft[], role?: AppRole): Promise<BulkCreateMembersResult>;
  /** Already-onboarded members, for autofill when assigning to a panel. */
  availablePanelMembers(): Promise<PanelMemberSuggestion[]>;
  /** Every panelist, whether or not they are on a panel, with their panels. */
  allPanelists(): Promise<PanelistSummary[]>;
  /**
   * Generates a new password for a panelist and returns it. Supabase only
   * stores a hash, so an existing password can never be shown - it can only be
   * replaced. The old password stops working immediately.
   */
  resetPanelistPassword(email: string): Promise<{ email: string; password: string }>;
  /** Chair only. Deletes the account, its stored password and every panel seat. */
  deletePanelist(email: string, force?: boolean): Promise<DeletePanelistResult>;
}

export interface MemberDraft {
  name: string;
  email: string;
  phone?: string | null;
  affiliation?: string | null;
}

export interface PanelMemberSuggestion {
  email: string;
  name: string;
  phone: string;
  affiliation: string;
}

export interface MemberCredential {
  email: string;
  password: string;
  name: string;
  status: 'created' | 'exists' | 'error';
  note?: string;
}

export interface BulkCreateMembersResult {
  created: number;
  skipped: number;
  errors: number;
  credentials: MemberCredential[];
}

let instance: Api | null = null;

/** The shared Api instance. */
export function getApi(): Api {
  if (!instance) {
    instance = new SupabaseApi();
  }
  return instance as Api;
}

/** Turns Supabase / network errors into a short message for the user. */
export interface DeletePanelistResult {
  email: string;
  deletedAccount: boolean;
  removedFromPanels: number;
  deletedEvaluations: number;
}

/** A delete refused because it would erase submitted scores; retry with force. */
export class NeedsForceError extends Error {
  readonly submitted: number;
  constructor(message: string, submitted: number) {
    super(message);
    this.name = 'NeedsForceError';
    this.submitted = submitted;
  }
}

export function friendlyError(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'TypeError' || /failed to fetch|networkerror|load failed|network/i.test(e.message)) {
      return 'Network error — check your connection and try again.';
    }
    return e.message;
  }
  return String(e);
}
