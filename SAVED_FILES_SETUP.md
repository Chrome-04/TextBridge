# Private saved files: manual setup

Each signed-in account can keep **20,000,000 bytes (20 MB) of saved files in total**.
This is combined storage, not 20 MB for each file and not a daily allowance.
For example, a 3 MB CV and a 7 MB portfolio use 10 MB together. Deleting either
file frees its bytes after the actual stored object has been removed.

The Saved page has separate Notes and Files tabs. Notes retain their existing
20-note limit. Files accept non-empty documents and other file types, up to the
space remaining in the account. They do not expire after 5 or 10 minutes.
The Files tab supports upload, download, refresh, and confirmed permanent deletion.
Saved file previews and temporary sharing directly from this tab are not included.

## Services and privacy

- Firebase Authentication identifies the Google or email/password account.
  Anonymous sharing sessions cannot access permanent files. Email verification
  remains optional as requested; password reset still needs access to the inbox.
- Supabase stores file metadata and sizes alongside the private Storage objects.
  The API's database transaction checks the combined 20 MB quota before reserving
  space. Keeping the file registry and quota together makes simultaneous uploads
  safe. Firestore continues storing formatted text notes and their card order.
- The new `textbridge-saved` bucket is private and separate from expiring shared
  payloads. Browsers cannot access it directly. API requests verify the Firebase
  account; public requests also verify the existing App Check token and origin.
- Downloads require the owner account and use attachment responses with no-store
  headers. Uploaded HTML, SVG, and executables are never embedded or executed.
  A file being saved does not make every file type previewable.
- There is no persistent browser file cache or localStorage file copy. Signing out
  clears the displayed library. Storage is account-restricted, not end-to-end
  encryption: project administrators retain access to project data.

## 1. Try locally

Keep local Supabase and the Firebase notes emulators running. If starting them:

```sh
pnpm supabase:start
```

In another terminal:

```sh
pnpm notes:emulators
```

The Firebase project must remain `demo-textbridge`. Do not start duplicate
services if these ports already have running instances. No reset is needed.
Capture the local Supabase status privately and install the new local schema:

```sh
pnpm supabase:status
node scripts/saved-files-local.mjs
pnpm dev
```

The setup script refuses remote database addresses. It adds only saved-file
objects, preserves existing data, and records its migration when the local
migration journal exists. The assistant installed this locally for verification.

Open http://127.0.0.1:5173/saved, sign in with a local test account, and choose
**Files · 20 MB**. Upload a sample document, refresh, download it, and delete it.
Local test accounts/files are not copied into the cloud project.

## 2. Manually publish the new Supabase schema

From **TextBridge Sharing Prototype**, using your existing Supabase login:

```sh
./node_modules/.bin/supabase db push --project-ref ucxmnospkhnoetxixzqg --dry-run --skip-vault
```

Review the pending migration list. The new migration is
`202611120001_saved_files.sql`. Existing pending migrations may also appear;
review them before proceeding. Then apply to the same project:

```sh
./node_modules/.bin/supabase db push --project-ref ucxmnospkhnoetxixzqg --skip-vault
```

The migration creates the private file registry, atomic quota functions, and
`textbridge-saved` bucket. It does not reset existing shares, notes, or files.
Do not make the new bucket public or add anonymous browser Storage policies.
No new browser key or administrator secret is required.

## 3. Manually publish the API

After the schema is applied:

```sh
./node_modules/.bin/supabase functions deploy api --project-ref ucxmnospkhnoetxixzqg --no-verify-jwt --use-api
```

This uses the API's existing Firebase Auth/App Check verification. The CLI flag
`--no-verify-jwt` disables Supabase's incompatible gateway JWT check; it does not
disable the account verification implemented inside the function.
Existing live Firebase project settings, origin allowlist, rate salt, live gate,
and cleanup secret must remain configured. No secrets belong in tracked files.

The existing scheduled `/cleanup` call now also removes abandoned pending uploads
older than 15 minutes and retries interrupted deletions. Ready saved files are
excluded, regardless of their age. Pending bytes remain reserved until Storage
confirms deletion. Check your existing cleanup schedule after publishing; no
second schedule is needed if the current one runs successfully.

## 4. Manually publish the website

Keep the existing production environment configuration. First publish current
Firestore note rules if the recent card-reordering update is also new to your site:

```sh
./node_modules/.bin/firebase deploy --only firestore:rules,firestore:indexes --config firebase.hosting.json --project textbridge-8c8a4
```

Then build and deploy Hosting:

```sh
pnpm run build:public
./node_modules/.bin/firebase deploy --only hosting --config firebase.hosting.json --project textbridge-8c8a4
```

The assistant does not perform these cloud deployment steps. No Firebase Cloud
Storage or Firebase Functions deployment is needed for this feature.

## 5. Verify on the live site

1. Sign in with your real account and upload a harmless sample CV/PDF.
2. Check the byte meter, refresh, and download the file. Confirm its contents.
3. Sign in with the same account on another device and confirm the same file.
4. A different account must show its own empty file library. Guest users must
   not get file access, including by attempting to reuse a file ID.
5. Test multiple files whose combined sizes exceed 20 MB. The extra upload must
   fail without overwriting or deleting existing files. Exactly 20,000,000 bytes
   is allowed; empty files and anything above the remaining space are rejected.
6. Cancel a deletion first, then confirm it. Check that storage is freed.
7. Confirm your cleanup job returns HTTP 200 and that ready files remain after
   the normal sharing expiry period.

An interrupted upload may finish even if its browser response was lost. Refresh
before trying again. Unfinished uploads reserve space until the cleanup job
removes them; interrupted deletions keep their bytes reserved until retried.

## Capacity and checks

The account cap does not expand the project's storage or bandwidth allowance.
Fifty fully used accounts would use approximately 1 GB for saved files alone;
temporary shares and other project storage also use the provider's allowance.
Monitor Supabase's actual project storage and bandwidth usage. A full provider
quota can prevent operations even when one account has spare space.

Local verification commands:

```sh
pnpm run check
pnpm test:saved-files
pnpm exec playwright test --config=playwright.saved-files.config.ts
```

These need local services; integration/browser checks create and clean up only
their own test accounts and files. They never reset the normal database.
