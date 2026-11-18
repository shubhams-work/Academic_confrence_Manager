import { presentationScore } from '../../../lib/scoring';
import { evalTotal, type Evaluation, type Panel, type Paper } from '../../../lib/types';

const dateTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Tue 18 Nov, 10:30 am" in the viewer's timezone, or null. */
export function formatDateTime(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dateTime.format(d);
}

/** "Seminar Hall 2 · Tue 18 Nov, 10:30 am" (either part may be missing). */
export function venueLine(venue: string | null | undefined, scheduledAt: string | null | undefined): string {
  return [venue?.trim() || null, formatDateTime(scheduledAt)].filter((s): s is string => s != null).join(' · ');
}

/** ISO timestamp -> value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO timestamp, or null when empty. */
export function fromLocalInput(v: string): string | null {
  if (v.trim() === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Same messages as the Dart emailValidator. */
export function emailError(v: string): string | null {
  if (v.trim() === '') return 'Email is required';
  if (!emailRe.test(v.trim())) return 'Enter a valid email';
  return null;
}

/** The evaluation a given panel member wrote for a paper, if any. */
export function evaluationOf(paper: Paper, memberId: string): Evaluation | undefined {
  return paper.evaluations.find((e) => e.panelMemberId === memberId);
}

/** Average of the submitted totals of the panel's *current* members (null if none). */
export function paperPresentation(paper: Paper, panel: Panel): number | null {
  const memberIds = new Set(panel.members.map((m) => m.id));
  return presentationScore(
    paper.evaluations.filter((e) => e.submitted && memberIds.has(e.panelMemberId)).map(evalTotal),
  );
}

/** Submitted evaluations by the panel's current members, across all its papers. */
export function panelProgress(panel: Panel): { done: number; expected: number } {
  const memberIds = new Set(panel.members.map((m) => m.id));
  let done = 0;
  for (const p of panel.papers) {
    done += p.evaluations.filter((e) => e.submitted && memberIds.has(e.panelMemberId)).length;
  }
  return { done, expected: panel.papers.length * panel.members.length };
}
