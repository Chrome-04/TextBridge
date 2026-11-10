# 20 saved notes per account: manual rollout

The limit is **20 notes stored at once**, not 20 per day. Editing and sharing an
existing note use no extra slots. Deleting one frees a slot. Text remains limited
to 50,000 characters per note. Temporary guest sharing is unchanged.

The library shows the server's total as `12 / 20 notes saved`, even when searching.
Refresh notes updates changes made on other devices. Transactions and Firestore
rules enforce the limit across devices, including clients that bypass the UI.
Each creation/deletion also writes the private `users/{uid}/noteState/quota`
registry. Its note-ID map prevents multiple creations claiming a single slot.

## New database with no saved notes

Deploy the new Firestore rules/indexes, then build and publish Hosting using the
commands in SAVED_NOTES_SETUP.md. Nothing here is deployed automatically. Empty
accounts initialize their own registry atomically on their first successful save.

## Existing saved notes: preserve them before changing the rules

If any version of Saved notes has already been published, do this migration first.
Never delete the database or reset existing notes. Accounts with more than 20
notes retain every note; they can edit/share/delete, but cannot add more until
their total is below 20. Email verification is not required.

1. From the app folder, temporarily freeze note creation/deletion:

   ```sh
   ./node_modules/.bin/firebase deploy --only firestore:rules --config firebase.notes-maintenance.json --project textbridge-8c8a4
   ```

   Reading and editing existing notes remain available to authenticated owners.
   Both old and new clients are prevented from changing note membership while
   the migration scans it. The website may report that saves/deletes are denied.

2. The owner-only migration uses the existing Admin SDK in `functions/`.
   If necessary, install its dependencies with `pnpm install --frozen-lockfile`.
   Authenticate Application Default Credentials using your own authorized project account:

   ```sh
   gcloud auth application-default login
   ```

   This requires Google Cloud CLI and permission to read/write Firestore in the
   specified project. Firebase CLI login alone does not supply these credentials.
   Do not copy tokens or download service-account keys into the frontend.

3. Preview, then apply the backfill. Keep maintenance rules active throughout:

   ```sh
   node functions/migrate-note-quota.mjs --project textbridge-8c8a4 --writes-frozen
   node functions/migrate-note-quota.mjs --project textbridge-8c8a4 --writes-frozen --apply
   ```

   This scans note references and writes only quota registries. It never changes
   note content, deletes notes, or prints their text. It is safe to repeat while
   writes remain frozen. If interrupted, finish the migration before step 4.

4. Deploy the final rules and indexes:

   ```sh
   ./node_modules/.bin/firebase deploy --only firestore:rules,firestore:indexes --config firebase.hosting.json --project textbridge-8c8a4
   ```

5. Build and publish the new website following SAVED_NOTES_SETUP.md. Check that
   the library total matches existing notes. Create a 20th note, confirm a 21st
   is blocked, edit/share at the limit, and delete one to make room. Test from
   two devices. The old UI cannot create/delete without the paired registry;
   tell visitors to refresh after the update.

Do not restore the old unrestricted rules after migrating; they can let counts
drift. If a quota registry is missing or inconsistent, keep creation/deletion
frozen and repeat the owner migration. Do not manually invent a lower total.

For local backfill only, with normal notes emulators running:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8082 node functions/migrate-note-quota.mjs --project demo-textbridge
FIRESTORE_EMULATOR_HOST=127.0.0.1:8082 node functions/migrate-note-quota.mjs --project demo-textbridge --apply
```

The assistant has not run a cloud migration or deployment.
