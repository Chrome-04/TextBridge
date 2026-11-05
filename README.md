# TextBridge

A small text and file sharing tool built from the original Figma Make export with React,
TypeScript, Vite, and Tailwind. **Stage 1 is a browser-local demo.** No Firebase
project, cloud service, account, or billing is connected. Nothing is deployed.

## Run locally

Open this folder (`TextBridge Sharing Prototype`) in VS Code. Use Node 24 LTS
(minimum 22.18) and pnpm 11.25.0; `.mise.toml` pins the tools if you use mise.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:5173>. Receive opens directly at
<http://127.0.0.1:5173/receive>. Stop the server with Ctrl+C in its terminal.
No `.env` file is needed; `.env.example` contains commented placeholders only.

1. Select **Text** and paste a note, link, or snippet, or select **File** and
   choose one PDF, JPG, PNG, document, ZIP, or other file under 20 MB.
2. Choose 10 minutes (default) or 30 minutes, then **Generate code**.
3. Copy the code or link. The QR code encodes that same link. **Open link**
   prefills Receive; select **View content** to retrieve. In this demo, use
   another tab **in the same browser, profile, and at the same address**.
4. Copy received text or download the file. Repeat until expiry. Multiple codes
   stay active independently. A phone scanning the QR cannot retrieve local data.

`localhost` and `127.0.0.1` have separate storage. Private windows, other profiles,
other browsers, and other devices cannot retrieve demo items. Generated items survive refresh;
unsent drafts do not survive a full reload. Text and files are stored unencrypted in
IndexedDB. Anyone knowing an active code or link can access its content; there is no
end-to-end encryption. Use sample data for this demo.

Expand **Demo testing options** to simulate a network failure or rate limit on
the next operation. The browser also demonstrates limits of 5 creations and 20
lookups per minute. These are bypassable local limits, not server protection.
Clipboard failures show manual-copy instructions instead of claiming success.

## Checks

```sh
pnpm check                 # TypeScript, 12 data tests, production build
pnpm exec playwright install chromium  # Once per machine
pnpm test:e2e              # 39 browser cases, including accessibility scans
pnpm preview              # Optional built-app preview at 127.0.0.1:4173
pnpm format               # Format source safely with Prettier
```

The browser suite uses 1440px desktop, 390px phone, and 320px narrow-phone widths.
It checks copying, cross-tab reads, safe multiline/Unicode content, length limits,
invalid codes, expiry, keyboard navigation, cancellation, storage failures, and
simulated errors. New tests decode QR images, follow links, compare downloaded
PDF/JPG bytes, reject oversized files, check file expiry, and migrate old
IndexedDB records. Unit tests force collisions and verify local rate-limit
recovery. Screenshots go into ignored `artifacts/`; test results/traces are also
ignored. Automated accessibility scans supplement manual screen-reader and
real-device testing; they do not prove complete accessibility.

## Architecture and decisions

- `src/App.tsx`: forms, results/errors, clipboard feedback, route history, and
  request simulation. The export's components and icons are reused. React renders
  shared text inside `<pre>`; shared content is never interpreted as HTML.
- `src/demo-store.ts`: browser-only data validation/operations adapter. Each code gets its own record;
  input validation, collision retries, expiry, and demo limits live here. Stage 2
  will replace this boundary with calls to Firebase backend functions.
- `src/index.css`: exported dark green styling with responsive and accessibility
  repairs, focus indicators, and reduced-motion support.
- `vite.config.ts`: ordinary local Vite setup. Figma hosting hooks were removed.
  `.figma/` is retained only as export provenance; do not use its hosting scripts.
  The old export formatter generated invalid TypeScript; Prettier replaces it.
- `tests/`: data tests and browser regressions using synthetic notes only.

