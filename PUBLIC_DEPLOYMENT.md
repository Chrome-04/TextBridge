# Firebase Hosting + Supabase public setup

For commands and dashboard steps you can run yourself, see `MANUAL_DEPLOYMENT.md`.

The optional private-notes update has its own manual setup in
[SAVED_NOTES_SETUP.md](./SAVED_NOTES_SETUP.md). Enable email/password accounts,
create the default Firestore database, and publish its notes rules before
deploying that frontend. These new cloud settings have not been applied by the assistant.

## Current checkpoint

The Firebase CLI and Supabase CLI sign-ins work, and the existing TextBridge
projects have been verified. A Firebase web app named **TextBridge Web** is now
registered. Its public configuration and pending deployment settings are saved
in ignored `secrets/` files. The expense tracker has not been changed.

The user manually deployed the website and Supabase backend on November 8. The
live homepage returns HTTP 200; read-only cloud checks confirm the cleanup job is
active and its recent requests return HTTP 200 with no expired/orphan backlog.
No assistant cloud deployment or billing change occurred. The local preview still
uses local Supabase and 5 minutes by default. Real browser-token and cross-device
production verification remain pending. See SEARCH_SETUP.md for the prepared
homepage indexing fix, which still needs the owner's manual redeployment.
On November 8, Firebase Anonymous Auth and the saved reCAPTCHA Enterprise App Check
provider were verified through the authenticated Firebase API. Both Hosting domains
are authorized for Firebase Auth. The registered site key is saved privately in
ignored `.env.production.local`; the real public build now passes. No backend
secret is included in this browser configuration.

Prepared and checked:

- `firebase.hosting.json`: static Hosting with SPA routing, security/cache headers,
  an anonymous Auth declaration, and the optional notes Firestore rules/indexes.
  Always deploy explicit targets. Firebase Functions and Storage remain excluded.
- `src/live-client.ts`: shared Firebase identity and App Check tokens. Visitors
  can still share without signing up; account holders use their authenticated
  identity. Optional email/password sign-in is for private Saved notes and is
  separate from the public nickname used for comments.
- `src/share-client.ts`: direct HTTPS calls to the configured Supabase function
  in the public build. Local development continues using the Vite proxy.
- `supabase/functions/api/firebase-client.ts`: verifies Firebase Auth and App Check
  signatures, issuer, audience, times, and the configured app ID with Google's
  public keys. Private Supabase keys remain in the backend.
- The backend allows only the configured website origins, handles browser
  preflight, and exposes the response metadata needed for file/text retrieval.
  CORS is not treated as authentication. Forwarded identity/IP headers are ignored.
- Requests use a hash of the verified Firebase guest ID for per-session limits.
  Firebase signup limits and App Check complement global request/byte counters.
  This is not a guarantee against bots, revoked tokens, or token replay. Tokens
  are checked until expiry; online revocation/replay-consumption is not implemented.
- Production labels no longer describe local testing when `VITE_SHARE_STAGE=live`.
- `npm run build:public` refuses missing or placeholder configuration.

## Console setup (completed and verified)

In the **TextBridge** Firebase project only:

1. Go to **Authentication**, choose **Get started** if needed, then **Sign-in method**.
   Enable **Anonymous**. Do not enable email/password, Google sign-in, or paid phone
   authentication for this app. Alternatively the prepared Auth declaration can be
   deployed with Hosting at the final authorized stage.
2. Go to **App Check**, find **TextBridge Web**, and register a web reCAPTCHA provider.
   Prefer reCAPTCHA Enterprise for a new integration. Create/select a website score
   key with the TextBridge Hosting domains allowed. Review the provider's current
   free quota and remain within the no-billing setup; do not attach a billing account.
   The code also supports the existing reCAPTCHA v3 provider when explicitly selected.
3. Tell the assistant when those console steps are finished. No private key needs
   to be pasted into chat. The registered provider's public site key can be read
   through the signed-in CLI and added to the pending public configuration.

