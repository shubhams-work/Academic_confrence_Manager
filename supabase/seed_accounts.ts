// Seeds the hardcoded Organizing Chair + real Session Incharge accounts,
// and removes the legacy placeholder `incharge{1..10}@cosmic2026.local`
// accounts so only the real ones can sign in.
//
// Panel members are NOT seeded here — they are onboarded by their Session
// Incharge through the `bulk_create_members` edge function, which issues
// their sign-in credentials at that point.
//
// Password formula for session incharges:
//   Cosmic@2026-<local-part-of-email>
// e.g. jyothi.phy@sahyadri.edu.in -> Cosmic@2026-jyothi.phy
//
// Run (idempotent — re-runs skip existing users, repeat deletes are no-ops):
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node --import tsx supabase/seed_accounts.ts
//
// Writes credentials.csv next to this file.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EMAIL_DOMAIN = 'cosmic2026.local';
const CHAIR_COUNT = 4;
const DEFAULT_PASSWORD_PREFIX = 'Cosmic@2026-';

// Password formula for session incharges: `Cosmic@2026-<local-part-of-email>`.
// Deterministic so the list can always be regenerated from this file.
const INCHARGES: Array<{ email: string; fullName: string }> = [
  { email: 'jyothi.phy@sahyadri.edu.in',      fullName: 'Dr. F. Jyothi Serrao' },
  { email: 'savitha.chem@sahyadri.edu.in',    fullName: 'Dr. Savitha M.B.' },
  { email: 'vaishak.mech@sahyadri.edu.in',    fullName: 'Dr. Vaishak N.L' },
  { email: 'vasudeva.is@sahyadri.edu.in',     fullName: 'Dr. Vasudeva Rao P V' },
  { email: 'ramakrishna.mech@sahyadri.edu.in',fullName: 'Dr. Ramakrishna Devananda P' },
  { email: 'sunita.math@sahyadri.edu.in',     fullName: "Dr. Sunita Priya D'Silva" },
  { email: 'aysha.math@sahyadri.edu.in',      fullName: 'Dr. Aysha Shabana' },
  { email: 'nisha.ece@sahyadri.edu.in',       fullName: 'Dr. Nisha' },
  { email: 'jayashree.ai@sahyadri.edu.in',    fullName: 'Jayashree T R' },
];

// Old placeholder incharge accounts to remove from auth so they can't sign in.
const LEGACY_INCHARGE_EMAILS = Array.from(
  { length: 10 },
  (_, i) => `incharge${i + 1}@${EMAIL_DOMAIN}`,
);

interface SeedAccount {
  email: string;
  password: string;
  fullName: string;
  role: 'organizing_chair' | 'session_incharge';
}

function inchargePassword(email: string): string {
  const local = email.split('@')[0];
  return `${DEFAULT_PASSWORD_PREFIX}${local}`;
}

function buildAccounts(): SeedAccount[] {
  const out: SeedAccount[] = [];
  for (let i = 1; i <= CHAIR_COUNT; i++) {
    out.push({
      email: `chair${i}@${EMAIL_DOMAIN}`,
      password: `${DEFAULT_PASSWORD_PREFIX}chair${i}`,
      fullName: `Organizing Chair ${i}`,
      role: 'organizing_chair',
    });
  }
  for (const i of INCHARGES) {
    out.push({
      email: i.email,
      password: inchargePassword(i.email),
      fullName: i.fullName,
      role: 'session_incharge',
    });
  }
  return out;
}

async function deleteLegacyIncharges(
  admin: SupabaseClient,
): Promise<Array<{ email: string; status: 'deleted' | 'missing' | 'error'; note?: string }>> {
  const out: Array<{ email: string; status: 'deleted' | 'missing' | 'error'; note?: string }> = [];
  for (const email of LEGACY_INCHARGE_EMAILS) {
    // Look up by email via listUsers (admin.getUserByEmail isn't on all SDK versions).
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      out.push({ email, status: 'error', note: `list: ${error.message}` });
      continue;
    }
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      out.push({ email, status: 'missing' });
      continue;
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) out.push({ email, status: 'error', note: delErr.message });
    else out.push({ email, status: 'deleted' });
  }
  // Also drop their staff_invites rows so the role mapping is gone.
  const { error: invErr } = await admin
    .from('staff_invites')
    .delete()
    .in('email', LEGACY_INCHARGE_EMAILS);
  if (invErr) console.error(`staff_invites cleanup: ${invErr.message}`);
  return out;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  // 0. Delete legacy placeholder incharges (incharge1..10@cosmic2026.local)
  //    so they can no longer sign in. Real incharges take their place below.
  const legacy = await deleteLegacyIncharges(admin);
  const deleted = legacy.filter((r) => r.status === 'deleted').length;
  const missing = legacy.filter((r) => r.status === 'missing').length;
  const legacyErrs = legacy.filter((r) => r.status === 'error');
  console.log(`Legacy incharge cleanup: ${deleted} deleted, ${missing} already absent, ${legacyErrs.length} errors.`);
  for (const r of legacyErrs) console.error(`  ! ${r.email}: ${r.note}`);

  const accounts = buildAccounts();

  // 1. Pre-register every email in staff_invites so handle_new_user()
  //    assigns the correct role the moment the auth user is created.
  const { error: inviteErr } = await admin.from('staff_invites').upsert(
    accounts.map((a) => ({ email: a.email, role: a.role })),
    { onConflict: 'email' },
  );
  if (inviteErr) throw new Error(`staff_invites upsert: ${inviteErr.message}`);

  // 2. Create the auth users. email_confirm: true so they can sign in
  //    immediately without an email round-trip.
  const results: Array<SeedAccount & { status: 'created' | 'exists' | 'error'; note?: string }> = [];
  for (const a of accounts) {
    const { data, error } = await admin.auth.admin.createUser({
      email: a.email,
      password: a.password,
      email_confirm: true,
      user_metadata: { full_name: a.fullName },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        results.push({ ...a, status: 'exists' });
      } else {
        results.push({ ...a, status: 'error', note: error.message });
      }
      continue;
    }
    results.push({ ...a, status: data.user ? 'created' : 'error', note: data.user ? undefined : 'no user returned' });
  }

  // 3. Dump CSV of all accounts (created or pre-existing) for distribution.
  const header = 'email,password,role,full_name,status,note\n';
  const rows = results
    .map((r) =>
      [r.email, r.password, r.role, r.fullName, r.status, r.note ?? ''].map(csvCell).join(','),
    )
    .join('\n');
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'credentials.csv');
  await writeFile(outPath, header + rows + '\n', 'utf8');

  const created = results.filter((r) => r.status === 'created').length;
  const existed = results.filter((r) => r.status === 'exists').length;
  const errored = results.filter((r) => r.status === 'error').length;
  console.log(`Chair + Incharge seed: ${created} created, ${existed} already existed, ${errored} errored.`);
  console.log(`Credentials written to ${outPath}`);
  if (errored > 0) {
    for (const r of results.filter((x) => x.status === 'error')) {
      console.error(`  ! ${r.email}: ${r.note}`);
    }
    process.exitCode = 1;
  }
}

function csvCell(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
