// Supabase Edge Function: reset_panelist_password
//
// Supabase stores only a bcrypt hash of a password, so an existing password
// can never be read back. When a panelist loses theirs, staff generate a new
// one here and hand it over; it is shown once and not stored anywhere.
//
//   POST /functions/v1/reset_panelist_password
//   body: { email }
//   -> { email, password }
//
// Callable by an Organizing Chair or a Session Incharge, and ONLY against an
// account whose profile role is 'panel_member'. That guard matters: without
// it, a Session Incharge could reset the Chair's password and take over the
// account.
//
// Deploy: supabase functions deploy reset_panelist_password

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';

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

  // Caller must be signed-in staff.
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
    return json({ error: 'Only a Chair or Session Incharge can reset a panelist password.' }, 403);
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: 'A valid email is required.' }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // Resolve the account and refuse anything that is not a panelist.
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('email', email)
    .maybeSingle();
  if (targetErr) return json({ error: targetErr.message }, 500);
  if (!target) {
    return json({ error: 'That email has no account yet, so there is no password to reset.' }, 404);
  }
  if (target.role !== 'panel_member') {
    return json({ error: 'Only panelist passwords can be reset here.' }, 403);
  }

  const password = randomPassword(10);
  const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
    password,
    email_confirm: true,
  });
  if (updErr) return json({ error: updErr.message }, 500);

  // Remember it so staff can look it up again (see 0005_panelist_credentials).
  const { error: credErr } = await admin
    .from('panelist_credentials')
    .upsert({ email, password, issued_at: new Date().toISOString(), issued_by: me.user.id });
  if (credErr) return json({ error: credErr.message }, 500);

  return json({ email, password });
});
