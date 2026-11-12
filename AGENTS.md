# TextBridge project instructions

## Scope

- The user will deploy manually. Provide guidance; do not execute cloud deployment
  unless the user explicitly asks the assistant to perform it. The earlier “let's
  deploy” was clarified as a request for manual instructions.
- This is TextBridge, separate from the expense tracker. Preserve the exported
  dark green design and reuse suitable React components.
- Current stage: the user manually deployed Supabase and Firebase Hosting. The local
  preview still uses same-origin API calls to local Supabase. Keep the local-testing
  notice in that preview. No assistant deployment without the user's explicit request. Never touch the
  expense tracker. Local CLI commands must explicitly use demo-textbridge.
- Share plain text (up to 100,000 whitespace-separated words and 20 MiB UTF-8)
  OR one file strictly under 20,000,000 bytes. Guest sharing needs no account.
  The user approved optional Firebase Google and email/password accounts and private Firestore
  Saved notes. No payments, 24-hour option, or one-time reads. Receive supports
  signature-checked PDF, PNG/JPEG/GIF/WebP, and DOCX text previews at the user's request.
  PDFs render as canvas pages through bundled PDF.js, with no scripting or
  interactive annotations. DOCX previews use a bounded archive check and Mammoth
  raw-text extraction in a terminable worker. Show the simplified-text disclosure
  and render through React text nodes. Never embed uploaded HTML or SVG. Keep downloads
  available for every file type. No Clipboard feature.
- Generate a code, same-origin /receive#CODE link, and locally rendered QR code.
  Links prefill Receive; they do not bypass expiry. Keep the correct local-testing notice for the selected mode.
- Codes are six uppercase symbols from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
  Normalize lowercase, spaces, and hyphens; reject other invalid input.
- Expiration: 5 minutes by default, or 10 minutes. Repeat reads until expiry.
- Anyone knowing an active code or link can retrieve its content. Never claim end-to-end
  encryption, interpret shared text as HTML, or log text/codes.

## Setup and verification

- Supabase is the default and its real SQL/Storage/Edge tests pass. See
  `SUPABASE_SETUP.md`. The normal preview uses local Supabase. The user deployed the
  public Firebase Hosting + Supabase direct HTTPS setup, without a separate
  proxy. See PUBLIC_DEPLOYMENT.md. Firebase guest Auth and App Check are required
  for live requests; keep it gated until provider setup, cloud deployment, cleanup
  scheduling, and production checks are ready. Local Supabase uses its isolated launcher and a runtime path without spaces;
  `demo-textbridge` is for isolated Firebase emulators, including Saved notes.
- Run `pnpm supabase:start` and `pnpm dev`. `pnpm test:supabase` runs real local
  integration and desktop/mobile browser checks. Never reset normal user databases.
  Supabase keys stay in ignored files/backend environment, never browser code.
- Use pnpm and preserve the lockfile. Run `pnpm install --frozen-lockfile`.
- Start `pnpm dev` explicitly; local URL is http://127.0.0.1:5173.
- `npm run check`: type checking, demo data tests, and production build.
- `npm run emulators`: local Functions/Firestore/Storage, with import/export.
- `npm run test:backend`: fresh emulators and backend/browser integration tests;
  stop normal emulators first. Test resets must never target imported user data.
- Node 24 for development; legacy Firebase emulators additionally need Java 21+.
- Install browser once with `pnpm exec playwright install chromium`, then use
  `pnpm test:e2e` for functional, responsive, and accessibility checks.
- Use `pnpm format` (Prettier). The inherited oxfmt version produced invalid
  TypeScript and was removed.
- Verify desktop and mobile changes. Keep test artifacts and data ignored.

## Architecture

- `src/App.tsx`: UI, demo simulation, and `/` / `/receive` history routing.
- `src/HelpSections.tsx`: how-it-works guide and keyboard-accessible FAQ.
- `src/AboutSection.tsx`: the founder's classroom story before Contact, with an
  English/Myanmar language switch that changes only this section. Owner-editable
  copy is in `src/about-story.ts`; preserve the user's informal Burmese voice.
