# Supabase migration — preparation checkpoint

The Supabase project has been created, but TextBridge is **not connected to it**.
The existing Firebase emulator preview remains the default. No cloud schema,
Storage bucket, Edge Function, or website deployment has been changed.

## The API Keys screen

No key needs to be copied for this preparation step. Publishable keys are meant
for browser clients with appropriate access policies. Secret keys belong only
in the backend. Never paste a secret key into chat, browser code, a `VITE_`
variable, or Git.

The prepared adapter uses the existing same-origin `/api` interface, so the
browser does not receive administrator credentials or call the database directly.
Edge Functions obtain their backend key from Supabase's injected environment.
No Supabase browser SDK or Next.js tutorial files are needed for this Vite app.

## Files prepared

- `supabase/migrations/202611060001_textbridge.sql`: private metadata, comments,
  atomic code reservations, database-time expiry, atomic rate counters, a private
  payload bucket, and cleanup RPCs. Browser roles cannot execute these RPCs.
- `supabase/functions/api/handler.ts`: text/files, receive, comments, limits,
  and protected cleanup using the current frontend HTTP contract.
- `supabase/functions/api/index.ts`: Edge Function environment wiring.
- `scripts/supabase.mjs`: isolated local start/stop/status launcher.
- `tests/supabase-handler.test.ts`: fake-upstream request/response contract tests.

## Verification status

The HTTP handler contract tests and the existing frontend checks pass. These
tests use a fake database/storage upstream; they do **not** validate SQL execution,
real Supabase authorization, or actual file persistence.

The local native Supabase runtime could not finish unpacking because the disk
ran out of space (`ENOSPC`). The launcher now checks for at least 4 GiB available
before retrying. This threshold is a preflight minimum, not a guarantee that every
runtime version fits. No existing application data was reset or migrated.

Do not run the migration in the cloud or switch the normal preview yet. First
finish the real database/storage integration tests, including concurrent
reservations, role permissions, expiry, rate limits, and cleanup.

## Resume local testing after freeing disk space

From this project folder:

```sh
pnpm install --frozen-lockfile
pnpm supabase:start
```

This uses an isolated ignored `.supabase-local` directory and generates local
secrets in ignored `supabase/.env.local`. Keep that terminal running. Native
services are experimental on supported Linux/Apple Silicon machines; other
machines need a compatible container runtime. The launcher has not completed
an end-to-end start on this machine yet.

To test the prepared adapter separately from the normal Firebase preview:

```sh
VITE_SHARE_MODE=supabase pnpm dev --port 5176
```

Only use this after the local stack is healthy. Open
`http://127.0.0.1:5176`; keep the normal preview on port 5173. Product copy still
describes Firebase until the migration is complete, so this is a developer-only
test mode. Stop local Supabase with `pnpm supabase:stop`. The status command saves
local endpoints/credentials in an ignored file rather than displaying keys.

## Later public rollout

Public deployment is a separate stage. It still needs:

1. Successful real database, Storage, and Edge Function tests.
2. Deployment of the reviewed schema and function to the user's project.
3. A trusted same-origin hosting proxy that supplies client identity and holds
   its proxy secret outside browser code. The proxy is not implemented yet.
4. Live origin, private rate salt, proxy secret, and scheduled cleanup configured
   in backend secrets. Do not set `TEXTBRIDGE_MODE=local` for a hosted project.
5. Public upload/comment abuse controls and a tested cleanup schedule. No malware
   scanner or comment moderation interface is implemented.
6. Updated frontend labels, deployment routing, and two-device verification.

Live access is disabled by default. The Edge Function rejects hosted URLs in
local mode and requires an explicitly enabled, authenticated proxy in live mode.
Do not enable it just to work around a setup error.

Firebase emulator records are not automatically copied to Supabase. Supabase
provides the backend; the frontend still needs a public website host.

References: [API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[Edge Function environment](https://supabase.com/docs/guides/functions/secrets),
[local runtimes](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).
