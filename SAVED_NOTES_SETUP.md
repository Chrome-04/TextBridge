# Saved notes: manual setup and deployment

The website has Google and email/password accounts and a private text notebook with 20 notes per account. The header bookmark opens the notebook. After signing in, the profile avatar shows your account details, Saved notes, and Log out. See AUTH_SETUP.md for provider configuration and NOTE_LIMIT_SETUP.md before upgrading an existing notes database. Nothing
in this feature setup has been deployed by the assistant. Your existing public
version stays as it is until you complete the steps below.

## What uses each service

- **React + TypeScript**: the account screens, Saved library, and editor.
- **Tiptap**: editable document formatting: bold, italic, underline, lists, undo,
  redo, and a small emoji picker. Text is validated as document JSON; shared text
  never becomes HTML.
- **Firebase Authentication**: Google sign-in, email/password signup, login, logout, password reset.
  Anonymous Authentication remains available for visitors who only share text.
- **Cloud Firestore**: private notes at `users/{Firebase UID}/notes/{note ID}`.
  Owner rules restrict reads and writes to that account; anonymous users cannot
  access notes. The web app uses memory caching, not a persistent notes cache.
- **Supabase**: existing temporary text/file sharing, expiry, comments, and share
  counter. Share note sends a separate plain-text snapshot through this backend.
- **Firebase Hosting**: serves the website. The new `/saved` page is excluded from
  indexing through Hosting headers and is not added to the public sitemap.

Saving a note does not increase the share counter. Generating a successful
temporary sharing code does. The saved original remains after the sharing code
expires. Changing or deleting that original does not revoke a shared copy.

## 1. Try it locally first

Open the **TextBridge Sharing Prototype** folder in VS Code, not the parent Git
folder. Keep your usual local Supabase service running for temporary sharing.
In another terminal, run:

```sh
npm run notes:emulators
```

