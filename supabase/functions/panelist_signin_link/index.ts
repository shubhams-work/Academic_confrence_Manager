// Supabase Edge Function: panelist_signin_link
//
// Gets a panelist back in when their invite email never arrived or expired.
// Both modes issue a one-time link that opens the app's "Set a new password"
// screen.
//
//   POST /functions/v1/panelist_signin_link
//   body: { email, mode: 'email' | 'copy' }
//
//   mode 'email'  any Chair or Session Incharge. Supabase mails the link to the
//                 panelist's own inbox; nothing usable comes back to the caller.
//                 -> { email, emailed: true }
//   mode 'copy'   Organizing Chair only. The link itself is returned, for
//                 handing over by WhatsApp when the panelist's email is the
//                 problem. -> { email, link }
//
// Why 'copy' is Chair-only: whoever holds that link can sign in as the
// panelist and submit marks in their name. An incharge who can only trigger
// 'email' can help a panelist without ever being able to impersonate them.
//
// Every call is written to signin_link_log BEFORE anything is issued. If the
// log write fails, nothing is issued: there is no such thing as an unaudited
// link.
//
// Only accounts whose profile role is 'panel_member' can be targeted. Without
// that guard, an incharge could mint a link for the Chair's account.
//
// Deploy: supabase functions deploy panelist_signin_link

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { EMAIL_RE, json, preflight, siteOrigin } from '../_shared/http.ts';

type Mode = 'email' | 'copy';

// deno-lint-ignore no-explicit-any
(globalThis as any).Deno?.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno.env;
  const url = env.get('SUPABASE_URL');
  const anon = env.get('SUPABASE_ANON_KEY');
  const service = env.get('SUPABASE_SERVICE_ROLE_KEY');
  const site = siteOrigin();
  if (!url || !anon || !service) return json(req, { error: 'Function is misconfigured.' }, 500);
  if (site == null) {
    return json(req, { error: 'Function is misconfigured: the SITE_URL secret is not set.' }, 500);
  }

  // Caller must be signed-in staff.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: me, error: meErr } = await asCaller.auth.getUser();
  if (meErr || !me.user) return json(req, { error: 'Not signed in.' }, 401);

  const { data: myProfile, error: profErr } = await asCaller
    .from('profiles')
    .select('role, email')
    .eq('id', me.user.id)
    .maybeSingle();
  if (profErr) return json(req, { error: profErr.message }, 500);
  const role = myProfile?.role;
  if (role !== 'organizing_chair' && role !== 'session_incharge') {
    return json(req, { error: 'Only a Chair or Session Incharge can issue a sign-in link.' }, 403);
  }

  let body: { email?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body.' }, 400);
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json(req, { error: 'A valid email is required.' }, 400);
  const mode: Mode | null = body.mode === 'email' || body.mode === 'copy' ? body.mode : null;
  if (mode == null) return json(req, { error: "mode must be 'email' or 'copy'." }, 400);
  if (mode === 'copy' && role !== 'organizing_chair') {
    return json(
      req,
      { error: 'Only the Organizing Chair can copy a sign-in link. Use "Email link" instead.' },
      403,
    );
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // Resolve the account and refuse anything that is not a panelist.
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('email', email)
    .maybeSingle();
  if (targetErr) return json(req, { error: targetErr.message }, 500);
  if (!target) {
    return json(req, { error: 'That email has no account yet, so there is no link to issue.' }, 404);
  }
  if (target.role !== 'panel_member') {
    return json(req, { error: 'Only panelist sign-in links can be issued here.' }, 403);
  }

  // Audit first. If this fails, stop before anything is issued.
  const { error: logErr } = await admin.from('signin_link_log').insert({
    issued_by: me.user.id,
    issued_by_email: myProfile?.email ?? me.user.email ?? '',
    target_email: email,
    mode,
  });
  if (logErr) return json(req, { error: `Could not record the request: ${logErr.message}` }, 500);

  if (mode === 'email') {
    // Goes to the panelist's own inbox through the project's SMTP, using the
    // "Reset password" template, whose link has the same ?token_hash= shape.
    const { error: mailErr } = await asCaller.auth.resetPasswordForEmail(email, { redirectTo: site });
    if (mailErr) return json(req, { error: `Could not send the email: ${mailErr.message}` }, 502);
    return json(req, { email, emailed: true });
  }

  // mode === 'copy'. generateLink mints the token without sending anything.
  // Build the link from hashed_token in the same ?token_hash=&type= shape the
  // email templates use, so it goes through the app's verifyOtp path. The
  // ready-made action_link instead goes via Supabase's /verify endpoint, which
  // hands the session back in the URL fragment.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: site },
  });
  if (linkErr) return json(req, { error: linkErr.message }, 500);
  const hashed = linkData?.properties?.hashed_token;
  if (typeof hashed !== 'string' || hashed === '') {
    return json(req, { error: 'Supabase did not return a token.' }, 500);
  }
  const link = `${site}/?token_hash=${encodeURIComponent(hashed)}&type=recovery`;
  return json(req, { email, link });
});
