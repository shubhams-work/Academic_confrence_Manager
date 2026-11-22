// Supabase Edge Function: bulk_create_members
//
// Called by the Incharge-facing "Add Members" screen with a parsed .xlsx:
//   POST /functions/v1/bulk_create_members
//   body: { rows: [{ name, email, phone?, affiliation? }], role? }
//
// role is 'panel_member' (default) or 'session_incharge'. Creating Session
// Incharge accounts is Chair-only, and works the same way as the panelist
// invite: Supabase emails a one-time invite link and the person chooses their
// own password. We never generate or store a password.
//
// For each row we:
//   1. inviteUserByEmail() - creates the auth user with NO password and mails a
//      ?token_hash=...&type=invite link through the project's custom SMTP.
//   2. The on_auth_user_created trigger inserts profiles(id,email,...) with role = null
//      (because no staff_invites or panel_members row exists yet).
//   3. We then raise profiles.role to the requested role so the Incharge can add
//      this email to a panel without needing to invite them again. A role is
//      only ever raised here, never lowered: if the trigger already made the
//      person staff (they were in staff_invites), uploading them as a panelist
//      must not demote them.
//
// No sign-in link is returned. Minting one per row put a sheet of live
// credentials in the caller's hands (and, via the export, on their disk) for
// people whose email would arrive fine. The Chair mints a single fresh link on
// demand with panelist_signin_link instead.
//
// At most 25 rows per call. inviteUserByEmail sends its email synchronously, so
// each row costs a round trip to the SMTP server; 25 keeps a call well inside
// the edge runtime's wall-clock limit. The web app sends larger uploads in
// batches.
//
// Only an authenticated Organizing Chair or Session Incharge may call it.
//
// Response: { invited, skipped, errors, invites: [{email, name, status, note?}] }
//
// Deploy:  supabase functions deploy bulk_create_members --project-ref <ref>

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { EMAIL_RE, json, preflight, siteOrigin } from '../_shared/http.ts';

const MAX_ROWS = 25;

// Roles in increasing order of privilege. This function only ever moves an
// account up this list.
const ROLE_RANK: Record<string, number> = {
  panel_member: 1,
  session_incharge: 2,
  organizing_chair: 3,
};

interface MemberRow {
  name: string;
  email: string;
  phone?: string | null;
  affiliation?: string | null;
}

interface InviteResult {
  email: string;
  name: string;
  status: 'invited' | 'exists' | 'error';
  note?: string;
}

