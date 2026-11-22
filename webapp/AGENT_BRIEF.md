# Build brief — Conference Evaluation website (React)

You are building a **mobile-first website** for evaluating presented papers at an academic conference.
About **100 people use it at the same time, mostly on phones over mobile data**, so it must be **light, fast and smooth**.
It replaced an earlier Flutter app, which has since been removed from the repo; this app is now the only client.

## Hard rules
- Work **only inside `webapp/`**. Never edit `supabase/` or root files.
- Do **not** run git commands (no commits).
- The database is final: [`../supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql). Use its tables, views and RPCs exactly as defined; don't invent new ones.
- **The repo path contains `&`** (`Confrence-eval&management tool`). On Windows, `npm run …` / `npx …` .cmd shims may break because of it. If they do, run tools directly with node, e.g. `node node_modules/vite/bin/vite.js build`, `node node_modules/vitest/vitest.mjs run`, `node node_modules/typescript/bin/tsc -p . --noEmit`.
- TypeScript **strict**. No `any` except at JSON boundaries.
- Before finishing, all three must pass: type-check, `vitest run`, `vite build`.

## Stack (versions verified available)
- vite ^8.3, @vitejs/plugin-react ^6.3, react / react-dom ^19.3, react-router ^8.5 (library mode, `createBrowserRouter`)
- @tanstack/react-query ^5.107 for server state, caching and invalidation
- @supabase/supabase-js ^2.119
- tailwindcss ^4.3 + @tailwindcss/vite ^4.3 (CSS-first config, `@import "tailwindcss";`)
- lucide-react ^1.74 (import icons individually)
- read-excel-file ^9.3 and write-excel-file ^4.1. **Always load these with dynamic `import()`**, so only the Chair's import/export screens download them.
- vitest ^5.1, typescript (use ^5.9 if 7.x causes trouble)

## Performance targets
- Route-level code splitting with `React.lazy`: the login and panel-member screens must not pull in Chair/Incharge code or the Excel libraries.
- Initial JS for the login page: **≤ 160 KB gzipped** (React + router + query + supabase-js are most of it).
- No UI component library. Use Tailwind plus small hand-written components.
- Use react-query caching (`staleTime` ~30 s), and invalidate after mutations. No polling loops; provide a manual refresh button and refetch on window focus.
- Use native scrolling, and no heavy animations.

## Mobile-first UX
- Design for a 360 px wide phone first. Tap targets ≥ 44 px. Inputs ≥ 16 px font (avoids iOS zoom).
- Phones: sticky top bar (title, refresh, account menu) and a **bottom tab bar** for the role's sections.
- ≥ 768 px: a left sidebar instead of the bottom bar, with content max-width ~1100 px.
- Lists are **cards on phones**. The results table becomes cards on phones and a real `<table>` on desktop.
- Forms open as full-screen sheets on phones and centered modals on desktop.
- Show a toast for success and errors. Use a confirm dialog for destructive or irreversible actions.
- Show loading skeletons or spinners, and empty states with a hint.
- Support light and dark mode via `prefers-color-scheme`. Use an indigo primary colour.
- `index.html`: proper viewport meta, `theme-color`, title "Conference Evaluation", plus a web manifest so it can be added to a home screen.

## Roles and screens
Roles (`profiles.role`): `organizing_chair`, `session_incharge`, `panel_member`. A null role is signed in but not authorized yet.

| Role | Tabs (first = home) |
|---|---|
| organizing_chair | Papers `/papers`, Import `/import`, Panels `/panels` (+ `/panels/:id`), Results `/results`, Staff `/staff` |
| session_incharge | Panels `/panels` (+ `/panels/:id`), Results `/results` |
| panel_member | My Papers `/my-papers` (+ `/my-papers/:paperId`) |

Routing guard: still loading → spinner. Signed out → `/login`. Signed in with no role → `/not-authorized`. A URL the role can't use → that role's home. An invite or password-recovery link → `/reset-password`, and nothing else is reachable until a password is set.

Screen behaviour:
- **Login**: email + password only — there is no sign-up, accounts exist only by invitation. "Forgot password" emails a link that opens **Set a new password**. Tell the user to check their spam folder if it does not arrive.
- **Not authorized**: shows the user's email, explains that the organizers must add exactly this email, and offers "Check again" (refresh profile) and Sign out.
- **Reset password**: new password + repeat.
- **Papers (Chair)**: track filter chips ("All" plus the 5 tracks; finalized tracks show a lock), search by ID, title or author. Each card shows PID · title, author names, and chips for the track, review score (or "Review: —" in orange) and panel (or "No panel"). Tap → edit form. A "+" button adds a paper.
  - **Paper form**: PID (read-only when editing), title, track select, review score (0–50, optional), and an author list (name, affiliation, email, phone) with add/remove. Save goes through `import_papers` with a single row. Delete asks for confirmation.
- **Import (Chair)**: two cards.
  1. Papers & authors: "Download template" and "Choose .xlsx". Parse, then preview chips (N papers ready, M authors, K with review score, J skipped). The issues list shows "Row r: message". Preview table of the first 50. Button: "Import N papers".
  2. Review scores (/50): template, choose file, preview, "Upload N review scores". Report unknown Paper IDs afterwards.
- **Staff (Chair)**: list of `staff_invites` with a "Signed up" / "Not signed up" chip (matched against staff profiles). "Invite" dialog takes an email and role (Session Incharge or Organizing Chair). Remove asks for confirmation. Hide the remove button for your own email.
- **Panels (Chair + Incharge)**: track filter. Each card shows the name, a track chip, venue · time, the 2 members (✓ signed up / ⏱ not yet), a progress bar, and "N papers · x/y scored". "New panel" creates a panel, then opens its detail page.
  - **Panel form**: name, track (non-finalized tracks only), venue, optional date-time, and **exactly 2 member blocks** (name*, email*, phone, affiliation). The helper text says the member must sign up with this email. The two emails must differ.
  - **Panel detail**: chips (track, finalized lock, venue/time), members with contact details and sign-up status, and the assigned papers. Each paper card shows PID · title, authors, a status chip per member ("Not started" / "Draft · t/50" / "Submitted · t/50"), and "Presentation: x/50 · Review: y/50". Actions:
    - **Assign papers**: a modal listing the *unassigned* papers of the same track, with checkboxes and search.
    - **Remove**: available only when the paper has no submitted evaluations and the track is open.
    - **Unlock** (Chair only): on a submitted evaluation.
    - **Edit panel** and **Delete panel**.
- **My Papers (Panel member)**: a welcome card with "x of N submitted" and a progress bar. Papers are grouped by panel (with venue · time). Each paper card has a status chip ("To score" / "Draft · t/50" / "Submitted · t/50").
- **Score page**: track · PID, title, and the authors with affiliation. One card per criterion: the name, a big "v / 10" value, −/+ buttons and a range slider (0–10, step 1). Unmarked criteria show "–" and a hint. Then an optional comments box. A **sticky bottom bar** shows "Total t / 50" with **Save draft** and **Submit**.
  - Submit requires every criterion to be marked and asks for confirmation ("cannot change after submitting").
  - Read-only with a lock note when the marks are submitted or the track is finalized.
  - Warn about unsaved changes when leaving (`beforeunload` plus the router's `useBlocker`).
- **Results (Chair + Incharge)**: track tabs (no "All"). The status card shows either "Finalized on …" or "Live scores — not finalized", the formula line, and warning chips (N papers, X without panel, Y scoring incomplete, Z missing review, or "All complete").
  - Buttons: Export track (.xlsx). Chair only: **Finalize track**, with a confirm that lists the warnings, or **Reopen**. A top-bar button exports all tracks.
  - Table / cards columns: Rank, Paper ID, Title, Panel, Presentation /50, Review /50, Final /100, Status (`s/m scored`, "No review", "No panel").
  - Finalized tracks read `track_results`; open tracks read the `paper_scores` view.

## Scoring rules (must match the SQL)
- 5 criteria × 10 marks = Presentation total /50 per member: Technical Content & Depth, Originality & Innovation, Presentation Skills, Slide Quality, Q&A / Understanding of Work (codes `technical, originality, presentation, slides, qa`).
- Presentation = the **average of submitted member totals** (null if none), rounded to 2 decimals.
- Final (/100) = Presentation + Review, where a missing part counts as 0. **Dense rank** descending within each track; a final-score tie goes to the higher Review score, then the higher Presentation score, and a full tie shares a rank.
- Tracks: Computing, Semiconductor, Mechatronics, Intelligent Systems, Communications.
- Format scores as `40` for whole numbers and `39.5` otherwise; null shows "—".

## Architecture (`webapp/src`)
```
main.tsx            QueryClientProvider + RouterProvider
index.css           tailwind import + small theme tokens
router.tsx          routes, guards, lazy pages
lib/types.ts        domain types (below)
lib/scoring.ts      presentationScore, finalScore, denseRank, fmtScore
lib/importParse.ts  parsePapers, parseReviewScores, cleanCell, matchTrack, parseReviewScore  (header aliases + exact messages)
lib/excel.ts        dynamic-import wrappers: readSheetRows(file) -> string[][], downloadWorkbook(name, sheets), papersTemplate(), reviewScoresTemplate(), resultsWorkbook(tracks, rowsByTrack)
lib/api.ts          `interface Api` (below) + `getApi()`
lib/supabaseApi.ts  Supabase implementation (selects, RPC names and params, chunking)
lib/auth.tsx        AuthProvider + useAuth(): Supabase implementation, incl. ?token_hash=&type= email-link handling via supabase.auth.verifyOtp
lib/config.ts       Supabase URL + publishable key from the environment
lib/queries.ts      react-query hooks/keys for every Api call
components/         shared UI (Button, Card, Chip, Field/Input/Select, Sheet/Modal, ConfirmDialog, Toast, Spinner, EmptyState, TrackTabs, AppShell with top bar + bottom tabs/sidebar + AccountMenu)
pages/auth/*, pages/chair/*, pages/panels/*, pages/member/*, pages/results/*
```

Env: `.env.example` with `VITE_SUPABASE_URL=`, `VITE_SUPABASE_PUBLISHABLE_KEY=`.

### Domain types (`lib/types.ts`) — keep these names
```ts
export type AppRole = 'organizing_chair' | 'session_incharge' | 'panel_member';
export const roleLabel: Record<AppRole, string>;            // 'Organizing Chair' | 'Session Incharge' | 'Panel Member'
export interface Profile { id: string; email: string; fullName: string; phone?: string | null; role: AppRole | null }
export interface Track { id: number; name: string; sortOrder: number; finalizedAt: string | null }
export interface Criterion { id: number; code: string; name: string; maxMarks: number }
export interface Author { name: string; affiliation?: string | null; email?: string | null; phone?: string | null }
export interface Evaluation { id: string; paperId: string; panelMemberId: string; submitted: boolean; comments?: string | null; marks: Record<number, number> /* criterionId -> marks */ }
export interface Paper { id: string; pid: string; title: string; trackId: number; reviewScore: number | null; panelId: string | null;
  panelName?: string | null; panelVenue?: string | null; panelScheduledAt?: string | null; authors: Author[]; evaluations: Evaluation[] }
