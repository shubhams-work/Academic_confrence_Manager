// Request plumbing shared by every edge function in this project.
//
// Supabase does not deploy folders whose names start with "_" as functions;
// each function that imports this file gets it bundled in at deploy time.

// deno-lint-ignore no-explicit-any
const env = (globalThis as any).Deno.env;

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// The Vite dev server, so local work can call the deployed functions.
const DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

/**
 * The deployed site's origin, from the SITE_URL secret, or null when it is
 * unset or malformed.
 *
 * Callers treat null as a misconfiguration and refuse the request. Falling
 * back to the request's own Origin header, as these functions once did, let
 * the caller choose where sign-in links point.
 */
export function siteOrigin(): string | null {
  const raw = env.get('SITE_URL');
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * The Origin to echo back in Access-Control-Allow-Origin, or null to send none.
 *
 * Allowed: the site itself, the local dev server, and Cloudflare Pages
 * preview deployments of the same project (<branch-or-hash>.<project>.pages.dev),
 * which only the project's owner can publish to. These functions authenticate
 * with a bearer token rather than cookies, so a wildcard was never a CSRF
 * hole; the allowlist just stops arbitrary sites from scripting them at all.
 */
function allowedOrigin(origin: string | null): string | null {
  if (origin == null || origin === '') return null;
  if (DEV_ORIGINS.has(origin)) return origin;

  const site = siteOrigin();
  if (site == null) return null;
  if (origin === site) return origin;

  const siteHost = new URL(site).hostname;
  if (!siteHost.endsWith('.pages.dev')) return null;
  try {
    const o = new URL(origin);
    if (o.protocol !== 'https:') return null;
    const suffix = '.' + siteHost;
    if (!o.hostname.endsWith(suffix)) return null;
    const label = o.hostname.slice(0, -suffix.length);
    // Exactly one DNS label in front: no "evil.com.cosmic-eval.pages.dev" tricks.
    return /^[a-z0-9-]+$/.test(label) ? origin : null;
  } catch {
    return null;
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // The response varies by Origin; keep caches from serving one origin's
    // CORS answer to another.
    Vary: 'Origin',
  };
  const allowed = allowedOrigin(req.headers.get('origin'));
  if (allowed != null) headers['Access-Control-Allow-Origin'] = allowed;
  return headers;
}

export function preflight(req: Request): Response {
  return new Response('ok', { headers: corsHeaders(req) });
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}