This starts only local Firebase Authentication (`127.0.0.1:9099`) and Firestore
(`127.0.0.1:8082`), using the safe `demo-textbridge` project. The notes emulator
dashboard is [http://127.0.0.1:4001](http://127.0.0.1:4001).
Java 21+ is needed for Firestore. The launcher reuses the project's ignored local
Java installation when available. It imports/exports only `notes-emulator-data/`;
it does not reset your Supabase database or old Firebase emulator data.

Your existing development server is at
[http://127.0.0.1:5173](http://127.0.0.1:5173). If it is already running, refresh
the page; do not start a second copy on that port. Otherwise run `npm run dev`.

Use sample email/password accounts for local tests. No real email is sent by the
Auth emulator; password reset links appear in its terminal. Local accounts and
notes do not get copied to the cloud project when you deploy.

## 2. Enable real email/password accounts

In the [Firebase console](https://console.firebase.google.com/), select the
**TextBridge** project (`textbridge-8c8a4`).

1. Open **Build → Authentication → Sign-in method**.
2. Enable **Email/Password** and save. The email-link/passwordless option is not
   required for this implementation.
3. Keep **Anonymous** enabled: public temporary sharing still uses it for guests.
4. Under **Settings → Authorized domains**, check that your website hostname
   `textbridge-8c8a4.web.app` is allowed. Add your own custom hostname if you use one.
5. Under **Templates**, review the password-reset email and sender display name.

Google requires its own provider setup; see AUTH_SETUP.md. Phone/SMS is not used. No new administrator key is required in the web app.
The UI requests at least eight password characters; stronger Firebase password
policies may add requirements. Accounts use browser session persistence, so always
log out explicitly on shared computers, especially if the browser restores tabs.

## 3. Create Cloud Firestore

1. In the same project, open **Build → Firestore Database → Create database**.
2. Choose the **Standard** edition and the default database (`(default)`), using
   the regular Firebase/Native database, not a MongoDB-compatible database.
3. Choose a suitable nearby location. Review it carefully before creation.
4. Start in **Production mode**. Do not choose open test rules.
5. If the default Firestore database already exists, keep it; do not create or
   reset another database. The next step adds only this app's notes permissions.

This feature uses Firestore, not Firebase Cloud Storage or Cloud Functions.
Email/password Auth, Firebase Hosting, and limited Firestore usage can use the
Spark plan. Supabase continues handling temporary file storage independently.
Check the actual project's plan and usage rather than assuming unlimited usage.

## 4. Publish the notes security rules and index exemptions

From the application folder, sign in with the Firebase account that manages this
TextBridge project, if necessary:

```sh
./node_modules/.bin/firebase login
```

Then publish only Firestore rules and indexes:

```sh
./node_modules/.bin/firebase deploy --only firestore:rules,firestore:indexes --config firebase.hosting.json --project textbridge-8c8a4
```

Review the project ID in the CLI output before confirming. This command does not
deploy the retained legacy Firebase Functions or Storage backend. Do not run an
untargeted `firebase deploy` using the old `firebase.json`.

The checked-in `firestore.rules` allows only an email/password, Google, or Apple-authenticated owner to
access their notes, validates fields/sizes/timestamps/revisions, and limits list
requests to 30 notes, and enforces 20 stored notes through an atomic private quota registry. If notes already exist, follow NOTE_LIMIT_SETUP.md before deploying. All other browser database access remains denied. Index
exemptions keep the document body, plain text, title, colour, and pin settings out of automatic indexes;
the library loads notes by `updatedAt`, displays pinned notes first, and searches
already-loaded notes locally.
Publish the updated rules before the website so it can save note colours and pins.
Older notes appear with the default colour and start unpinned. Appearance alone
requires no data migration.

## 5. Keep the existing public browser configuration

Your ignored `.env.production.local` already contains Firebase web configuration,
App Check's public site key, and the Supabase function URL. This feature reuses the
same Firebase app and identity. No service-role key, database password, or secret
API key belongs in `VITE_` variables or browser source.

The regular local preview always connects notes to the demo emulators when
`VITE_SHARE_STAGE` is not `live`. The public build uses the configured real Firebase
project. Do not set your normal local preview to `live` just to test notes.

## 6. Build and manually publish the website

After the provider, database, and rules are ready:

```sh
npm run build:public
./node_modules/.bin/firebase deploy --only hosting --config firebase.hosting.json --project textbridge-8c8a4
```

This publishes the website at
[https://textbridge-8c8a4.web.app](https://textbridge-8c8a4.web.app).
No Supabase schema migration or API redeployment is needed specifically for notes:
the existing backend already verifies Firebase account tokens as well as guest
tokens. Keep the previously required Supabase live configuration and cleanup job.

## 7. Verify the real website on two devices

1. Without logging in, send and receive sample text. Existing guest sharing should
   still work, including expiry and the share count.
2. Type a draft on Send, click **Save to Notes**, and create an account. Signup signs you in immediately without email verification. Confirm
   the success message and open the new note.
3. Edit the title and text, try bold/italic/lists/emoji, choose a colour, and click **Save note**. Pin the card to keep it near the top.
4. Log into the same account on another device. Use the header bookmark and refresh the list.
   Your note should be there with its formatting, colour, and pin setting.
5. Choose **Share note**, select 5 or 10 minutes, and generate a code. Receive it
   on another device: only the plain text should arrive. The saved note remains.
6. On the received text, use **Save to Notes** to keep a private copy in the
   receiving account. Saving is optional; merely receiving text does not save it.
7. Open the profile avatar and choose **Log out**. The private library must disappear immediately. A different account
   must have its own separate library.
8. Try password reset with your own real email. Check the email and reset link.
9. Keep Firebase App Check monitoring enabled. If you choose to enforce App Check
   for Firestore, first verify successful tokens on the deployed domain; the
   existing app initializes App Check before using Firestore. Authentication and
   owner rules remain necessary even with App Check.

## Limits and privacy

- Notes are text documents, not permanent uploaded files. No Clipboard feature
  was added. Existing copy/paste buttons still do their original jobs.
- Each note supports 50,000 JavaScript text characters, a 120-character title, and
  up to 200,000 UTF-8 bytes of validated document JSON. Very complex formatting
  can reach that JSON limit sooner. Oversize text is rejected, never truncated.
- Temporary sharing keeps its separate 100,000-word / 20 MiB text limit and
  single-file limit below 20,000,000 bytes. Saved notes use the smaller limit
  because a Firestore document must fit below its document-size limit.
- Notes have no expiry. Save is manual; refresh the list to see changes from
  another device. The library fetches 30 at a time; **Load more notes** fetches
  older notes retained from older installations. Search checks the loaded list. Each account may store **20 notes at once**. Editing/sharing does not use slots; deleting frees one. Total project usage remains subject to Firebase limits.
- Concurrent edits are not silently overwritten. A conflict offers the latest
  version or **Save edits as new note**. Save errors retain the open draft.
- Drafts live only in memory. Leaving, closing, or reloading without saving can
  lose them; the editor warns before leaving with unsaved changes. This is not an
  offline notes app and does not enable persistent Firestore caching.
- Notes are restricted by account permissions; this is not end-to-end encryption.
  Project administrators can access stored data. Avoid storing passwords or
  other secrets in this portfolio app.
- Deleting a note is permanent in this UI. There is no trash, collaboration,
  account-deletion screen, automatic background saving, or file-note storage.
- Firestore Spark currently includes limited storage, reads, writes, deletes,
  and transfer. A transaction reads before writing; listing/refreshing consumes
  reads. Signing up many accounts does not create additional per-project quota.
  Monitor **Firestore → Usage** and Authentication usage in your project.

Official references: [Firebase email/password](https://firebase.google.com/docs/auth/web/password-auth),
[session persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence),
[Firestore security rules](https://firebase.google.com/docs/firestore/security/rules-conditions),
[Firestore quotas](https://firebase.google.com/docs/firestore/quotas),
[Tiptap React editor](https://tiptap.dev/docs/editor/getting-started/install/react).

## Developer checks

```sh
npm run check
```

For an isolated Auth/Firestore emulator run, stop your normal notes emulators
first with Ctrl+C (which exports their data), then:

```sh
npm run test:notes
```

This launches fresh demo emulators, tests owner-only database rules and desktop /
mobile browser flows, and shuts down its own services. Tests create and remove
only their own sample accounts/notes; they do not reset your imported local data.
The browser suite uses demo sharing to isolate notes tests from Supabase. Retest
the real public Supabase sharing path during step 7.