- `src/contact-details.ts`: owner-editable public contact details. Keep placeholders
  empty until the user fills them; do not invent personal details. Contact cards
  display values only; email opens the visitor's email app. Its techStack list powers
  the Contact section's “Built with” list and describes the actual project tools.
- `src/CommentsSection.tsx`: public nickname/comment form and newest 20 comments.
  Backend-only: no simulated comment data or browser-storage fallback. Render
  comments as plain text. Keep drafts after failures and disclose public visibility.
- `src/ShareCount.tsx`: compact successful-share total below the tool and above
  the privacy message. Supabase-only, backend sourced, with a tracking start date.
  Count the pending-to-ready transition once; retain totals after expiry/cleanup.
  Never backfill deleted historical shares or use browser storage for the count.
  `SHARE_COUNT_SETUP.md` documents the owner's migration/API/Hosting update.
  `npm run test:share-count` checks the local database in a rolled-back transaction.
- `src/NotesAccount.tsx`, `src/SavedNotes.tsx`: optional email/password accounts,
  Save to Notes on Send/Receive, and a private formatted notebook at `/saved`.
  Save text only (50,000 characters / 200,000 UTF-8 document bytes), not files.
  20 stored notes per account, manual save, search loaded notes, retained legacy pagination, optimistic revision checks,
  explicit deletion confirmation, and plain-text temporary sharing snapshots.
  Notes persist until deletion independently of sharing expiry. No Clipboard UI.
- `src/firebase-session.ts`: shared session-only Firebase Auth for guest/account
  live headers and notes, plus existing App Check. Local notes always use the
  `demo-textbridge` Auth/Firestore emulators; no public credentials are needed.
- `src/notes-client.ts`, `src/note-document.ts`: owner paths, server-confirmed
  saves, schema/size validation, restricted document JSON, and plain snapshots.
  No raw HTML rendering or persistent private note/draft cache. Clear visible
  private data on logout/account switch. Keep drafts after save failures.
- `SAVED_NOTES_SETUP.md`: manual Firebase Email/Password enablement, default
  Firestore creation, owner rules/indexes deployment, Hosting build/deploy, and
  two-device verification. Run `npm run notes:emulators` for local preview;
  `npm run test:notes` uses fresh emulators without importing normal user data.
- `functions/comments.js`: server validation (nickname 40, comment 1,000 characters),
  server timestamps, and atomic posting/list limits. Direct database access stays
  denied. Comments persist independently of sharing expiry. No moderation UI yet.
- `src/demo-store.ts`: validation, expiry, and demo limits.
- `src/indexed-store.ts`: retained old demo adapter and localStorage migration.
- `src/share-client.ts`: Same-origin HTTP client; Supabase is default, firebase/demo are legacy modes.
- `functions/`: server validation, code reservations, rate limits, safe downloads.
- Supabase Postgres stores private metadata; Storage holds text/file payloads.
- `supabase/migrations/`: private schema/RPCs and 5/10-minute expiry migration.
- `supabase/functions/api/`: shared Web API handler and Deno Edge entrypoint.
- `scripts/supabase.mjs`: local runtime launcher and private status capture.
- Legacy Firebase service code is retained; do not migrate or reset its data.
- Deny direct browser access to temporary-share databases/storage. The approved
  exception is Firestore `users/{uid}/notes/{id}`, protected by owner-only rules;
  all other Firestore paths stay denied. Never generate public download URLs.
- Support light/dark themes with a persisted choice; default to system preference.
- Receive uses one labeled native input with six decorative code slots. Preserve
  paste, normalization, caret/selection, and the forced-colors fallback when editing.
