# Setup & Deployment Guide

Everything here runs on free plans: **Supabase** (database + login), **Cloudflare Pages** (website), and a directly shared **Android APK**. iPhone users open the website and use *Share → Add to Home Screen*.

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
   - **Site URL**: your website address, e.g. `https://conf-eval.pages.dev` (use `http://localhost:5000` until the site is deployed).
   - **Redirect URLs**: add the same site URL, plus `http://localhost:5000` for testing.
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
copy env.example.json env.json      # then edit env.json with your URL + publishable key
flutter pub get
flutter run -d chrome --web-port 5000 --dart-define-from-file=env.json
flutter run -d emulator-5554 --dart-define-from-file=env.json      # Android emulator (see `flutter devices`)
flutter test
```

`env.json` is git-ignored. The publishable key is safe to ship in the app; the security rules in the database protect the data.

## 5. Publish the website (Cloudflare Pages, free)

```bash
flutter build web --release --dart-define-from-file=env.json
npx wrangler pages deploy build/web --project-name conf-eval
```

(Or in the Cloudflare dashboard: **Workers & Pages → Create → Pages → Upload assets** and drag in the `build/web` folder.)

Afterwards, set the resulting URL as **Site URL** in Supabase (step 2), and as `SITE_URL` in `env.json` for the APK build.
You can attach a college subdomain under **Custom domains**. It's free and only needs one DNS record.

Updates: rebuild and redeploy. Users get the new version on refresh.

## 5b. Training (demo) site — a second, data-safe URL

You can run a **training copy** alongside the real site so faculty get comfortable
before the event, with **no risk to real papers**. Demo mode runs entirely on
in-memory sample data (18 papers, 3 panels, mixed score states) with one-click
role logins; nothing is saved and it resets on reload. The real backend is never
contacted, and the demo build ships with **no Supabase credentials at all**.

Build/run it from the `webapp/` folder:

```bash
npm run dev:demo        # local training preview
npm run build:demo      # production demo build -> webapp/dist
```

Deploy it as a **separate Cloudflare Pages project** (e.g. `conf-eval-train`):

- Build command: `npm run build:demo`   ·   Output dir: `dist`
- **Leave the Supabase environment variables UNSET** on this project. That is what
  guarantees the training site cannot reach real data — its bundle has no URL or
  key baked in. (`webapp/.env.demo` forces demo mode and blanks the keys even if
  someone sets them.)

Result: two URLs — e.g. `conf-eval-train.pages.dev` (practice) and your real
`conf-eval.pages.dev`. Train faculty on the first; **"switch at the appropriate
time" is simply handing out the real URL.** The real site build is unchanged
(`npm run build` with the Supabase vars set, per section 5).

## 6. Build the Android APK

```bash
flutter build apk --release --dart-define-from-file=env.json
```

The file is `build/app/outputs/flutter-apk/app-release.apk`. Share it via Drive or WhatsApp; users allow "Install unknown apps".
This build is signed with the debug key, which is fine for direct sharing. Publishing on Google Play needs a proper upload keystore ([guide](https://docs.flutter.dev/deployment/android#sign-the-app)).

## 7. iPhone

- Free: open the website in Safari → Share → **Add to Home Screen**.
- App Store / TestFlight: needs a Mac with Xcode and an Apple Developer account ($99/yr): `flutter build ipa --dart-define-from-file=env.json`.

## 8. Keep the free project awake

Free Supabase projects pause after **7 days without activity**. Push this repo to GitHub and add two repository secrets: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (**Settings → Secrets and variables → Actions**).
The workflow [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) then pings the database twice a week. If it ever pauses anyway, click **Restore** in the Supabase dashboard.

## 9. Backups (free plan has none — do this before and after the event)

Install the PostgreSQL client tools (they include `pg_dump`), then run with the connection string from **Project Settings → Database → Connect → Session pooler**:

```bash
pg_dump "postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" \
  --schema=public --format=custom --file=conf_backup_$(date +%Y%m%d).dump
```

You can also export the results from the app any time: **Results → Export all tracks (.xlsx)**.

## 10. Conference-day checklist

- [ ] Papers imported; every paper has a track and a review score (Results tab shows "missing review score" warnings).
- [ ] Every panel has 2 members, and both show **Signed up** (ask members to sign up *the day before*).
- [ ] Every paper assigned to a panel (Results shows "No panel" otherwise).
- [ ] Dry run with ~20 people: score a test paper, then finalize and reopen a test track.
- [ ] Backup taken.
- [ ] After scoring: Chair → **Results → Finalize track** for each track → **Export all tracks**.

## Moving to self-hosted Supabase on Oracle Cloud later

The app and the SQL are the same. Install self-hosted Supabase (Docker) on the OCI VM, run the same migration, restore the `pg_dump` backup with `pg_restore`, then change `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `env.json` and rebuild the website and APK.