This setup uses Firebase and Supabase. No Cloudflare account or server proxy is
required. App Check must be verified by this custom Supabase backend; enabling
only a Firebase console enforcement toggle does not secure the custom API.

## After provider setup, before public deployment

1. Complete ignored `.env.production.local` from `.env.production.example` and
   the saved public web configuration. Only public browser values belong there.
2. Complete backend settings using `supabase/.env.example`. Generate separate
   random salts/secrets and store them in Supabase's function secrets. The private
   pending file already contains generated values; do not replace them unnecessarily.
   Configure both allowed Firebase Hosting origins. Keep `TEXTBRIDGE_MODE=live`.
3. Prepare both reviewed database migrations and the Edge Function for the
   authorized deployment to the verified Supabase TextBridge project. Firebase JWT verification is performed inside the
   function, so the Supabase gateway's Supabase-JWT check must be disabled for it.
   Never disable the handler's own Firebase token verification.
4. Configure authenticated scheduled cleanup and failure monitoring. The prepared
   `supabase/deployment/cleanup.sql` uses pg_cron, pg_net, and Vault to call cleanup
   every minute. Store the function's `/cleanup` HTTPS URL as `textbridge_cleanup_url`
   and the existing private cleanup secret as `textbridge_cleanup_secret` in Vault,
   using bound SQL parameters; never place the secret in the tracked SQL or cron
   command. Apply this file only after the migrations and Edge Function are deployed.
   The Edge Function's live gate must be enabled for cleanup to succeed.
   `supabase/deployment/cleanup-status.sql` checks actual HTTP responses, scheduler
   health, and expired/orphan backlog. These are owner dashboard checks, not an email
   alert service. Request references expire after six hours and this job's run history
   is pruned after seven days. A browser must never receive the cleanup secret.
   Expiry already stops reads immediately; physical blob deletion is separate and
   must not be left indefinitely unscheduled.
5. Build the public version, review Hosting files, then request the user's explicit
   authorization for cloud deployment/publication. Deploy with an explicit project
   target and only the intended Hosting/Auth services. Never run an untargeted
   `firebase deploy` against the legacy `firebase.json`.
6. Test real Google-issued guest/App Check tokens, CORS, text and file downloads,
   comments, expiry, and two-device sharing on the deployed domain. Then verify
   that API requests missing either Firebase token remain denied.

Example Hosting command for the later authorized stage, after review:

```sh
./node_modules/.bin/firebase deploy --only hosting,auth --config firebase.hosting.json --project YOUR_TEXTBRIDGE_PROJECT_ID
```

This document is not permission to deploy or change billing. Cloud migration/function
deployment, installation of scheduled cleanup, and two-device production verification
are still pending. Local crypto tests use generated test signing keys; actual
Google-issued token exchanges still require testing on the deployed allowed domain.

## Checks performed

31 unit/contract tests, including signed-token forgery/project/expiry checks;
8 real local Supabase database/Storage/Edge tests; and 2 independent-session desktop/
mobile browser flows pass. The public bundle compiles using synthetic public
configuration into ignored artifacts. The public build also passes with the real
registered browser configuration. `node scripts/check-cleanup-local.mjs` verified
the cleanup schedule, Vault-backed request header, owner-only permissions, and
status queries using the real local pg_cron/pg_net/Vault extensions. All test DDL,
Vault values, and queued HTTP requests were rolled back; no requests were sent and
no schedule was installed. The cloud schedule still requires installation and
an actual successful response after authorized deployment.

References:
[Firebase Hosting](https://firebase.google.com/docs/hosting),
[anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth),
[custom backend App Check verification](https://firebase.google.com/docs/app-check/custom-resource-backend),
[Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[App Check web setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider),
[Supabase CORS](https://supabase.com/docs/guides/functions/cors),
[scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions),
[pg_net response monitoring](https://supabase.com/docs/guides/database/extensions/pg_net),
[Vault](https://supabase.com/docs/guides/database/vault).
