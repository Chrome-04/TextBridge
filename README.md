# TextBridge

TextBridge shares text or one file using a six-character code, link, or QR code.
The default backend is **local Supabase Postgres, private Storage, and an Edge
Function**. The app runs at http://127.0.0.1:5173. The cloud project and public
website were manually deployed by the owner; the regular preview remains local.
See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) and [PUBLIC_DEPLOYMENT.md](./PUBLIC_DEPLOYMENT.md).

## Accounts and Saved notes

Optional email/password accounts keep private formatted text notes in Firestore.
Use **Save to Notes** before sharing or after receiving text, then edit and find
it in **Saved**. Share note creates a separate plain-text copy with the existing
5/10-minute expiry. Guest sharing still works without an account.

Run `npm run notes:emulators` alongside your normal preview to try accounts and
notes locally. Real accounts require the owner's Firebase Email/Password provider
setup, Firestore database/rules, and website redeployment. Follow
[SAVED_NOTES_SETUP.md](./SAVED_NOTES_SETUP.md) step by step. Nothing is deployed
automatically. Notes save text only, up to 50,000 characters; no Clipboard feature.

Notes can be rearranged by their six-dot grip, touch-friendly move buttons, or
Up/Down keys while the grip has focus. Positions are saved privately to the
account; pinned notes stay first. The editor includes a searchable emoji picker
with categories. Publish the updated Firestore rules before deploying this
version; see SAVED_NOTES_SETUP.md.

## Private saved files

Signed-in accounts can keep **20 MB total** of documents in the Saved page's
Files tab. Upload a CV or other file, download it from another signed-in device,
or permanently delete it to free space. This is separate from the 20 text notes
and expiring guest shares. The server enforces the combined byte limit, including
simultaneous uploads. See [SAVED_FILES_SETUP.md](./SAVED_FILES_SETUP.md) for local
setup and the owner's manual schema/API/Hosting deployment steps.

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

The successful-share counter sits below the sharing tool. It counts text and file
shares once they become ready and keeps the total after expiry. Tracking begins
when the new migration is installed; older deleted shares cannot be reconstructed.
See [SHARE_COUNT_SETUP.md](./SHARE_COUNT_SETUP.md) for the manual cloud update.

- Text: up to 100,000 whitespace-separated words and 20 MiB UTF-8.
- Files: one file strictly under 20,000,000 bytes. Receive can preview PDF pages,
  PNG/JPEG/GIF/WebP images, and DOCX document text before downloading. Preview
  checks the file bytes. PDF controls include first/previous/next/last page
  and a page-number jump. Word previews extract readable text in a worker,
  with archive expansion, text-size, and time limits. Download preserves the
  original Word layout. The viewers run in the browser using bundled resources.
  Other file types and password-protected PDFs use Download. Previews close at expiry.
- New codes last **5 or 10 minutes**, with **5 minutes selected by default**.
- Existing codes keep their original expiration. Reads do not extend their time.
- Code, sharing link, local QR rendering, live countdown, copy, paste, and clear.
- Comments request only a nickname (40 characters) and comment (1,000 characters).
  The newest 20 appear publicly within this local app. Use Refresh comments to
  see posts from another browser. Comments have no sharing expiry timer.
- Both text and comments render as plain text. Nicknames are unverified. There
  is no moderation interface, sharing history, end-to-end encryption, or scanning
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

`src/share-client.ts` calls same-origin `/api` locally and the configured HTTPS
Supabase URL in a public build. Vite forwards local requests to the Edge Function. `supabase/functions/api/handler.ts`
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
verified Firebase guest session in public mode; App Check is also required.

Expiry prevents reads immediately; physical deletion is separate:

```sh
pnpm supabase:cleanup
```

This removes expired/orphaned payloads before deleting their metadata, in batches
of up to 100 payloads. Repeat if needed. Scheduled cloud cleanup is not configured.

## Checks

```sh
pnpm check              # TypeScript, 31 unit/contract tests, production build
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

The public setup is Firebase Hosting for the website and Supabase for data,
files, and backend functions. The public build calls Supabase directly and uses
Firebase guest Auth plus App Check. The code/configuration is prepared; provider
setup, cloud deployment, scheduled cleanup, and two-device tests remain. Live mode
stays gated off. Follow [PUBLIC_DEPLOYMENT.md](./PUBLIC_DEPLOYMENT.md).

This project is separate from the expense tracker. Preserve history and the pnpm
lockfile. Never commit keys, real user content, runtime files, or database exports.

Saved accounts now support Google and email/password, and reset links.
See [AUTH_SETUP.md](AUTH_SETUP.md) for manual provider setup and
[NOTE_LIMIT_SETUP.md](NOTE_LIMIT_SETUP.md) for the 20-note limit and safe upgrade.
