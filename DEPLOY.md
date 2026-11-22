# Setup & Deployment Guide

Everything here runs on free plans: **Supabase** (database + login) and **Cloudflare Pages** or **Netlify** (website). The app is a website that installs to the home screen on both Android and iPhone — there is nothing to download from an app store.

---

## 1. Create the Supabase project (one time)

1. Sign in at <https://supabase.com> → **New project**.
   - Region: **South Asia (Mumbai)**
   - Save the database password somewhere safe (you need it for backups).
2. Open **SQL Editor → New query** and run **each file in [`supabase/migrations/`](supabase/migrations) in order**, starting with `0001_init.sql` and ending with `0009_drop_moved_columns.sql`.
   `0001` creates the tables, the 5 tracks, the 5 scoring criteria, the security rules and the scoring/finalize functions; the later files restrict scores to the Chair, add the training reset, add the results tie-breakers, and apply the security-audit fixes (`0007`–`0009`: no stored passwords, review scores and author contacts moved where panelists cannot read them, and an audit log of sign-in links).
   With the CLI, run one file at a time: `npx supabase db query --remote -f supabase/migrations/<file>.sql`.
   Do **not** use `supabase db push` on the existing project: these migrations were applied
   through the SQL Editor, so the CLI's migration history is empty and `db push` would try to
   replay every file from `0001`.
3. Open **Project Settings → API Keys** and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **Publishable key** (`sb_publishable_…`). Never put the *secret* key in the app.

## 2. Configure login emails (Authentication settings)

1. **Authentication → Sign In / Providers → Email**: enabled, **Confirm email = ON**, and
   **Allow new users to sign up = OFF**. Accounts are created only by invitation. With sign-up
   left on, anyone can call the sign-up API with the public key in the web bundle and, for
   example, pre-register a Chair's email with a password of their choosing, then wait for the
   real Chair to click the confirmation email. Invites and **Forgot password** keep working with
   sign-up off. Check it at `https://<ref>.supabase.co/auth/v1/settings` (with the `apikey`
   header): `disable_signup` must be `true`.
2. **Authentication → URL Configuration**
   - **Site URL**: your website address, e.g. `https://cosmic-eval.pages.dev` (use `http://localhost:5173` until the site is deployed).
   - **Redirect URLs**: add the same site URL, plus `http://localhost:5173` for testing.
3. **Custom SMTP (required — not optional)**: Supabase's built-in sender is capped at
   a couple of emails per hour, which is far below what inviting a panel takes. Nobody
   receives an invite until this is set. **Authentication → Emails → SMTP Settings** →
   enable custom SMTP with one of:
   - **Gmail** with an *App Password* (Google account → Security → App passwords; needs
     2-Step Verification on): host `smtp.gmail.com`, port `587`. A `@sahyadri.edu.in`
     Workspace account may have app passwords disabled by the admin — test before
     relying on it, or use a personal Gmail. Roughly 500 sends/day personal,
     2,000 on Workspace.
   - **Brevo** free plan (300 emails/day): host `smtp-relay.brevo.com`, port `587`,
     with the login and SMTP key from Brevo. Only a single sender address needs
     verifying — no DNS records — so this works without control of the domain.

   Avoid Microsoft 365 / Outlook: Basic auth for SMTP AUTH is being disabled by
   default for existing tenants from end of December 2026, so it will stop working
   mid-cycle.
4. **Email templates**: these links work on any device, so an invite can be mailed to a
   phone and opened on a laptop.
   - **Invite user** template — this is the one that matters, it is how every panelist
     and Session Incharge gets in:
     ```html
     <a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite">Set your password</a>
     ```
   - **Reset password** template (also used for every "Forgot password" and for the
     staff *Copy link* / *Email link* buttons):
     ```html
     <a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery">Set a new password</a>
     ```
   - **Confirm signup** template, kept for completeness:
     ```html
     <a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
     ```
5. **Authentication → Rate Limits**: everyone shares the college Wi-Fi IP, so raise
   *sign-ups/sign-ins* limits for the event (e.g. 300 per hour). Also raise
   **emails per hour** — it only becomes editable once custom SMTP is on, and the
   default will throttle a bulk invite of 100+ panelists.
