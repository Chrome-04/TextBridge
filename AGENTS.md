# TextBridge project instructions

## Scope
- This is TextBridge, separate from the expense tracker. Preserve the exported
  dark green design and reuse suitable React components.
- Current stage: browser-local demo. Keep its visible notice until a real backend
  is connected. No deployment without the user's explicit request.
- Plain text only, up to 100,000 whitespace-separated words and 20 MiB UTF-8. No accounts, files, payments,
  passwords, 24-hour option, or one-time reads.
- Codes are six uppercase symbols from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
  Normalize lowercase, spaces, and hyphens; reject other invalid input.
- Expiration: 10 minutes by default, or 30 minutes. Repeat reads until expiry.
- Anyone knowing an active code can retrieve it. Never claim end-to-end
  encryption, interpret shared text as HTML, or log text/codes.

## Setup and verification
- Use pnpm and preserve the lockfile. Run `pnpm install --frozen-lockfile`.
- Start `pnpm dev` explicitly; local URL is http://127.0.0.1:5173.
- `pnpm check`: type checking, data tests, and production build.
- Install browser once with `pnpm exec playwright install chromium`, then use
  `pnpm test:e2e` for functional, responsive, and accessibility checks.
- Use `pnpm format` (Prettier). The inherited oxfmt version produced invalid
  TypeScript and was removed.
- Verify desktop and mobile changes. Keep test artifacts and data ignored.

## Architecture
- `src/App.tsx`: UI, demo simulation, and `/` / `/receive` history routing.
- `src/demo-store.ts`: validation, expiry, and demo limits.
- `src/indexed-store.ts`: IndexedDB transaction adapter and legacy localStorage migration.
- Support light/dark themes with a persisted choice; default to system preference.
- `src/index.css`: retained export styling with accessibility/responsive repairs.
- `vite.config.ts`: local tooling. `.figma/` is inactive export provenance.
- `tests/demo-store.test.ts`: data behavior; `tests/browser/`: user flows.

## Next stage
- Use Functions and Firestore emulators with a separate TextBridge project.
- Deny direct Firestore access; generate/reserve codes atomically server-side
  with collision retries, server timestamps, and backend input validation.
- Enforce expiry on every retrieval, backend creation/guessing limits, deployment
  abuse protection, and no-store responses. Background cleanup is independent.
- Large notes exceed Firestore document limits; plan bounded chunks, metadata,
  request-size handling, and whole-note expiry before backend implementation.
- Test all backend boundaries and report unimplemented protections.
- Explain live setup and current Blaze billing requirements before deployment.

## Git and secrets
- Preserve work/history. Commit checkpoints after verified stages.
- Keep configuration examples placeholder-only. Never commit shared text,
  credentials, service-account keys, dependencies, builds, or emulator exports.
- Target private GitHub repo: `text-share`. Use normal browser sign-in; never
  request passwords/tokens in chat or force-push over unknown remote history.
