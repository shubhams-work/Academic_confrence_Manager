// Supabase Edge Function: bulk_create_members
//
// Called by the Incharge-facing "Add Members" screen with a parsed .xlsx:
//   POST /functions/v1/bulk_create_members
//   body: { rows: [{ name, email, phone?, affiliation? }], role? }
//
// role is 'panel_member' (default) or 'session_incharge'. Creating Session
// Incharge accounts is Chair-only, and works exactly like the panelist invite:
// an account with a generated password, handed over as a credentials sheet.
//
// For each row we:
//   1. Create an auth user with a random 10-char password and email_confirm: true.
//   2. The on_auth_user_created trigger inserts profiles(id,email,...) with role = null
//      (because no staff_invites or panel_members row exists yet).
//   3. We then UPDATE profiles.role = 'panel_member' so the Incharge can add this
//      email to a panel without needing to invite them again.
//
// Only an authenticated Organizing Chair or Session Incharge may call it.
//
// Response: { created, skipped, errors, credentials: [{email, password, name}] }
//
// Deploy:  supabase functions deploy bulk_create_members --project-ref <ref>

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';

interface MemberRow {
  name: string;
  email: string;
  phone?: string | null;
  affiliation?: string | null;
}

interface Credential {
  email: string;
  password: string;
  name: string;
  status: 'created' | 'exists' | 'error';
  note?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function randomPassword(len = 10): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += PASSWORD_ALPHABET[buf[i] % PASSWORD_ALPHABET.length];
  return out;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// deno-lint-ignore no-explicit-any
(globalThis as any).Deno?.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno.env;
  const url = env.get('SUPABASE_URL');
  const anon = env.get('SUPABASE_ANON_KEY');
  const service = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ error: 'Function is misconfigured.' }, 500);

  // Caller auth: must be a signed-in staff user (chair or incharge).
  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: me, error: meErr } = await asCaller.auth.getUser();
  if (meErr || !me.user) return json({ error: 'Not signed in.' }, 401);
  const { data: myProfile, error: profErr } = await asCaller
    .from('profiles')
    .select('role')
    .eq('id', me.user.id)
    .maybeSingle();
  if (profErr) return json({ error: profErr.message }, 500);
  const role = myProfile?.role;
  if (role !== 'organizing_chair' && role !== 'session_incharge') {
    return json({ error: 'Only a Chair or Session Incharge can add accounts.' }, 403);
  }

  // Parse body.
  let body: { rows?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return json({ error: 'rows must be a non-empty array.' }, 400);
  }
  if (body.rows.length > 200) {
    return json({ error: 'At most 200 accounts per upload.' }, 400);
  }

  // Which kind of account to create.
  const newRole = body.role == null ? 'panel_member' : String(body.role);
  if (newRole !== 'panel_member' && newRole !== 'session_incharge') {
    return json({ error: 'role must be panel_member or session_incharge.' }, 400);
  }
  if (newRole === 'session_incharge' && role !== 'organizing_chair') {
    return json({ error: 'Only the Organizing Chair can add Session Incharges.' }, 403);
  }

  const rows: MemberRow[] = [];
  for (const [i, raw] of body.rows.entries()) {
    if (!raw || typeof raw !== 'object') return json({ error: `Row ${i + 1} is not an object.` }, 400);
    const r = raw as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    const email = String(r.email ?? '').trim().toLowerCase();
    if (name === '') return json({ error: `Row ${i + 1}: name is required.` }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: `Row ${i + 1}: email is not valid.` }, 400);
    rows.push({
      name,
      email,
      phone: r.phone ? String(r.phone).trim() : null,
      affiliation: r.affiliation ? String(r.affiliation).trim() : null,
    });
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const out: Credential[] = [];

  // For a Session Incharge, pre-register the email in staff_invites first: the
  // on_auth_user_created trigger reads that table and assigns the role itself,
  // and the staff_invites_sync trigger fixes up anyone who already signed up.
  if (newRole === 'session_incharge') {
    const { error: invErr } = await admin.from('staff_invites').upsert(
      rows.map((r) => ({ email: r.email, role: 'session_incharge', invited_by: me.user.id })),
      { onConflict: 'email' },
    );
    if (invErr) return json({ error: invErr.message }, 500);
  }

  for (const r of rows) {
    const password = randomPassword(10);
    const { data, error } = await admin.auth.admin.createUser({
      email: r.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: r.name,
        phone: r.phone ?? '',
        affiliation: r.affiliation ?? '',
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
        out.push({ email: r.email, password: '', name: r.name, status: 'exists' });
      } else {
        out.push({ email: r.email, password: '', name: r.name, status: 'error', note: error.message });
      }
      continue;
    }

    // Trigger just made a profile with role = null. Promote it.
    const userId = data.user?.id;
    if (userId) {
      const { error: upErr } = await admin
        .from('profiles')
        .update({ role: newRole, full_name: r.name, phone: r.phone })
        .eq('id', userId);
      if (upErr) {
        out.push({ email: r.email, password, name: r.name, status: 'error', note: upErr.message });
        continue;
      }
    }
    // Panelist passwords are stored so staff can look them up later; staff
    // account passwords are deliberately not (see 0005_panelist_credentials).
    if (newRole === 'panel_member') {
      await admin.from('panelist_credentials').upsert({
        email: r.email,
        password,
        issued_at: new Date().toISOString(),
        issued_by: me.user.id,
      });
    }
    out.push({ email: r.email, password, name: r.name, status: 'created' });
  }

  const created = out.filter((o) => o.status === 'created').length;
  const skipped = out.filter((o) => o.status === 'exists').length;
  const errors = out.filter((o) => o.status === 'error').length;

  return json({ created, skipped, errors, credentials: out });
});
