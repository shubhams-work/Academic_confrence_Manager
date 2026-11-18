// All data access used by the screens. Implemented by SupabaseApi (real
// backend) and DemoApi (in-memory sample data). Port of ../lib/core/repository.dart.

import type {
  AppRole,
  Criterion,
  Panel,
  PanelMemberInput,
  Paper,
  PaperDraftJson,
  Profile,
  ReviewScoreDraft,
  ScoreRow,
  StaffInvite,
  Track,
} from './types';
import { isDemo } from './config';
import { SupabaseApi } from './supabaseApi';
import { DemoApi } from './demo/demoApi';
import { getDemoStore } from './demo/seed';

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

  // ---------- Panel members (bulk) ----------
  bulkCreateMembers(rows: MemberDraft[]): Promise<BulkCreateMembersResult>;
  /** Already-onboarded members, for autofill when assigning to a panel. */
  availablePanelMembers(): Promise<PanelMemberSuggestion[]>;
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

/** The shared Api instance (Supabase, or the demo backend in demo mode). */
export function getApi(): Api {
  if (!instance) {
    instance = isDemo ? new DemoApi(getDemoStore()) : new SupabaseApi();
  }
  return instance as Api;
}

/** Turns Supabase / network errors into a short message for the user. */
export function friendlyError(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'TypeError' || /failed to fetch|networkerror|load failed|network/i.test(e.message)) {
      return 'Network error — check your connection and try again.';
    }
    return e.message;
  }
  return String(e);
}
