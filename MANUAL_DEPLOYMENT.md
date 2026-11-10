# Deploy TextBridge yourself

For the new account and private-notes feature, complete
[SAVED_NOTES_SETUP.md](./SAVED_NOTES_SETUP.md) before publishing the new frontend.
It adds Email/Password Authentication and owner-only Firestore rules; the normal
Supabase sharing backend remains in place.

For the successful-share counter update on an existing deployment, follow
`SHARE_COUNT_SETUP.md` in migration, API, then Hosting order.

After publishing, follow `SEARCH_SETUP.md` to verify the site in Google Search
Console and request homepage indexing. The search update must also be redeployed.

These steps publish the prepared app. They have not been run by the assistant.
Use only the existing TextBridge projects:

- Supabase: `ucxmnospkhnoetxixzqg`
- Firebase: `textbridge-8c8a4`
- Website after deployment: https://textbridge-8c8a4.web.app

Firebase Anonymous Auth and Enterprise App Check are already configured. The real
public build passes. Keep the existing free plans; no billing change is needed for
these instructions. Free service quotas still apply. Cloud behavior must be tested
after publishing; local checks do not prove the real token exchanges work yet.

## 1. Open the correct folder

In VS Code's terminal, run:

```sh
cd "/Users/khantpaing/WorkSpace/Git/Text_Share/TextBridge Sharing Prototype"
```

Edit `src/contact-details.ts` if you want your public contact cards filled before
publishing. Only edit the quoted values. The same file's `techStack` list controls
the “Built with” technologies shown below your contact cards. Save the file.

Use the commands below one at a time. If one fails, stop at that step and share
the error without passwords, secret values, or complete environment files.
The commands use the installed tools, so a global pnpm installation is not needed.
Do not run `firebase init`, an untargeted `firebase deploy`, or database resets.

## 2. Connect the terminal to your Supabase project

```sh
./node_modules/.bin/supabase link --project-ref ucxmnospkhnoetxixzqg
```

If asked for a database password, enter the password you chose when creating this
Supabase project. This is not your Google password. Enter it only in your own
terminal. If the CLI says you are not logged in, run
`./node_modules/.bin/supabase login` and complete the browser sign-in, then retry.

## 3. Create the database tables and private storage bucket

First preview the migrations:

```sh
./node_modules/.bin/supabase db push --project-ref ucxmnospkhnoetxixzqg --dry-run --skip-vault
```

The two prepared migrations are `202611060001_textbridge.sql` and
`202611070002_shorter_expiry.sql`. If this project unexpectedly contains conflicting
tables or migration history, stop instead of resetting or forcing it.

Then apply them:

```sh
./node_modules/.bin/supabase db push --project-ref ucxmnospkhnoetxixzqg --skip-vault
```

This creates the private database functions, comment storage, and private
`textbridge` file bucket. Never make that bucket public or add public table policies.

## 4. Upload the backend settings and function

The ignored file `secrets/supabase-live.pending.env` is already filled in privately.
Keep `TEXTBRIDGE_LIVE_ENABLED=false` for this first upload. Do not change the
generated rate salt or cleanup secret, and never copy them into a `VITE_` variable.

```sh
./node_modules/.bin/supabase secrets set --project-ref ucxmnospkhnoetxixzqg --env-file secrets/supabase-live.pending.env
```

```sh
./node_modules/.bin/supabase functions deploy api --project-ref ucxmnospkhnoetxixzqg --no-verify-jwt --use-api
```

`--no-verify-jwt` skips the gateway's **Supabase** JWT check. This backend still
requires and verifies **Firebase Auth and App Check** tokens inside its handler.
Do not remove those handler checks. `--use-api` avoids needing Docker to deploy.

## 5. Store the cleanup settings in Supabase Vault

Open your TextBridge Supabase dashboard and find **Vault** (use dashboard search
if needed). Add these two named secrets through its form:

| Name | Value |
| --- | --- |
| `textbridge_cleanup_url` | `https://ucxmnospkhnoetxixzqg.supabase.co/functions/v1/api/cleanup` |
| `textbridge_cleanup_secret` | The value after `TEXTBRIDGE_CLEANUP_SECRET=` in your local `secrets/supabase-live.pending.env` |

Copy only the cleanup secret's value, without the variable name or `=`. Keep it
inside Vault and the private backend environment. Do not paste it into chat,
tracked SQL, a screenshot, or a browser environment file.

## 6. Enable the backend and install automatic cleanup

In VS Code, open `secrets/supabase-live.pending.env` and change only:

```dotenv
TEXTBRIDGE_LIVE_ENABLED=true
```

Save, then upload the updated settings:

```sh
./node_modules/.bin/supabase secrets set --project-ref ucxmnospkhnoetxixzqg --env-file secrets/supabase-live.pending.env
```

In the same Supabase project's **SQL Editor**, open a new query. Copy all the
contents of `supabase/deployment/cleanup.sql` into it and click **Run**. The file
contains no secret values; it retrieves them from Vault. It installs the cleanup
job to run every minute.

After at least one minute, run `supabase/deployment/cleanup-status.sql` in another
SQL Editor query. Confirm the job is active and a recent request says **ok** with
HTTP **200**. A scheduler status of `succeeded` alone is not enough: that only
means the HTTP request was queued. If it fails, fix cleanup before publishing.

Expired shares become unreadable immediately; cleanup subsequently removes their
stored payloads in batches. Check these queries and dashboard storage usage
periodically. They do not send automatic email alerts.

## 7. Build and publish the website

The ignored `.env.production.local` is already filled with the real public browser
settings. Leave `.env.local` alone; it is your separate local preview configuration.

```sh
npm run build:public
```

After the build succeeds, publish only Hosting to TextBridge:

```sh
./node_modules/.bin/firebase deploy --only hosting --config firebase.hosting.json --project textbridge-8c8a4
```

If Firebase requests sign-in, run `./node_modules/.bin/firebase login`, choose the
account with access to TextBridge, and retry. Do not choose the expense tracker.
Anonymous Auth is already enabled, so this command does not need to redeploy Auth.

## 8. Test from two devices

Open https://textbridge-8c8a4.web.app on your computer and phone:

1. Send a short text. Open its link or scan the QR code on the phone.
2. Receive using the six-character code, including copy/paste and replacing a code.
3. Upload a small PDF or JPG and download it on the other device.
4. Post a test comment and refresh the comments on the other device.
5. Leave a five-minute share to expire; check that it cannot be retrieved, then
   check cleanup reports a successful request and the expired backlog clears.

Use the public website on both devices. `127.0.0.1:5173` is only your computer's
local preview. Real Google token exchanges and cross-device tests have not yet
been verified by the assistant. Report any failed step before sharing widely.

To temporarily disable sharing, set `TEXTBRIDGE_LIVE_ENABLED=false` in the private
backend environment file and rerun the secrets upload command. This also disables
cleanup, so it is a temporary troubleshooting step; restore cleanup promptly.

References: [Supabase deployment](https://supabase.com/docs/guides/functions/deploy),
[database migrations](https://supabase.com/docs/guides/local-development/database-migrations),
[scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions),
[Vault](https://supabase.com/docs/guides/database/vault),
[Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart).
