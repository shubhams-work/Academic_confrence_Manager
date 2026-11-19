// Supabase Edge Function: delete_panelist
//
// Removes a panelist completely: their sign-in account, their stored password
// and their seats on any panel.
//
//   POST /functions/v1/delete_panelist
//   body: { email, force? }
//   -> { email, deletedAccount, removedFromPanels, deletedEvaluations }
//
// Organizing Chair ONLY, and only against a profile whose role is
// 'panel_member' - never a Chair or Session Incharge account.
//
// Why a function and not a plain delete: removing an auth user needs the
// service role, which must never reach the browser.
//
// Scores: evaluations hang off panel_members (not profiles), and cascade when
// a panel seat is deleted. So deleting a panelist who has already SUBMITTED
// scores destroys those scores. That is refused with 409 unless the caller
// passes force: true, so the Chair has to see the count and agree to it.
//
// Deploy: supabase functions deploy delete_panelist

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  if (myProfile?.role !== 'organizing_chair') {
    return json({ error: 'Only the Organizing Chair can delete a panelist.' }, 403);
  }

  let body: { email?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const force = body.force === true;
  if (!EMAIL_RE.test(email)) return json({ error: 'A valid email is required.' }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // The account, if they ever signed up.
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, role, full_name')
    .eq('email', email)
    .maybeSingle();
  if (targetErr) return json({ error: targetErr.message }, 500);
  if (target && target.role !== 'panel_member') {
    return json({ error: 'Only panelist accounts can be deleted here.' }, 403);
  }

  // Their panel seats. A panelist may exist only here (placed on a panel but
  // never signed up), which is still a panelist worth deleting.
  const { data: seats, error: seatsErr } = await admin
    .from('panel_members')
    .select('id')
    .eq('email', email);
  if (seatsErr) return json({ error: seatsErr.message }, 500);
  const seatIds = (seats ?? []).map((s: { id: string }) => s.id);

  if (!target && seatIds.length === 0) {
    return json({ error: 'No panelist found with that email.' }, 404);
  }

  // Count the scores that deleting those seats would take with them.
  let submitted = 0;
  let totalEvals = 0;
  if (seatIds.length > 0) {
    const { data: evals, error: evalErr } = await admin
      .from('evaluations')
      .select('id, status')
      .in('panel_member_id', seatIds);
    if (evalErr) return json({ error: evalErr.message }, 500);
    totalEvals = (evals ?? []).length;
    submitted = (evals ?? []).filter((e: { status: string }) => e.status === 'submitted').length;
  }

  if (submitted > 0 && !force) {
    return json(
      {
        error:
          `${target?.full_name ?? email} has already submitted scores for ${submitted} ` +
          `paper${submitted === 1 ? '' : 's'}. Deleting them erases those scores.`,
        needsForce: true,
        submitted,
      },
      409,
    );
  }

  // Seats first: evaluations and their marks cascade from here.
  if (seatIds.length > 0) {
    const { error: delSeats } = await admin.from('panel_members').delete().in('id', seatIds);
    if (delSeats) return json({ error: delSeats.message }, 500);
  }

  await admin.from('panelist_credentials').delete().eq('email', email);

  // The account last: deleting the auth user cascades to their profile.
  let deletedAccount = false;
  if (target) {
    const { error: delUser } = await admin.auth.admin.deleteUser(target.id);
    if (delUser) return json({ error: delUser.message }, 500);
    deletedAccount = true;
  }

  return json({
    email,
    deletedAccount,
    removedFromPanels: seatIds.length,
    deletedEvaluations: totalEvals,
  });
});
