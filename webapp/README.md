# Conference Evaluation website (React)

Mobile-first website for evaluating presented papers at COSMIC 2026 and producing
**track-wise final scores**. It is the only client for the project; the earlier
Flutter app has been removed. See [`AGENT_BRIEF.md`](AGENT_BRIEF.md) for the build brief and
[`../DEPLOY.md`](../DEPLOY.md) for full Supabase/domain setup.

## Roles and screens

| Role | Tabs |
|---|---|
| Organizing Chair | Papers `/papers`, Import `/import`, Panels `/panels`, Members `/members`, Results `/results`, Staff `/staff` |
| Session Incharge | Panels `/panels`, Members `/members` |
| Panel Member | My Papers `/my-papers` → Score `/my-papers/:paperId` |

Signed-in users with no role land on `/not-authorized`. Invite and
password-recovery links (`?token_hash=…&type=invite|recovery`) go to
`/reset-password`, and an account with no password yet cannot leave it. A URL a role cannot use
redirects to that role's home. Scores are chair-only, so the incharge has no
Results tab.

## Local development

```bash
npm install
copy .env.example .env.local      # fill in VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                       # http://localhost:5173
```

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest (unit tests) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build |

**Windows note:** the repository path contains `&`, which can break the `npm`/`npx`
`.cmd` shims. If that happens, call the tools directly with node:

```bash
node node_modules/vite/bin/vite.js build
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -p . --noEmit
```

All three gates — type-check, tests, build — must pass before shipping.

## Configuration

The app always runs against Supabase. [`src/lib/config.ts`](src/lib/config.ts)
reads the two `VITE_*` values; if they are missing, the first API call throws
"Supabase is not configured…".

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key. Publishable, not a secret. |

Never put the Supabase **service role** key in the app or in any `VITE_*` variable.
Security is enforced by Row Level Security and `security definer` RPCs in the
database, never by client-side checks.

## Architecture

```
src/
  main.tsx            QueryClientProvider + Toast + Auth + RouterProvider
  router.tsx          routes, role guards, lazy pages, role navigation
  index.css           Tailwind v4 theme tokens (light/dark, COSMIC gold)
  lib/
    types.ts          domain types
    scoring.ts        presentationScore / finalScore / denseRank / fmtScore
    importParse.ts    Excel row parsing (papers + review scores) and issues
    excel.ts          dynamic-import wrappers for read/write-excel-file
    api.ts            Api interface + getApi() (SupabaseApi) + friendlyError
    supabaseApi.ts    Supabase implementation (tables, views, RPCs)
    auth.tsx          auth controller (useSyncExternalStore) + email-link OTP
    config.ts         Supabase URL + publishable key from the environment
    queries.ts        react-query keys, queries and invalidation on mutations
  components/         hand-written UI: AppShell, Button, Card, Chip, Field,
                      Sheet, ConfirmDialog, Toast, Spinner, TrackTabs, …
  pages/              auth/, chair/, panels/, member/, results/
```

Data flow: `AuthProvider` establishes the session and profile/role → route guards
in `router.tsx` decide which shell/pages are reachable → pages call hooks in
`queries.ts` → hooks call `getApi()`, a shared `SupabaseApi` that maps PostgREST
rows/views and invokes the database RPCs. React Query caches responses with a
30-second `staleTime`, refetches on window focus, and invalidates affected lists
after every mutation. Pages are code-split with `React.lazy`; the Excel libraries
are loaded with dynamic `import()` so only the Chair's Import/Results screens
download them.

## Scoring rules

- Five criteria × 10 marks = **Presentation total /50** per panel member
  (Technical Content & Depth, Originality & Innovation, Presentation Skills,
  Slide Quality, Q&A / Understanding of Work).
- Presentation = average of the **submitted** member totals (null if none),
  rounded to 2 decimals.
- **Final (/100) = Presentation + Review score (/50)**, where a missing part
  counts as 0. Papers are densely ranked descending within each track; a tie
  goes to the higher Review score, then the higher Presentation score, and a
  full tie shares a rank.
- Open tracks read the `paper_scores` view; finalized tracks read `track_results`.

These rules must stay in sync with the SQL in `../supabase/migrations/` — the
ranking key lives in `0006_results_tiebreaker.sql`.

## Backend / database

The database is defined in `../supabase/migrations/`. Apply **every** migration
in order: `0001_init.sql` creates the schema; later files restrict scores to the
Chair, add the training reset, and add the results
tie-breakers. Do not invent new tables or RPCs — the client expects the ones
defined there.

## Deployment

The build output is `dist/`. `public/_redirects` (`/* /index.html 200`) gives SPA
fallback on refresh/deep links; `public/_headers` sets immutable caching for
`/assets/*` and no-cache for `index.html`.

**Cloudflare Pages** — build command `npm run build`, output directory `dist`, with
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set as build env vars.

**Netlify** — base directory `webapp`, build command `npm run build`, publish
directory `dist` (relative to the base dir), same two env vars. Do not add a
`netlify.toml` unless you intend to fix the build command for the whole site.

After deploying, set the deployed URL as Supabase's Site URL and Redirect URL
(see [`../DEPLOY.md`](../DEPLOY.md) sections 2, 5 and 5b).

## Tests

Vitest suites live beside the code: `scoring.test.ts` and `importParse.test.ts`.
Run with `npm test`.