export interface PanelMember { id: string; position: number; name: string; email: string; phone?: string | null; affiliation?: string | null; profileId: string | null }
export interface PanelMemberInput { name: string; email: string; phone: string; affiliation: string }
export interface Panel { id: string; name: string; trackId: number; venue?: string | null; scheduledAt?: string | null; members: PanelMember[]; papers: Paper[] }
export interface ScoreRow { paperId?: string | null; pid: string; title: string; trackId: number; panelName?: string | null;
  presentationScore: number | null; reviewScore: number | null; finalScore: number; rank: number; submittedCount: number; memberCount: number }
export interface StaffInvite { email: string; role: AppRole }
// plus PaperDraft / AuthorDraft / ReviewScoreDraft / ImportIssue / PaperImportResult / ReviewImportResult from importParse.ts
```

### `interface Api` (`lib/api.ts`) — keep these names
```ts
profile(userId), tracks(), criteria(),
papers(trackId?), myPapers(), importPapers(rows: PaperDraftJson[]) => {inserted, updated}, savePaper(draft), importReviewScores(rows) => {updated, unknown: string[]}, deletePaper(id),
panels(trackId?), panel(id), savePanel({id?, name, trackId, venue?, scheduledAt?, members: PanelMemberInput[]}) => id, deletePanel(id), setPaperPanel(paperIds, panelId|null),
saveEvaluation({paperId, marks: Record<code, number>, comments, submit}), unlockEvaluation(evaluationId),
liveScores(trackId?), finalizedScores(trackId?), finalizeTrack(trackId), reopenTrack(trackId),
staffInvites(), addStaffInvite(email, role), removeStaffInvite(email), staffProfiles()
```
All methods are async. Errors are thrown as `Error` with a user-facing message. Supabase errors use `error.message`. Show `friendlyError(e)` in toasts, and map network failures to "Network error — check your connection and try again."

## Tests (vitest, `src/**/*.test.ts`)
- `scoring.test.ts`: presentation/final scores, dense ranking, formatting.
- `importParse.test.ts`: paper and review-score parsing — header aliases, track matching, per-row error messages.

## Deliverables when the whole app is done
- `webapp/README.md`: dev, test, build and deploy to Cloudflare Pages (`build` output `dist/`; SPA fallback works by default when there is no 404.html).
- `public/_headers`: long cache for `/assets/*` (immutable) and no-cache for `index.html`.