6. **Invite link expiry**: under **Authentication → Sessions / Advanced**, raise the
   email OTP expiry (`MAILER_OTP_EXP`, 24h by default). Invite links sent a week
   before the event will otherwise be dead on arrival. This is not fatal if you miss
   it — an expired invite just means the person uses **Forgot password** on the login
   screen to get a fresh link themselves.

## 2b. Deploy the edge functions

Account creation, invites and deletion all run in edge functions, because they need the
service-role key that must never reach the browser.

```bash
# The origin sign-in links point at, and the origin the functions accept calls from
# (plus its Cloudflare preview subdomains and localhost:5173). Required: without it the
# functions refuse every request rather than guess.
npx supabase secrets set SITE_URL=https://cosmic-eval.pages.dev --project-ref <ref>

npx supabase functions deploy bulk_create_members   --project-ref <ref>
npx supabase functions deploy panelist_signin_link  --project-ref <ref>
npx supabase functions deploy delete_panelist       --project-ref <ref>

# Superseded by panelist_signin_link — remove it if it is still deployed.
npx supabase functions delete reset_panelist_password --project-ref <ref>
```

Whatever `SITE_URL` is set to must also appear in **Authentication → URL Configuration →
Redirect URLs**, or every invite link will bounce.

## 3. Create the first Organizing Chair

In **SQL Editor** run (with your real email):

```sql
insert into public.staff_invites (email, role)
values ('chair@your-college.edu', 'organizing_chair');
```

The app has no public sign-up screen — accounts are only ever created by invitation —
so invite the first Chair by hand: **Authentication → Users → Invite user**, using that
same email. They receive the invite email, click it, land on **Set a new password**,
choose one, and are signed in as Chair.

After that, the Chair invites Session Incharges from the **Staff** tab, and Session
Incharges add panel members when they create panels. Each person is emailed a link and
picks their own password; no passwords are generated, shown or stored anywhere. Everyone
must be invited at the **exact email** they were registered with.

If someone never receives their invite, open the **Panelists** sub-tab:
- **Email link** (any staff) sends a fresh one-time link to the panelist's own inbox.
- **Copy link** (**Organizing Chair only**) puts a fresh one-time link on your clipboard,
  for sending over WhatsApp when their email is the problem. It is Chair-only because
  whoever holds that link can sign in as the panelist and submit marks in their name.

Every link issued either way is recorded in the `signin_link_log` table (who, for whom,
when, which way), readable by the Chair. Panelists can also recover themselves with
**Forgot password** on the login screen at any time.

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
npx wrangler pages deploy dist --project-name cosmic-eval
```

(Or in the Cloudflare dashboard: **Workers & Pages → Create → Pages → Upload assets** and drag in the `webapp/dist` folder.)

The build reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `webapp/.env.local` (or from the project's environment variables when Cloudflare builds it from the repo).

Afterwards, set the resulting URL as **Site URL** in Supabase (step 2).
You can attach a college subdomain under **Custom domains**. It's free and only needs one DNS record.

Updates: rebuild and redeploy. Users get the new version on refresh.

To try a build before it goes live, deploy it to a preview branch first:
`npx wrangler pages deploy dist --project-name cosmic-eval --branch preview` publishes it at
`https://preview.cosmic-eval.pages.dev` against the real backend. The edge functions accept
calls from these preview subdomains.

**Security headers** (CSP, clickjacking protection and the rest) live in
`webapp/public/_headers`. The Content-Security-Policy only allows this site and the Supabase
project. If you add anything loaded from elsewhere (a font, a script, an analytics tag, an
image host), add its origin to the matching CSP directive there, or the browser will block it
with only a console message to show for it.

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
- [ ] Custom SMTP configured and a test invite actually received (check the spam folder too).
- [ ] Every panel has 2 members, and both show **Signed up** (invite members *the day before*, so the links are still fresh).
- [ ] Every paper assigned to a panel (Results shows "No panel" otherwise).
- [ ] Dry run with ~20 people: score a test paper, then finalize and reopen a test track.
- [ ] Backup taken.
- [ ] After scoring: Chair → **Results → Finalize track** for each track → **Export all tracks**.

## Moving to self-hosted Supabase on Oracle Cloud later

The app and the SQL are the same. Install self-hosted Supabase (Docker) on the OCI VM, run the same migration, restore the `pg_dump` backup with `pg_restore`, then change `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `webapp/.env.local` (or in the hosting project's environment variables) and rebuild the website.
