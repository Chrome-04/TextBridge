# TextBridge

TextBridge shares text or one file using a six-character code, link, or QR code.
The default backend is **local Supabase Postgres, private Storage, and an Edge
Function**. The app runs at http://127.0.0.1:5173. The cloud project and public
website are not deployed yet; see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

## Start in VS Code

Use Node 24 and pnpm 11.25.0. From this project folder:

```sh
pnpm install --frozen-lockfile
```

Keep two terminals running:

```sh
pnpm supabase:start
```

```sh
pnpm dev
```

Open http://127.0.0.1:5173 in Chrome and Safari. Create a new code in one and
receive it in the other. Local database Studio is http://127.0.0.1:54323.
No cloud key, account, or billing details are needed for local testing.

The launcher uses an ignored sibling `.textbridge-supabase` runtime directory to
avoid a native Postgres bug with spaces in paths. An ignored `.supabase-local`
symlink points there. Local function secrets are generated in ignored
`supabase/functions/.env`. Keep these files private. Native services were tested
on this Apple Silicon Mac; other platforms may need a container runtime.

Stop Supabase with `pnpm supabase:stop`. Normal stops preserve its local database
and payloads. Do not run database resets against user data. The launcher checks
for disk space before starting; runtime downloads and data need additional room.

## Sharing and comments

- Text: up to 100,000 whitespace-separated words and 20 MiB UTF-8.
- Files: one file strictly under 20,000,000 bytes; download only.
- New codes last **5 or 10 minutes**, with **5 minutes selected by default**.
- Existing codes keep their original expiration. Reads do not extend their time.
- Code, sharing link, local QR rendering, live countdown, copy, paste, and clear.
- Comments request only a nickname (40 characters) and comment (1,000 characters).
  The newest 20 appear publicly within this local app. Use Refresh comments to
  see posts from another browser. Comments have no sharing expiry timer.
- Both text and comments render as plain text. Nicknames are unverified. There
  is no moderation interface, account history, end-to-end encryption, or scanning
  of uploaded files.

Anyone with an active code/link can retrieve its content until expiry. Copies
and downloaded files cannot be revoked. This is a local test; use sample content.
Old Firebase/demo records are preserved separately and are not automatically
copied to Supabase. No browser-storage fallback hides backend failures.

## Contact details

Edit `src/contact-details.ts` in VS Code: `name`, `zaloWhatsApp`, `email`, and
`viber`. Blank values show “Not added yet”; email becomes a mail link. These are
public contact cards, not a contact-message collection form.

## Architecture

`src/share-client.ts` calls same-origin `/api` endpoints. Vite forwards local
requests to the Supabase Edge Function. `supabase/functions/api/handler.ts`
validates requests, applies limits, reserves codes, and reads private payloads.
`supabase/migrations/` contains the database schema and expiry update.

Postgres provides atomic code reservations, fixed-window rate counters, server
creation times, and expiry checks before and after downloads. Private Storage
holds both large text and file bytes; objects become readable only after upload.
Browser roles cannot access the private schema or execute backend RPCs. Secret
keys stay in the backend. Application code does not log shared content or codes.

Each one-minute window allows 5 creates/uploads and 20 lookups/downloads per
client, with global request limits of 100 and 400 respectively. Upload/download
byte limits are 100 MiB per client and 400 MiB globally per action/window. Comments
allow 3 posts per client and 30 globally; listing allows 30 per client and 500
globally. Local browsers share the local client limit. Live identity requires a
trusted proxy, which is not configured yet.

Expiry prevents reads immediately; physical deletion is separate:

```sh
pnpm supabase:cleanup
```

This removes expired/orphaned payloads before deleting their metadata, in batches
of up to 100 payloads. Repeat if needed. Scheduled cloud cleanup is not configured.

## Checks

```sh
pnpm check              # TypeScript, 24 unit/contract tests, production build
pnpm test:supabase      # Real local database/Storage/Edge API + two browser flows
pnpm format
```

The real integration tests are loopback-only and remove their own database and
Storage records without resetting user data. They cover exact Unicode, 100,000
words, a 19,999,999-byte file, concurrent reservations/limits, role denial,
expiry, cleanup, comments, and the actual Edge Function. Browser flows cover
independent sessions, mobile layouts/accessibility, drafts after failures, and
both duration choices. Browser screenshots/traces and local data are ignored.

## Retained legacy modes

Set `VITE_SHARE_MODE=firebase` in ignored `.env.local` and run `pnpm emulators`
for the previous Firebase emulator backend (requires Java 21+). Its launcher
explicitly targets `demo-textbridge`; its data stays in ignored `emulator-data`.
`VITE_SHARE_MODE=demo` selects the old browser-only prototype. Restart Vite after
changing modes. `test:backend` is the legacy fresh-emulator test suite; stop normal
Firebase emulators first, and never reset imported user data.

## Public deployment

A localhost link does not work on another device. Supabase hosting the backend
also does not publish the Vite website. Public rollout still needs the reviewed
cloud migrations, Edge Function deployment, trusted hosting proxy, backend
secrets, abuse controls, cleanup schedule, and two-device tests. Live mode remains
gated off. Follow [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for the remaining work.

This project is separate from the expense tracker. Preserve history and the pnpm
lockfile. Never commit keys, real user content, runtime files, or database exports.
