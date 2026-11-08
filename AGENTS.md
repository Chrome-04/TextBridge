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
  OR one file strictly under 20,000,000 bytes. No accounts, payments, passwords,
  24-hour option, or one-time reads. Download files; never embed active content.
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
  `demo-textbridge` is for legacy Firebase commands only.
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
- Deny direct browser database/storage access. Never generate public download URLs.
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
- firebase.hosting.json is the separate Hosting/Auth deployment config. Never
  deploy legacy Firebase Functions/Firestore/Storage for the Supabase public app.
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
- 31 unit/contract tests + 8 real local backend tests + 2 browser flows pass.
