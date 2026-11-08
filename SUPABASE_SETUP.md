# Supabase setup

## Current status

TextBridge is now connected to a **real local Supabase database, private Storage,
and Edge Function**. The normal preview at http://127.0.0.1:5173 uses Supabase.
The user's cloud project has not been modified or deployed, and the site is not
public yet. Firebase emulator data remains separate and has not been reset.

Verified: 31 unit/contract tests, 8 real database/Storage/Edge Function tests,
2 desktop/mobile browser flows, TypeScript, and the production build. A real
19,999,999-byte file round-trips through the Edge Function. Private table and RPC
permissions, concurrent reservations/rates, expiry, and cleanup are checked.
New sharing durations are 5 or 10 minutes; 5 minutes is the default. Previously
created codes keep their original expiry.

## Local use

```sh
pnpm install --frozen-lockfile
pnpm supabase:start
```

In another terminal:

```sh
pnpm dev
```

Keep both running. Studio is http://127.0.0.1:54323. Stop with
`pnpm supabase:stop`; normal stops preserve local data. `pnpm supabase:cleanup`
physically removes expired payloads; read access already stops at their expiry.

The runtime lives in the sibling `.textbridge-supabase` directory, with an ignored
`.supabase-local` symlink in this project. The space-free runtime path fixes a
native Postgres startup issue with the project folder's name. The generated
`supabase/functions/.env` uses Supabase's standard environment file location so
automatic function reloads keep the local settings. None of these private files
belongs in Git. `pnpm supabase:status` saves local credentials privately without
printing them. Native services are experimental; this setup was tested on this
Apple Silicon Mac.

Run `pnpm test:supabase` with the local stack running. The tests use loopback
connections only, never the cloud project, and do not reset user databases.

## API Keys screen

No cloud key needs to be copied into the frontend for this architecture. It uses
same-origin backend requests. Publishable keys are for browser clients with
appropriate policies. Secret keys bypass those policies and must remain in the
backend: never paste them into chat, a `VITE_` variable, browser code, or Git.
Edge Functions obtain their backend keys from Supabase's injected environment.
The Vite app does not need Next.js setup files or a browser Supabase SDK.

## Database files, ready for the later cloud step

These migrations have been applied and tested locally. Apply both, in order,
when the cloud deployment stage is authorized and its target project is verified:

1. `supabase/migrations/202611060001_textbridge.sql` creates private metadata,
   comments, atomic reservations/rate counters, private payload Storage, and
   cleanup RPCs. Direct browser access is denied.
2. `supabase/migrations/202611070002_shorter_expiry.sql` changes new reservations
   to 5 or 10 minutes while retaining old records' expiry times.

The Edge Function source is `supabase/functions/api/index.ts` and `handler.ts`.
The cloud schema should be deployed through these migrations rather than manual
public tables or permissive storage policies. Do not put shared text directly in
public tables or make the bucket public.

## Remaining public rollout

The selected public setup is **Firebase Hosting + Supabase**, with direct HTTPS
calls protected by Firebase guest Auth and App Check. A separate proxy or Cloudflare
account is not required. See [PUBLIC_DEPLOYMENT.md](./PUBLIC_DEPLOYMENT.md) for
current setup status, exact next console steps, and the deployment review.

A Firebase web app named TextBridge Web has been registered and its public
configuration saved privately. Anonymous Auth and App Check setup still need to
be completed. The Supabase cloud project and public website are not deployed;
live access remains disabled. No billing or expense-tracker changes have been made.

References: [API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[Edge Function environment](https://supabase.com/docs/guides/functions/secrets),
[local runtimes](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).