- Keep the wider desktop layout and subtle green/teal background with solid cards.
- `src/index.css`: retained export styling with accessibility/responsive repairs.
- `vite.config.ts`: local tooling. `.figma/` is inactive export provenance.
- `tests/demo-store.test.ts`: data behavior; `tests/browser/`: user flows.

## Before future live deployments (owner handles publication)

- Live access is enabled in the user's cloud backend; retain its access gate. Configure and test public abuse controls,
  backend rate salt, origin allowlist, and scheduled cleanup before enabling it.
  Supabase verifies Firebase guest JWTs and App Check JWTs itself. Ignore client
  forwarded/IP headers; rate limits use a hash of the verified guest ID.
- Preserve atomic reservations, backend validation/rate limits, expiry checks,
  deny rules, and no-store responses. Large content stays in Storage.
- Configure scheduled cleanup, orphan monitoring, deployment hosting rewrites,
  budgets, and upload/content abuse controls. No malware scanning exists yet.
- Explain the chosen backend/hosting setup and current plan limits before deployment. Report every
  protection still unconfigured. Test on the chosen production runtime.

## Git and secrets

- Preserve work/history. Commit checkpoints after verified stages.
- Keep configuration examples placeholder-only. Never commit shared text,
  credentials, service-account keys, dependencies, builds, or emulator exports.
- Target private GitHub repo: `text-share`. Use normal browser sign-in; never
  request passwords/tokens in chat or force-push over unknown remote history.

## Public preparation checkpoint

- Firebase TextBridge Web is registered; private pending config is ignored under
  secrets/. The user manually deployed the website/backend; no assistant deployment
  or billing change has occurred. The live homepage returns HTTP 200.
- firebase.hosting.json is the separate Hosting/Auth/notes-Firestore config.
  Deploy notes rules/indexes explicitly using this config; never deploy legacy
  Firebase Functions or Storage for the Supabase public app.
- Firebase Anonymous Auth and the saved reCAPTCHA Enterprise App Check provider
  have been verified. Ignored .env.production.local is complete and the real public
  build passes. Real provider token exchanges, cloud cleanup, and two-device checks
  remain pending for production verification.
- supabase/deployment/cleanup.sql prepares a one-minute Vault-backed cleanup job;
  cleanup-status.sql checks HTTP responses and backlog. The real local extensions
  passed scripts/check-cleanup-local.mjs in a rolled-back transaction. The user installed
  the cloud schedule; read-only checks confirmed active=true, recent HTTP 200, and
  no expired/orphan backlog. Store Vault values privately
  using bound parameters, never inline tracked SQL or browser configuration.
- Public builds use npm run build:public, which rejects incomplete configuration.
- `SEARCH_SETUP.md` describes the owner's manual Search Console verification and
  redeploy steps. The homepage is indexable in source; Firebase Hosting must keep
  `/receive` and `/receive/**` noindex through response headers. Only the homepage
  belongs in public/sitemap.xml. These SEO changes require the owner's redeploy.
- The retained real local Supabase integration checks passed at the prior checkpoint.

## Saved notes checkpoint (November 10)

- Optional email/password accounts and private formatted Saved notes are implemented
  locally. No account provider, cloud Firestore database/rules, or website update
  was deployed by the assistant. Follow SAVED_NOTES_SETUP.md before publishing.
- `npm run check` passes 39 unit/contract tests and the production build;
  `npm run build:public` also passes with the existing ignored public configuration.
- The real local Auth/Firestore owner-rules test passes (owner CRUD, cross-account
  and anonymous denial, schema/size/timestamp/revision validation).
- Six Saved-note flows pass across desktop, mobile, and 320px screens, including
  signup/login/logout, formatting persistence, save before/after sharing, plain
  snapshots, search/delete, offline errors, concurrent edits, and About navigation.
- All 51 retained sharing browser tests pass. Select Send/Receive buttons within
  the labeled Sharing mode group, separate from header navigation. Mode switching
  restores keyboard focus after mounting. Use one browser worker for large-text
  and accessibility scans to avoid exhausting the local machine.
