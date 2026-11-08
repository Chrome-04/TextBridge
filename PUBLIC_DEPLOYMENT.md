# Firebase Hosting + Supabase public setup

## Current checkpoint

The Firebase CLI and Supabase CLI sign-ins work, and the existing TextBridge
projects have been verified. A Firebase web app named **TextBridge Web** is now
registered. Its public configuration and pending deployment settings are saved
in ignored `secrets/` files. The expense tracker has not been changed.

The website and Supabase backend have **not been deployed**. Live access remains
disabled. The local preview still uses local Supabase and 5 minutes by default.

Prepared and checked:

- `firebase.hosting.json`: static Hosting with SPA routing, security/cache headers,
  and an anonymous Auth provider declaration. It does not deploy Firebase Functions,
  Firestore, or Storage.
- `src/live-client.ts`: a silent Firebase guest session and App Check token. Visitors
  do not enter email/password or see a sign-in form. Anonymous identities do exist
  in Firebase Auth; this is separate from the nickname used for comments.
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

## The remaining console setup

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
4. Configure authenticated scheduled cleanup and failure monitoring. A browser
   must never receive the cleanup secret. Expiry already stops reads immediately;
   physical blob deletion is separate and must not be left indefinitely unscheduled.
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

This document is not permission to deploy or change billing. Provider registration,
cloud migration/function deployment, scheduled cleanup, and two-device production
verification are still pending. Local crypto tests use generated test signing keys;
real Google-issued tokens cannot be tested until the provider is configured.

## Checks performed

31 unit/contract tests, including signed-token forgery/project/expiry checks;
8 real local Supabase database/Storage/Edge tests; and 2 independent-session desktop/
mobile browser flows pass. The public bundle compiles using synthetic public
configuration into ignored artifacts. The public build correctly refuses the
currently incomplete real production configuration.

References:
[Firebase Hosting](https://firebase.google.com/docs/hosting),
[anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth),
[custom backend App Check verification](https://firebase.google.com/docs/app-check/custom-resource-backend),
[Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[App Check web setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider),
[Supabase CORS](https://supabase.com/docs/guides/functions/cors).
