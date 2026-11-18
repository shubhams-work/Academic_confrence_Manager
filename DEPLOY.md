# Setup & Deployment Guide

Everything here runs on free plans: **Supabase** (database + login) and **Cloudflare Pages** or **Netlify** (website). The app is a website that installs to the home screen on both Android and iPhone — there is nothing to download from an app store.

---

## 1. Create the Supabase project (one time)

1. Sign in at <https://supabase.com> → **New project**.
   - Region: **South Asia (Mumbai)**
   - Save the database password somewhere safe (you need it for backups).
2. Open **SQL Editor → New query**, paste the whole of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and click **Run**.
   This creates the tables, the 5 tracks, the 5 scoring criteria, the security rules and the scoring/finalize functions.
3. Open **Project Settings → API Keys** and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **Publishable key** (`sb_publishable_…`). Never put the *secret* key in the app.

## 2. Configure login emails (Authentication settings)

1. **Authentication → Sign In / Providers → Email**: enabled, **Confirm email = ON**.
2. **Authentication → URL Configuration**
   - **Site URL**: your website address, e.g. `https://conf-eval.pages.dev` (use `http://localhost:5173` until the site is deployed).
   - **Redirect URLs**: add the same site URL, plus `http://localhost:5173` for testing.
3. **Custom SMTP (required for ~100 users)**: the built-in sender only sends a few emails per hour.
   **Authentication → Emails → SMTP Settings** → enable custom SMTP with one of:
   - **Brevo** free plan (300 emails/day): host `smtp-relay.brevo.com`, port `587`, with the login and SMTP key from Brevo.
   - **Gmail** with an *App Password* (Google account → Security → App passwords): host `smtp.gmail.com`, port `587`.
4. **Email templates**: these links work on any device, so a reset can be requested on a phone and opened on a laptop.
   - **Confirm signup** template, replace the link with:
     ```html
     <a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
     ```
   - **Reset password** template, replace the link with:
     ```html
     <a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery">Set a new password</a>
     ```
5. **Authentication → Rate Limits**: everyone shares the college Wi-Fi IP, so raise *sign-ups/sign-ins* limits for the event (e.g. 300 per hour).

## 3. Create the first Organizing Chair

In **SQL Editor** run (with your real email):

```sql
insert into public.staff_invites (email, role)
values ('chair@your-college.edu', 'organizing_chair');
```

Then open the app → **Sign up** with that email → confirm the email → sign in.
After that, the Chair invites Session Incharges from the **Staff** tab. Session Incharges add panel members when they create panels. Everyone signs up with the **exact email** they were registered with.

## 4. Run locally

```bash
cd webapp
copy .env.example .env.local        # then edit .env.local with your URL + publishable key
npm install
npm run dev                         # http://localhost:5173
npm test
npm run typecheck
```

`.env.local` is git-ignored. The publishable key is safe to ship in the app; the security rules in the database protect the data.

## 5. Publish the website (Cloudflare Pages, free)

```bash
cd webapp
npm run build                       # output: webapp/dist
npx wrangler pages deploy dist --project-name conf-eval
```

(Or in the Cloudflare dashboard: **Workers & Pages → Create → Pages → Upload assets** and drag in the `webapp/dist` folder.)

The build reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `webapp/.env.local` (or from the project's environment variables when Cloudflare builds it from the repo).

Afterwards, set the resulting URL as **Site URL** in Supabase (step 2).
You can attach a college subdomain under **Custom domains**. It's free and only needs one DNS record.

Updates: rebuild and redeploy. Users get the new version on refresh.

## 5b. Deploying on Netlify (free tier)

One Netlify site from this repo. It uses `webapp/public/_redirects`
(`/* /index.html 200`) so client-side routing works on refresh/deep links.
Set the build settings in the site's UI.

New site → import this repo, then in *Site settings → Build & deploy*:
- Base directory: `webapp`
- Build command: `npm run build`
- Publish directory: `dist` (relative to the base directory, i.e. `webapp/dist`)
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Custom domain: your main domain.

After deploying, in Supabase → **Authentication → URL Configuration**, set Site URL
and Redirect URLs to this domain.

Updates: push to the repo; Netlify rebuilds the site. Users get the new version
on refresh.

## 6. Install it on phones

The app is a PWA, so both platforms install it from the browser — no APK, no app store:

- **Android (Chrome)**: open the site → menu **⋮** → *Add to Home screen* / *Install app*.
- **iPhone (Safari)**: open the site → **Share** → *Add to Home Screen*.

It then opens full-screen like a normal app. Updates arrive on the next launch; nothing has to be re-sent to users.

## 7. Keep the free project awake

Free Supabase projects pause after **7 days without activity**. Push this repo to GitHub and add two repository secrets: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (**Settings → Secrets and variables → Actions**).
The workflow [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) then pings the database twice a week. If it ever pauses anyway, click **Restore** in the Supabase dashboard.

## 8. Backups (free plan has none — do this before and after the event)

Install the PostgreSQL client tools (they include `pg_dump`), then run with the connection string from **Project Settings → Database → Connect → Session pooler**:

```bash
pg_dump "postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" \
  --schema=public --format=custom --file=conf_backup_$(date +%Y%m%d).dump
```

You can also export the results from the app any time: **Results → Export all tracks (.xlsx)**.

## 9. Conference-day checklist

- [ ] Papers imported; every paper has a track and a review score (Results tab shows "missing review score" warnings).
- [ ] Every panel has 2 members, and both show **Signed up** (ask members to sign up *the day before*).
- [ ] Every paper assigned to a panel (Results shows "No panel" otherwise).
- [ ] Dry run with ~20 people: score a test paper, then finalize and reopen a test track.
- [ ] Backup taken.
- [ ] After scoring: Chair → **Results → Finalize track** for each track → **Export all tracks**.

## Moving to self-hosted Supabase on Oracle Cloud later

The app and the SQL are the same. Install self-hosted Supabase (Docker) on the OCI VM, run the same migration, restore the `pg_dump` backup with `pg_restore`, then change `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `webapp/.env.local` (or in the hosting project's environment variables) and rebuild the website.
