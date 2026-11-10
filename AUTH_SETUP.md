# Google, Apple, email/password, and password reset — manual setup

The implementation is local until you publish it. The assistant has not enabled
cloud providers, bought an Apple membership, or deployed the website or rules.
Temporary Send/Receive still works without signing in.

## Email and password

1. Select **TextBridge (`textbridge-8c8a4`) → Authentication → Sign-in method**
   in Firebase. Enable **Email/Password**. Email-link/passwordless login is not
   needed. Email verification is not required by this app.
2. Under **Templates**, review **Password reset** and set your sender display
   name. Test it with an inbox you can open, including its spam folder. Keep the
   Firebase-hosted action handler unless you deliberately build a custom one.
3. Under **Settings → Authorized domains**, allow `textbridge-8c8a4.web.app`
   and the configured Firebase Auth domain, plus any custom hostname you own.
4. Enter a valid-format email and a password meeting the displayed requirements.
   Creating the account logs the person in immediately, with access to Saved
   notes. No verification email, confirmation link, or email-verification screen
   is sent or shown. Existing unverified email accounts can also log in normally.
5. To reset a password: **Log in → Forgot password? → enter email → Send reset
   link**. Open the message, set a new password in Firebase's action page, then
   return and log in. The reset screen uses a neutral confirmation message.

A placeholder email is allowed if Firebase accepts its format. The app does not
check that the inbox exists or belongs to the user. Password-reset emails can
only help when the person can access that inbox. Notes remain private to the
Firebase account UID; knowing an email alone does not provide note access.

## Google

1. In Firebase Authentication, enable **Google** as a sign-in provider.
2. Select a project support email and save. Review the project's OAuth consent
   configuration if Google requests it. No Google client secret goes in React.
3. Publish the new website and notes rules, then click **Continue with Google**.
   Choose your account in the popup. If blocked, allow popups for TextBridge and
   retry. The app asks for account selection, useful on shared computers.
4. Verify that saving, signing out, and signing back in opens the same library.
   The authenticated Google account owns its own Saved library.

## Apple — separate Apple configuration required

The Apple button uses Firebase's real Apple OAuth flow. It cannot become usable
just by adding a button. Follow [Firebase's Apple web guide](https://firebase.google.com/docs/auth/web/apple)
and [Apple's web configuration guide](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/).
Apple requires an appropriate Apple Developer setup; enrollment may have a fee.
If you do not have it, use Google/email until you choose to configure Apple.

1. In Apple Developer **Certificates, Identifiers & Profiles**, configure a
   primary App ID with **Sign in with Apple**, then a **Services ID** for the web.
   Associate the website with that App ID as Apple's guide requires.
2. Use the Firebase Auth domain shown in your actual Firebase Apple provider
   configuration as the domain for Apple's web authentication. Register the exact
   return URL from Firebase, usually:
   `https://textbridge-8c8a4.firebaseapp.com/__/auth/handler`.
   If you changed the Auth domain, use that actual hostname instead.
3. Create an Apple Sign in with Apple private key. Record the Services ID,
   Apple Team ID, Key ID, and private key **in Firebase Authentication's Apple
   provider configuration only**. Never put the private key into `VITE_*`, source
   files, Git, this chat, or the public website. Enable Apple and save.
4. Configure Apple's private email relay for the Firebase sender if you need
   Firebase emails delivered to Apple's hidden-email addresses. See the official
   Firebase Apple guide for the required sender registration.
5. Test **Continue with Apple** on the public HTTPS website, including Hide My
   Email and a second login. A Firebase-authenticated Apple identity can access
   private notes without requiring a separate verification email for its relay.

## Account identity and privacy

Notes belong to Firebase UID, not an email string. Use your original sign-in
method to return to the same library. Account linking/merging is not implemented;
Apple hidden email can create a separate account from Google/email. Conflicts
show a message asking for the original sign-in method, never auto-merge notes.
The app requests identity only; it does not request Gmail or Apple mailbox access.
There is no SMS sign-in. Log out on school/shared computers.

The app uses a popup instead of redirecting away from an unsaved text draft.
Firebase manages provider tokens. Session login is retained only for the browser
session. No OAuth access tokens or private notes are written to localStorage.

## Rules and publishing

Follow [NOTE_LIMIT_SETUP.md](NOTE_LIMIT_SETUP.md) first if notes already exist,
then [SAVED_NOTES_SETUP.md](SAVED_NOTES_SETUP.md) for Firestore and Hosting commands.
The rules accept password, Google, or Apple-authenticated owners without an email-verification requirement;
all note creation/deletion requires the atomic 20-slot registry. Deploying only
Hosting is insufficient. Supabase guest sharing configuration remains unchanged.

## Local testing

Run `npm run notes:emulators` and use sample accounts. Password-reset
links appear in the emulator terminal; no real mail is delivered. Google's and
Apple's emulated popup identities are test identities, not real provider logins.
Automated tests use only the `demo-textbridge` emulators. Production password-reset email delivery,
Google consent, Apple credentials/relay, and real Safari/iOS popup behavior must
be checked by the owner after provider setup. Emulator success cannot verify
those external account settings.

References: [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin),
[password reset](https://firebase.google.com/docs/auth/web/manage-users),
[Apple sign-in](https://firebase.google.com/docs/auth/web/apple).

The Google button uses Google’s official colour artwork from its [sign-in asset bundle](https://developers.google.com/static/identity/images/signin-assets.zip), Android + Web / Light / Square icon at 4×. The local asset is `public/icons/google.png`; it is served from this website.