The limit is **100,000 words and 20 MiB of UTF-8 text** per note. A word is a
non-whitespace run: spaces, tabs, and line breaks separate words. URLs and code
tokens count too. Text without spaces counts as one run; the byte limit still
applies. Over-limit text remains editable and is never silently truncated.

Files must be **strictly under 20 MB (20,000,000 bytes)**, with one file per code.
The demo stores the Blob separately from its metadata in one IndexedDB transaction.
Downloads recheck expiry and use an attachment with a sanitized filename and
`application/octet-stream` type. Files are not previewed or executed inside the
app. There is no malware scanning in this local demo. Already downloaded copies
cannot be revoked.

Sharing links use `/receive#CODE`; the fragment prefills the code input without
including the code in the initial HTTP request. QR images are generated locally
with `qrcode.react`; no QR service receives the link. Both forms grant the same
access as the code, and neither connects browser-local stores across devices.

`src/indexed-store.ts` persists notes in IndexedDB, using one read/write
transaction per operation. This supports large documents and serializes requests
across tabs. Existing localStorage notes migrate automatically; any old one-hour
notes retain their original expiration, but new notes only allow 10 or 30 minutes.
The demo adapter currently reads local records into memory per operation; it is
intended for a small local demo collection, not a production database.

Use the header's Light mode / Dark mode button. The first visit follows the
system color preference; your choice is saved locally for future visits. Themes
still switch when preference storage is unavailable.

Expiry is checked on every read. Open results clear within one second and are
checked again when returning to the tab. Expired records are cleaned up on
creation and reads; cleanup does not run while the browser is closed. Expiry
cannot revoke a copy someone already made. Demo time comes from the device clock.
Local server responses use `Cache-Control: no-store`; there is no service worker.

Browser storage remains subject to device capacity and eviction. A failed write
shows an error and keeps the draft; a code is shown only after the transaction
commits. See [MDN's browser storage guidance](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Stage 2 — pending, not implemented

Use a **separate TextBridge Firebase project**, never the expense tracker.
Develop locally with Functions and Firestore emulators. Planned architecture:
browser → backend functions → Firestore metadata and protected file storage.

- Generate codes securely on the backend; reserve atomically and retry collisions.
- Validate word/byte limits and expiration on the server; use server timestamps.
- Large notes can exceed Firestore's 1 MiB document limit. Stage 2 must split text
  into bounded chunks behind a metadata record, enforce expiry for the whole note,
  and account for function payload limits. Do not store every note in one document.
  See [Firestore limits](https://firebase.google.com/docs/firestore/quotas).
- Add the Storage emulator for file uploads/downloads. Validate byte limits
  server-side, enforce expiry before each download, return safe attachment and
  no-store headers, and clean up orphaned/expired blobs. Avoid permanent public
  download tokens. Plan content scanning and upload/download abuse controls.
- Deny direct browser Firestore access and check expiry on every retrieval.
- Add server creation/guessing limits, deployment abuse protection, and no-store
  responses. Never log shared text or sharing codes.
- Plan background deletion independently of immediate read expiry enforcement.
- Test sharing, input validation, forced collisions, expiry, database access
  denial, and rate limits against the emulators.
- Review current live Firebase setup and Blaze billing requirements before any
  deployment. No billing or deployment action has been taken. Deploy only after
  an explicit user request.

None of these backend protections exists yet. This demo is not ready to publish
as a real sharing service.

## Git and private GitHub

Git preserves the original export and the verified Stage 1 checkpoint. The
repository root is this folder, not the parent `Text_Share` folder. Keep local
configuration, credentials, dependencies, build output, emulator data, and real
notes out of Git. No remote repository is configured yet.

When connecting GitHub, install its official CLI and use normal browser login;
never paste passwords or access tokens into chat:

```sh
gh auth login --web --git-protocol https
gh repo create text-share --private --source=. --remote=origin --push
```

If `text-share` exists, inspect it before linking or pushing. Never overwrite an
existing repository or force-push to resolve an unknown remote history.
