// Parser for the panel-members .xlsx that the Session Incharge uploads.
// Mirrors the style of importParse.ts: pure functions over string[][] rows,
// tolerant header aliases, row-by-row issues collected rather than thrown.

import type { MemberDraft } from './api';
import { PHONE_LENGTH, phoneDigits } from './phone';

export interface MemberImportIssue {
  row: number;
  message: string;
}

export interface MemberImportResult {
  rows: MemberDraft[];
  issues: MemberImportIssue[];
  /** Emails we saw more than once in the sheet (reported as issues too). */
  duplicateEmails: string[];
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const HEADER_ALIASES: Record<string, keyof MemberDraft> = {
  name: 'name',
  'full name': 'name',
  'member name': 'name',
  email: 'email',
  'email id': 'email',
  'e-mail': 'email',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  affiliation: 'affiliation',
  institution: 'affiliation',
  college: 'affiliation',
  organization: 'affiliation',
};

function cleanCell(v: string | undefined): string {
  return (v ?? '').trim();
}

function headerKey(cell: string): keyof MemberDraft | null {
  const k = cell.trim().toLowerCase();
  return HEADER_ALIASES[k] ?? null;
}

/**
 * Parses rows from readSheetRows() — first row is the header. Returns
 * a draft-ready array plus any issues (empty rows are skipped, not reported).
 */
export function parseMembers(rows: string[][]): MemberImportResult {
  const issues: MemberImportIssue[] = [];
  const out: MemberDraft[] = [];
  const seen = new Map<string, number>();
  const dupes = new Set<string>();

  if (rows.length === 0) {
    return { rows: [], issues: [{ row: 0, message: 'Sheet is empty' }], duplicateEmails: [] };
  }

  const header = (rows[0] ?? []).map((c) => headerKey(cleanCell(c)));
  const nameCol = header.indexOf('name');
  const emailCol = header.indexOf('email');
  if (nameCol < 0 || emailCol < 0) {
    return {
      rows: [],
      issues: [{ row: 1, message: 'Header must include "Name" and "Email" columns' }],
      duplicateEmails: [],
    };
  }
  const phoneCol = header.indexOf('phone');
  const affCol = header.indexOf('affiliation');

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = cleanCell(r[nameCol]);
    const email = cleanCell(r[emailCol]).toLowerCase();
    if (name === '' && email === '') continue; // empty row

    if (name === '') {
      issues.push({ row: i + 1, message: 'Name is required' });
      continue;
    }
    if (email === '') {
      issues.push({ row: i + 1, message: 'Email is required' });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      issues.push({ row: i + 1, message: `"${email}" is not a valid email` });
      continue;
    }

    const prior = seen.get(email);
    if (prior != null) {
      dupes.add(email);
      issues.push({ row: i + 1, message: `Email "${email}" duplicates row ${prior}` });
      continue;
    }
    seen.set(email, i + 1);

    // Phones are stored as 10 digits. A sheet often carries them with spaces,
    // dashes or a +91 prefix, so strip to digits first and only complain when
    // what is left cannot be a 10-digit number.
    const rawPhone = phoneCol >= 0 ? cleanCell(r[phoneCol]) : '';
    const phone = phoneDigits(rawPhone.replace(/^\+?91/, ''));
    if (rawPhone !== '' && phone.length !== PHONE_LENGTH) {
      issues.push({
        row: i + 1,
        message: `Phone "${rawPhone}" is not a ${PHONE_LENGTH}-digit number - imported without a phone`,
      });
    }
    const affiliation = affCol >= 0 ? cleanCell(r[affCol]) : '';
    out.push({
      name,
      email,
      phone: phone.length === PHONE_LENGTH ? phone : null,
      affiliation: affiliation === '' ? null : affiliation,
    });
  }

  return { rows: out, issues, duplicateEmails: [...dupes] };
}
