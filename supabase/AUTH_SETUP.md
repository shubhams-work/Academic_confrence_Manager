# Supabase Auth Setup: Staff Accounts and Panel Member Upload

This guide covers two jobs:

1. Seed 4 Organizing Chair and 10 Session Incharge accounts into Supabase.
2. Deploy the `bulk_create_members` Edge Function, which lets a signed-in Session Incharge create panel-member accounts from an Excel upload.

Run all commands from the repo root unless a step says otherwise.

## Prerequisites (one time)

1. **Node.js 20 or newer.** Check with `node --version`.
2. **Install the script dependencies.** The seed script runs through `tsx` and imports `@supabase/supabase-js`:
   ```bash
   npm i -D tsx @supabase/supabase-js
   ```
3. **Install the Supabase CLI** (needed only for deploying the Edge Function). Follow the official install guide for Windows, then confirm with:
   ```bash
   supabase --version
   ```
4. **Link the CLI to the hosted project:**
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   ```
   The project ref is the subdomain of your project URL (`https://<project-ref>.supabase.co`).
5. **Get the service-role key.** In the Supabase dashboard, open **Project Settings → API** and copy the `service_role` key. This key bypasses all security rules. Treat it like a password (see Security notes).
6. **Note the project URL and the `anon` key** from the same page. You need them for the curl test.

## Step 1: Seed the staff accounts

The script creates the 14 accounts and pre-registers each email in `staff_invites`, so the signup trigger assigns the right role immediately.

Accounts created:

| Email | Role | Password |
|---|---|---|
| `chair1@cosmic2026.local` ... `chair4@cosmic2026.local` | `organizing_chair` | `Cosmic@2026-chair<N>` |
| `incharge1@cosmic2026.local` ... `incharge10@cosmic2026.local` | `session_incharge` | `Cosmic@2026-incharge<N>` |

1. Set the two environment variables for the current shell (PowerShell shown first, Git Bash second):
   ```powershell
   $env:SUPABASE_URL = "https://<project-ref>.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
   node --import tsx supabase/seed_accounts.ts
   ```
   ```bash
   SUPABASE_URL=https://<project-ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
   node --import tsx supabase/seed_accounts.ts
   ```
2. Read the summary line. It reads like `Chair + Incharge seed: 14 created, 0 already existed, 0 errored.`
3. The script writes `supabase/credentials.csv`. This file contains plain-text passwords. Do not commit it.

The script is idempotent. Running it again skips existing users and still rewrites the CSV.

## Step 2: Verify in the Supabase dashboard

1. Open **Authentication → Users**. You should see 14 users with the `@cosmic2026.local` domain, each marked as confirmed.
2. Open **Table Editor → profiles**. Each seeded user should have a row with `role` set to `organizing_chair` or `session_incharge`.
3. If a role is missing, check that the email appears in the `staff_invites` table, then re-run Step 1.

## Step 3: Deploy the Edge Function

From the repo root:

```bash
supabase functions deploy bulk_create_members --project-ref <project-ref>
```

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into deployed functions automatically. You do not need to set them yourself.

The function URL is:

```
https://<project-ref>.supabase.co/functions/v1/bulk_create_members
```

## Step 4: Test the function with curl

The function accepts only a signed-in Chair or Incharge. First, get an access token for an Incharge account.

1. Request a token:
   ```bash
   curl -s -X POST "https://<project-ref>.supabase.co/auth/v1/token?grant_type=password" \
     -H "apikey: <anon-key>" \
     -H "Content-Type: application/json" \
     -d '{"email":"incharge1@cosmic2026.local","password":"Cosmic@2026-incharge1"}'
   ```
2. Copy the `access_token` value from the JSON response.
3. Call the function with one test row:
   ```bash
   curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/bulk_create_members" \
     -H "Authorization: Bearer <access_token>" \
     -H "apikey: <anon-key>" \
     -H "Content-Type: application/json" \
     -d '{"rows":[{"name":"Test Panelist","email":"test.panelist@example.com","phone":"9999999999","affiliation":"Test"}]}'
   ```
4. Expected response: `created` is 1, and `credentials` contains the email and a random 10-character password.
5. Delete the test user afterwards in **Authentication → Users**, so it does not pollute the real panel list.

The function allows up to 200 rows per call. Each row needs a `name` and a valid `email`. `phone` and `affiliation` are optional.

## Step 5: Roll out the credentials

1. Distribute each person's credentials from `supabase/credentials.csv` through a private channel. Do not post the file in group chats or shared drives.
2. Ask each Chair and Incharge to sign in and change the password. The app or the Supabase dashboard can handle this.
3. Once everyone has their credentials, delete `supabase/credentials.csv`. Keep a copy only in a secure password manager.
4. Credentials returned by the Edge Function are shown only in the response. Save them when the upload finishes, because the function does not store them.

## Security notes

- **The service-role key must never ship to the browser.** It belongs only in the environment of `seed_accounts.ts` (run on your own machine) and in the Edge Function's environment (set by Supabase). Never put it in Flutter or web code, in a `.env` file that gets bundled, or in a public repo. Anyone with this key has full database access.
- The anon key is safe to embed in client apps. The service-role key is not.
- **Disable email signups.** In the Supabase dashboard, open **Authentication → Providers → Email** (or **Authentication → Sign In / Providers**, depending on the dashboard version) and turn off **Allow new users to sign up**. This stops anyone from creating an account on their own.
- Keep `supabase/credentials.csv` out of git. Add it to `.gitignore` if it is not already listed.

### Rotating passwords

The chair and incharge passwords follow a predictable pattern (`Cosmic@2026-chair<N>`). Anyone who knows the scheme can guess them, so do not use them in production without changing them.

Two options:

1. **Random passwords in the seed script.** Edit `DEFAULT_PASSWORD_PREFIX` and the password construction in `supabase/seed_accounts.ts` to generate random values, for example with `crypto.randomBytes`. Then delete the existing users in the dashboard and re-run the script, because the script skips users that already exist.
2. **Dashboard reset per user.** Open **Authentication → Users**, click a user, and choose **Send password reset**. Each person then sets their own password.

## Troubleshooting

- **"User already registered" in the seed output.** This is expected on re-runs. The script skips that user and writes the row to `credentials.csv` with `status=exists`. The original password still works. If someone forgot it, use the dashboard reset in Step 5 or the rotation option above.
- **"Not signed in" or HTTP 401 from the Edge Function.** The access token has expired (tokens last about an hour). Request a fresh token using the Step 4 login call and retry.
- **HTTP 403 with "Only a Chair or Session Incharge..."** The signed-in account is a panel member or has no role. Check its row in the `profiles` table.
- **Windows path contains `&`.** The repo path `Confrence-eval&management tool` can break some Windows CLI shims (`npm`, `npx`, `supabase`) that pass the path through `cmd.exe`. Run tools directly with `node` where possible, as the seed command above does (`node --import tsx supabase/seed_accounts.ts`), rather than through `npx` or `npm run`. If a shim still fails, copy the project to a path without `&` and run from there.
- **`curl` in PowerShell runs `Invoke-WebRequest` instead.** Use `curl.exe` or run the commands from Git Bash.