- The normal local preview needs `npm run notes:emulators` for accounts/notes;
  temporary sharing still uses local Supabase. Never import emulator accounts or
  test notes into the public project. No new administrator secret is required.

## Account providers and note-cap update (November 10)

- Saved notes require a password, Google, or Apple-authenticated owner. At the
  user's explicit request, email/password signup signs in immediately: no email
  verification message, link, UI gate, or email_verified rule requirement.
  Keep valid-email-format and password checks. Forgot password still uses Firebase
  email action links and needs an accessible inbox. Google/Apple
  use popups so unsaved source text stays on screen; no account merging is added.
- `AUTH_SETUP.md` documents manual Firebase Google/email and Apple Developer
  configuration. Real provider consent, Apple relay, inbox delivery, and Safari
  behavior require owner checks. No cloud providers or billing were changed.
- The hard limit is 20 concurrent saved notes, never a daily quota. Creation and
  deletion atomically update `users/{uid}/noteState/quota`; rule checks require
  exactly one matching note-ID addition/removal. Editing/sharing still work full.
  A server-backed counter and clear errors preserve drafts on rejected saves.
- `NOTE_LIMIT_SETUP.md` documents the safe legacy upgrade: maintenance rules
  freeze membership changes, the owner-only Admin script backfills exact IDs,
  then final rules/Hosting are deployed manually. Never auto-delete old notes.
  Over-limit legacy accounts can edit/share/delete until below 20.
- `functions/migrate-note-quota.mjs` is an owner-run CLI, never imported by cloud
  Functions or the browser. `--uid` scopes an individual account for local tests.
  Local commands must target `demo-textbridge`; cloud credentials never enter VITE.
- Local Auth/Firestore checks cover registered providers, 20-slot races, bypass
  attempts, deletion/refill, and legacy migration. Browser tests cover immediate unverified-email signup,
  password-reset completion, cancelled/full provider popups, counters, and draft
  preservation across desktop/mobile/320px. Follow setup guides before publishing.

## Immediate email signup (November 10)

- User explicitly removed email verification. Any valid-format email accepted by
  Firebase can create an account and open Saved notes immediately, even if its
  inbox is inaccessible. Keep Forgot password; explain it needs inbox access.
- Remove the verification flow from both UI and Firestore rules (including the
  maintenance rules), never just hide the screen. Existing unverified accounts
  remain usable. Owner-only paths, provider restrictions, and 20-slot quota stay.
- This change still needs the owner's manual Firestore rules and Hosting redeploy
  for the live website. Do not enable cloud providers or deploy automatically.

## Apple sign-in removed (November 10)

- User explicitly removed Apple login. Offer Google and email/password only, with
  the existing Google logo, immediate signup, and password reset.
- No Apple OAuth entry point or button. Do not re-add or enable it without asking.
  Preserve existing account/note data and legacy owner-rule compatibility.
- No cloud settings were changed. Publication remains the owner's manual task.


## Emoji and note arrangement update (November 12)

- User requested more emojis, movable note cards, and a rounded-square account
  avatar. The picker has named categories and local search; preserve the editor
  selection across search/category interaction. No remote emoji service.
- Move cards using the six-dot pointer/touch grip, its earlier/later buttons, or
  keyboard Up/Down. Pinned notes remain first. Persist order in owner-only
  `users/{uid}/noteState/order`, independent of note content, revisions, and quota.
  The arrangement has up to 20 unique existing note IDs, its own revision and
  server timestamp. Refresh before retrying a stale-device arrangement.
- No localStorage private-note or order persistence. Failed/offline moves retain
  the last confirmed arrangement. Clear the library/order when switching accounts.
- Owner must manually publish updated firestore.rules before the public website;
  no cloud changes are authorized by this UI request. Existing notes need no
  order migration. Existing appearance and default recency order remain supported.
