# TextBridge

A small text-sharing tool built from the original Figma Make export with React,
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

1. Paste a note, link, or snippet. Choose 10 minutes (default) or 1 hour.
2. Generate and copy the six-character code.
3. Select Receive, or open `/receive` in another tab **in the same browser and
   at the same address**. Paste the code and select View text.
4. Retrieve repeatedly until expiry. Multiple codes stay active independently.

`localhost` and `127.0.0.1` have separate storage. Private windows, other profiles,
and other devices cannot retrieve demo notes. Generated notes survive refresh;
unsent drafts do not survive a full reload. Text is stored unencrypted in
localStorage. Anyone knowing an active code can read its text; there is no
end-to-end encryption. Use sample data for this demo.

Expand **Demo testing options** to simulate a network failure or rate limit on
the next operation. The browser also demonstrates limits of 5 creations and 20
lookups per minute. These are bypassable local limits, not server protection.
Clipboard failures show manual-copy instructions instead of claiming success.

## Checks

```sh
pnpm check                 # TypeScript, 9 data tests, production build
pnpm exec playwright install chromium  # Once per machine
pnpm test:e2e              # 21 browser cases, including accessibility scans
pnpm preview              # Optional built-app preview at 127.0.0.1:4173
pnpm format               # Format source safely with Prettier
```

The browser suite uses 1440px desktop, 390px phone, and 320px narrow-phone widths.
It checks copying, cross-tab reads, safe multiline/Unicode content, length limits,
invalid codes, expiry, keyboard navigation, cancellation, storage failures, and
simulated errors. Unit tests force collisions and verify local rate-limit
recovery. Screenshots go into ignored `artifacts/`; test results/traces are also
ignored. Automated accessibility scans supplement manual screen-reader and
real-device testing; they do not prove complete accessibility.

## Architecture and decisions

- `src/App.tsx`: forms, results/errors, clipboard feedback, route history, and
  request simulation. The export's components and icons are reused. React renders
  shared text inside `<pre>`; shared content is never interpreted as HTML.
- `src/demo-store.ts`: browser-only data adapter. Each code gets its own record;
  input validation, collision retries, expiry, and demo limits live here. Stage 2
  will replace this boundary with calls to Firebase backend functions.
- `src/index.css`: exported dark green styling with responsive and accessibility
  repairs, focus indicators, and reduced-motion support.
- `vite.config.ts`: ordinary local Vite setup. Figma hosting hooks were removed.
  `.figma/` is retained only as export provenance; do not use its hosting scripts.
  The old export formatter generated invalid TypeScript; Prettier replaces it.
- `tests/`: data tests and browser regressions using synthetic notes only.

The 10,000-character limit counts Unicode code points: a simple emoji counts as
one, but combined emoji/accent sequences may contain several code points.
Over-limit text remains editable and cannot be sent; it is not silently cut off.
Code normalization removes whitespace/hyphens and uppercases letters. Other
invalid symbols and excess characters are rejected, not truncated.

Expiry is checked on every read. Open results are cleared within one second and
checked again when returning to the tab. Expired records are cleaned up on
creation and reads; cleanup does not run while the browser is closed. Expiry
cannot revoke a copy someone already made. Demo time comes from the device clock;
localStorage is not a distributed transaction. Local server responses use
`Cache-Control: no-store`. There is no service worker or backend response cache.

## Stage 2 — pending, not implemented

Use a **separate TextBridge Firebase project**, never the expense tracker.
Develop locally with Functions and Firestore emulators. Planned architecture:
browser → callable backend functions → Firestore.

- Generate codes securely on the backend; reserve atomically and retry collisions.
- Validate size/expiration on the server; use server-generated timestamps.
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
