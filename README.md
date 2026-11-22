# Academic Conference Manager

A web app (React + Vite, installable as a PWA) with a Supabase backend for
evaluating presented papers at an academic conference and producing
**track-wise final scores**.

## How it works

| Who | Does |
|---|---|
| **Organizing Chair** | Imports papers and authors from Excel (Paper ID, Title, Track, Author Name, Affiliation, Email, Phone, Review Score), uploads **review scores (/50)**, invites Session Incharges, runs the **final fusion** and **finalizes each track**, exports results to Excel |
| **Session Incharge** | Creates **panels of two members** (name, phone, email, affiliation) and **assigns papers** to them; tracks scoring progress |
| **Panel Member** | Signs up with the email the Incharge entered, sees only their panel's papers, and scores each one |

**Presentation score (/50)**, marked by each panel member:

| Criterion | Marks |
|---|---|
| Technical Content & Depth | 10 |
| Originality & Innovation | 10 |
| Presentation Skills | 10 |
| Slide Quality | 10 |
| Q&A / Understanding of Work | 10 |

**Final (/100) = average Presentation score of the two members (/50) + Review score (/50)**, ranked within each track. Ties go to the higher Review score; if that also ties, the higher Presentation score ranks first.

**Tracks:** Computing, Semiconductor, Mechatronics, Intelligent Systems, Communications.

## Project layout

```
webapp/
  src/main.tsx, src/router.tsx     entry point, role-based routing and navigation
  src/lib/                         Api interface + Supabase implementation, auth, react-query
                                   hooks, scoring rules, Excel import/export
  src/components/                  shared UI (buttons, cards, fields, sheets, app shell)
  src/pages/
    auth/                          sign in / set-or-reset password / waiting-for-access
    chair/                         papers, Excel import, staff invites
    panels/                        panels list, create/edit panel, assign papers, progress
    member/                        my papers, scoring form
    results/                       track-wise results, finalize, export
  AGENT_BRIEF.md                   screen-by-screen behaviour spec
supabase/migrations/0001_init.sql  database schema, security rules, scoring and finalize functions
sample_data/                       sample .xlsx files for trying out the Excel import
DEPLOY.md                          step-by-step setup and deployment
```

## Quick start

See **[DEPLOY.md](DEPLOY.md)**. In short:

```bash
cd webapp
copy .env.example .env.local   # add your Supabase URL + publishable key
npm install
npm run dev
npm test
```
