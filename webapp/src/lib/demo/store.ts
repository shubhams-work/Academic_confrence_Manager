// In-memory database used in demo mode. Reset on every app start.
// Port of ../lib/demo/demo_store.dart.

import type { AppRole, Author, Criterion, ScoreRow } from '../types';

/** Thrown by the demo backend with a user-facing message (mirrors the errors raised by the database functions). */
export class DemoException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoException';
  }
}

export interface DTrack {
  id: number;
  name: string;
  finalizedAt: Date | null;
}

export interface DProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: AppRole | null;
}

export interface DPaper {
  id: string;
  pid: string;
  title: string;
  trackId: number;
  reviewScore: number | null;
  panelId: string | null;
  authors: Author[];
}

export interface DPanel {
  id: string;
  name: string;
  trackId: number;
  venue: string | null;
  scheduledAt: string | null;
}

export interface DMember {
  id: string;
  panelId: string;
  position: number;
  name: string;
  email: string;
  phone: string | null;
  affiliation: string | null;
  profileId: string | null;
}

export interface DEval {
  id: string;
  paperId: string;
  memberId: string;
  /** criterion id -> marks */
  marks: Record<number, number>;
  submitted: boolean;
  comments: string | null;
}

export class DemoStore {
  currentUserId: string | null = null;

  readonly tracks: DTrack[] = [];
  readonly criteria: Criterion[] = [];
  readonly profiles = new Map<string, DProfile>();
  readonly invites = new Map<string, AppRole>();
  readonly papers = new Map<string, DPaper>();
  readonly panels = new Map<string, DPanel>();
  readonly members = new Map<string, DMember>();
  readonly evals = new Map<string, DEval>();
  /** trackId -> frozen results snapshot */
  readonly snapshots = new Map<number, ScoreRow[]>();

  private seq = 1000;

  newId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  get currentUser(): DProfile | null {
    return this.currentUserId == null ? null : (this.profiles.get(this.currentUserId) ?? null);
  }

  profileByEmail(email: string): DProfile | null {
    const e = email.trim().toLowerCase();
    for (const p of this.profiles.values()) {
      if (p.email === e) return p;
    }
    return null;
  }

  track(id: number): DTrack {
    const t = this.tracks.find((x) => x.id === id);
    if (!t) throw new DemoException(`Track ${id} not found`);
    return t;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
