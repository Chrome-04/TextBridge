# TextBridge

React, TypeScript, and Vite, preserving the original Figma Make design. Sharing
now uses **local Firebase Functions, Firestore, and Storage emulators**. No live
Firebase services, billing, hosting, or deployment are configured by this code.
Comments remain deferred.

## Start in VS Code

Open this folder, `TextBridge Sharing Prototype`. Use Node 24 (the Functions runtime), pnpm 11.25.0, and Java 21+. `.mise.toml` pins the frontend tools.

```sh
pnpm install --frozen-lockfile
```

In one terminal:

```sh
npm run emulators
```

In another terminal:

```sh
npm run dev
```

Both `npm run ...` and `pnpm ...` can run these scripts. Keep pnpm for dependency
installation so there is one lockfile. The emulator launcher uses a project-local
Temurin runtime from ignored `.tools/` when available, otherwise your system Java.
Install Java 21+ on other machines; do not copy runtime binaries into Git.

Open [TextBridge](http://127.0.0.1:5173) in Chrome and Safari on this computer.
Create a new code in one browser and receive it in the other. The
[Emulator UI](http://127.0.0.1:4000) shows local data. Keep both terminals running.
Stopping emulators with Ctrl+C exports local records/files to ignored
`emulator-data/`; the next normal start imports them. Expiry still applies.

All emulator commands explicitly use **demo-textbridge**, which has no live cloud
resources. The ignored `.firebaserc` may contain the separate live project alias.
No web API key or administrator credential is required for emulator testing.
Never place administrator keys in browser configuration or commit credentials.

The app defaults to Firebase mode. `VITE_SHARE_MODE=demo` in ignored `.env.local`
restores the previous browser-only prototype. Old IndexedDB demo codes are kept
but are not copied to Firebase. No automatic fallback to browser storage occurs
when the backend is unavailable: an error is shown and the draft is retained.

## What works locally

- Text: 100,000 whitespace-separated words, at most 20 MiB UTF-8; no truncation.
- Files: one file strictly below 20,000,000 bytes per code; download only.
- Six symbols from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; secure backend generation.
- 10-minute default or 30-minute expiry, with repeat reads until expiration.
- Code, `/receive#CODE` link, and QR. The fragment avoids including the code in
  the initial page request. Create/retrieve operations use POST bodies, not URLs.
- Light/dark modes, mobile layouts, How it works, and keyboard-accessible FAQ.

This local address does not work on a phone: `127.0.0.1` points to the device
opening it. A reachable deployment is a later step, requiring explicit approval.
Anyone with an active code/link can access the content. There is no end-to-end
encryption. This is local testing, so use sample data. Already copied text or
downloaded files cannot be revoked; the app does not scan files for malware.

## Architecture

- `src/share-client.ts`: same-origin HTTP adapter, request timeout, no-store fetch.
- `src/App.tsx`: existing Send/Receive screens and local expiry display.
- `functions/index.js`: bounded HTTP endpoints, safe errors, no-store headers,
  deployment gates, App Check verification hook, and function resource limits.
- `functions/service.js`: backend validation, random codes, atomic Firestore
  reservations, pending-to-ready uploads, timestamps, rate limits, and expiry.
- Firestore holds metadata; Cloud Storage holds both text and file bytes. Large
  notes never have to fit inside a Firestore document. An upload becomes readable
  only after its blob is saved. Expiry is checked before and after blob retrieval.
- Direct browser Firestore/Storage reads and writes are denied by rules. Only the
  Admin SDK inside backend functions accesses them; no permanent download tokens.
- `vite.config.ts`: loopback-only development proxy to local Functions. The built
  app needs a separately reviewed hosting rewrite; it is not ready to deploy.
- `src/demo-store.ts` / `src/indexed-store.ts`: retained older demo and migration.

Server counters are atomic fixed one-minute windows: 5 creates and 20 lookups per
client address, plus global limits. Upload/download byte budgets are 100 MiB per
client and 400 MiB globally per window; global request limits are 100 creates and
400 lookups/downloads. File viewing and downloading are separate retrievals.
Window boundaries can permit bursts. In emulators, browsers share the loopback
address limit; spoofed forwarded headers do not change it. Counters store hashed
addresses, not raw IPs. Application code does not log shared content or codes.

## Checks

```sh
npm run check             # TypeScript, demo data tests, production build
npm run test:e2e          # Older demo regressions on isolated port 5174
npm run test:backend      # Fresh emulators, backend tests, cross-session UI test
npm run cleanup:local     # While normal local emulators are running
npm run format
```

Stop normal emulators before `test:backend`: it requires their ports and starts
fresh, non-imported test instances. Its test-only database resets are guarded by
an environment flag. Browser tests use synthetic content. Tests cover exact
Unicode and file bytes, large payloads, input validation, collisions, concurrent
rate counters, expiry, direct-access denial, no-store responses, and independent
browser sessions. Traces/screenshots/logs/emulator data are ignored by Git.

## Cleanup and remaining live setup

Expiry is immediate read enforcement; physical deletion is separate.
`cleanup:local` processes expired metadata, payloads, orphan queues, and rate
counters in bounded batches. Repeat it for larger collections. A production
schedule, retry monitoring, and bucket lifecycle policy are **not configured**.
Failed uploads can reserve a code until expiry; they never return that code.

Live traffic is disabled by default. Before deployment:

1. Select the separate TextBridge Firebase project and region, never the expense
   tracker. Register the web app and configure its hosting origin.
2. Configure App Check in the web client and register its provider. Backend token
   verification exists, but real App Check issuance/verification is untested.
3. Bind a private rate-limit salt using Secret Manager, configure the storage
   bucket and origin, and review the production proxy/IP trust contract. Do not
   simply enable `TEXTBRIDGE_LIVE_ENABLED` without completing these steps.
4. Review request/byte quotas, global budgets, malware scanning/content abuse
   controls, monitoring, and scheduled cleanup. Budget alerts are not hard caps.
5. Test on the selected production runtime, configure hosting rewrites, deploy
   deny rules and functions together, and verify no expired payload is cached.

Live Cloud Functions and Cloud Storage require Blaze billing. Local emulator
work does not. See [Functions setup](https://firebase.google.com/docs/functions/get-started)
and [Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
No live deployment is authorized by this README.

## Git

The repository is this folder, separate from the expense tracker. Preserve the
history and pnpm lockfile. Never commit real user content, `.env` files, private
keys, dependencies, runtime binaries, build output, or emulator exports. The
planned private GitHub repository is `text-share`; no remote is configured yet.
Use normal browser sign-in when connecting GitHub, never tokens in chat.
