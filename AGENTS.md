# TextBridge project instructions

## Scope
- This is TextBridge, separate from the expense tracker. Preserve the exported
  dark green design and reuse suitable React components.
- Current stage: Firebase Functions/Firestore/Storage tested locally. Default
  browser mode uses same-origin API calls to emulators. Keep the local-testing
  notice. No deployment without the user's explicit request. Never touch the
  expense tracker. Local CLI commands must explicitly use demo-textbridge.
- Share plain text (up to 100,000 whitespace-separated words and 20 MiB UTF-8)
  OR one file strictly under 20,000,000 bytes. No accounts, payments, passwords,
  24-hour option, or one-time reads. Download files; never embed active content.
- Generate a code, same-origin /receive#CODE link, and locally rendered QR code.
  Links prefill Receive; they do not bypass expiry. Keep the correct local-testing notice for the selected mode.
- Codes are six uppercase symbols from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
  Normalize lowercase, spaces, and hyphens; reject other invalid input.
- Expiration: 10 minutes by default, or 30 minutes. Repeat reads until expiry.
- Anyone knowing an active code or link can retrieve its content. Never claim end-to-end
  encryption, interpret shared text as HTML, or log text/codes.

## Setup and verification
- Use pnpm and preserve the lockfile. Run `pnpm install --frozen-lockfile`.
- Start `pnpm dev` explicitly; local URL is http://127.0.0.1:5173.
- `npm run check`: type checking, demo data tests, and production build.
- `npm run emulators`: local Functions/Firestore/Storage, with import/export.
- `npm run test:backend`: fresh emulators and backend/browser integration tests;
  stop normal emulators first. Test resets must never target imported user data.
- Node 24 and Java 21+; launcher uses ignored .tools Java when present.
- Install browser once with `pnpm exec playwright install chromium`, then use
  `pnpm test:e2e` for functional, responsive, and accessibility checks.
- Use `pnpm format` (Prettier). The inherited oxfmt version produced invalid
  TypeScript and was removed.
- Verify desktop and mobile changes. Keep test artifacts and data ignored.

## Architecture
- `src/App.tsx`: UI, demo simulation, and `/` / `/receive` history routing.
- `src/HelpSections.tsx`: how-it-works guide and keyboard-accessible FAQ.
  Comments remain deferred; Firebase sharing work has resumed.
- `src/demo-store.ts`: validation, expiry, and demo limits.
- `src/indexed-store.ts`: retained old demo adapter and localStorage migration.
- `src/share-client.ts`: Firebase HTTP client; VITE_SHARE_MODE=demo selects old demo.
- `functions/`: server validation, code reservations, rate limits, safe downloads.
- Firestore stores metadata; Storage stores both file and large text payloads.
- Deny direct browser database/storage access. Never generate public download URLs.
- Support light/dark themes with a persisted choice; default to system preference.
- Receive uses one labeled native input with six decorative code slots. Preserve
  paste, normalization, caret/selection, and the forced-colors fallback when editing.
- Keep the wider desktop layout and subtle green/teal background with solid cards.
- `src/index.css`: retained export styling with accessibility/responsive repairs.
- `vite.config.ts`: local tooling. `.figma/` is inactive export provenance.
- `tests/demo-store.test.ts`: data behavior; `tests/browser/`: user flows.

## Before live deployment (not authorized)
- Live access is deliberately gated off. Configure and test the App Check web
  provider, secret-managed rate salt, bucket, origin, and trusted proxy/IP identity
  before enabling it. Backend token verification alone is not complete setup.
- Preserve atomic reservations, backend validation/rate limits, expiry checks,
  deny rules, and no-store responses. Large content stays in Storage.
- Configure scheduled cleanup, orphan monitoring, deployment hosting rewrites,
  budgets, and upload/content abuse controls. No malware scanning exists yet.
- Explain live Firebase setup and Blaze billing before deployment. Report every
  protection still unconfigured. Test on the chosen production runtime.

## Git and secrets
- Preserve work/history. Commit checkpoints after verified stages.
- Keep configuration examples placeholder-only. Never commit shared text,
  credentials, service-account keys, dependencies, builds, or emulator exports.
- Target private GitHub repo: `text-share`. Use normal browser sign-in; never
  request passwords/tokens in chat or force-push over unknown remote history.