// deno-lint-ignore no-explicit-any
(globalThis as any).Deno?.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno.env;
  const url = env.get('SUPABASE_URL');
  const anon = env.get('SUPABASE_ANON_KEY');
  const service = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json(req, { error: 'Function is misconfigured.' }, 500);

  // Caller auth: must be a signed-in staff user (chair or incharge).
  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: me, error: meErr } = await asCaller.auth.getUser();
  if (meErr || !me.user) return json(req, { error: 'Not signed in.' }, 401);
  const { data: myProfile, error: profErr } = await asCaller
    .from('profiles')
    .select('role')
    .eq('id', me.user.id)
    .maybeSingle();
  if (profErr) return json(req, { error: profErr.message }, 500);
  const role = myProfile?.role;
  if (role !== 'organizing_chair' && role !== 'session_incharge') {
    return json(req, { error: 'Only a Chair or Session Incharge can add accounts.' }, 403);
  }

  // Parse body.
  let body: { rows?: unknown; role?: unknown };
  try {
    body = await req.json(req, );
  } catch {
    return json(req, { error: 'Invalid JSON body.' }, 400);
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return json(req, { error: 'rows must be a non-empty array.' }, 400);
  }
  if (body.rows.length > MAX_ROWS) {
    return json(req, { error: `At most ${MAX_ROWS} accounts per call; send larger uploads in batches.` }, 400);
  }

  // Which kind of account to create.
  const newRole = body.role == null ? 'panel_member' : String(body.role);
  if (newRole !== 'panel_member' && newRole !== 'session_incharge') {
    return json(req, { error: 'role must be panel_member or session_incharge.' }, 400);
  }
  if (newRole === 'session_incharge' && role !== 'organizing_chair') {
    return json(req, { error: 'Only the Organizing Chair can add Session Incharges.' }, 403);
  }

  const rows: MemberRow[] = [];
  for (const [i, raw] of body.rows.entries()) {
    if (!raw || typeof raw !== 'object') return json(req, { error: `Row ${i + 1} is not an object.` }, 400);
    const r = raw as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    const email = String(r.email ?? '').trim().toLowerCase();
    if (name === '') return json(req, { error: `Row ${i + 1}: name is required.` }, 400);
    if (!EMAIL_RE.test(email)) return json(req, { error: `Row ${i + 1}: email is not valid.` }, 400);
    rows.push({
      name,
      email,
      phone: r.phone ? String(r.phone).trim() : null,
      affiliation: r.affiliation ? String(r.affiliation).trim() : null,
    });
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const out: InviteResult[] = [];

  // Where the invite link lands. Must be on the Auth "Redirect URLs" allowlist.
  const siteUrl = siteOrigin();
  if (siteUrl == null) {
    return json(req, { error: 'Function is misconfigured: the SITE_URL secret is not set.' }, 500);
  }

  // For a Session Incharge, pre-register the email in staff_invites first: the
  // on_auth_user_created trigger reads that table and assigns the role itself,
  // and the staff_invites_sync trigger fixes up anyone who already signed up.
  if (newRole === 'session_incharge') {
    // An Organizing Chair must never pass through here: inserting their email
    // as a session_incharge invite would fire staff_invites_sync and demote
    // them, even if they have no invite row of their own.
    const { data: chairs, error: chairErr } = await admin
      .from('profiles')
      .select('email')
      .in('email', rows.map((r) => r.email))
      .eq('role', 'organizing_chair');
    if (chairErr) return json(req, { error: chairErr.message }, 500);
    const chairEmails = new Set((chairs ?? []).map((c: { email: string }) => c.email));
    const invitable = rows.filter((r) => !chairEmails.has(r.email));

    if (invitable.length > 0) {
      const { error: invErr } = await admin.from('staff_invites').upsert(
        invitable.map((r) => ({ email: r.email, role: 'session_incharge', invited_by: me.user.id })),
        // Leave existing invites alone. Overwriting one would fire the
        // staff_invites_sync trigger and could demote, say, the Chair.
        { onConflict: 'email', ignoreDuplicates: true },
      );
      if (invErr) return json(req, { error: invErr.message }, 500);
    }
  }

  for (const r of rows) {
    // Creates the user with no password and mails the invite. Sending goes
    // through the project's SMTP settings, so a misconfigured sender surfaces
    // here as a per-row error rather than failing the whole upload.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(r.email, {
      redirectTo: siteUrl,
      data: {
        full_name: r.name,
        phone: r.phone ?? '',
        affiliation: r.affiliation ?? '',
        // Gates the app's "Set a new password" screen until they actually set
        // one. Stored on auth.users so a reload cannot clear it; the app flips
        // it to true in the same call that sets the password.
        password_set: false,
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        // Make sure the existing profile has panel_member role so the Incharge
        // can bind them to a panel.
        if (newRole === 'panel_member') {
          await admin
            .from('profiles')
            .update({ role: 'panel_member' })
            .eq('email', r.email)
            .is('role', null);
        }
        out.push({ email: r.email, name: r.name, status: 'exists' });
      } else {
        out.push({ email: r.email, name: r.name, status: 'error', note: error.message });
      }
      continue;
    }

    // The trigger has just created the profile, with whatever role
    // staff_invites / panel_members implied (possibly none). Raise it to the
    // requested role, but never lower it.
    const userId = data.user?.id;
    if (userId) {
      const { data: prof, error: readErr } = await admin
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (readErr) {
        out.push({ email: r.email, name: r.name, status: 'error', note: readErr.message });
        continue;
      }
      const current = prof?.role ?? null;
      const raise = current == null || (ROLE_RANK[current] ?? 0) < ROLE_RANK[newRole];
      const { error: upErr } = await admin
        .from('profiles')
        .update(raise ? { role: newRole, full_name: r.name, phone: r.phone } : { full_name: r.name, phone: r.phone })
        .eq('id', userId);
      if (upErr) {
        out.push({ email: r.email, name: r.name, status: 'error', note: upErr.message });
        continue;
      }
    }

    out.push({ email: r.email, name: r.name, status: 'invited' });
  }

  const invited = out.filter((o) => o.status === 'invited').length;
  const skipped = out.filter((o) => o.status === 'exists').length;
  const errors = out.filter((o) => o.status === 'error').length;

  return json(req, { invited, skipped, errors, invites: out });
});
