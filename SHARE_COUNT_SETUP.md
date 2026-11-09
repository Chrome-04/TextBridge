# Publish the share counter manually

The small counter sits below the sharing box, above the privacy message. It
counts each successful text or file creation once, including shares that later
expire. Reads, refreshes, failed uploads, and cleanup do not increase it.

Tracking starts when the migration is installed. There is no historical backfill:
previous payloads may already be deleted. The displayed start date makes this
clear. The database stores only a total and start time, not visitor details or
additional copies of content. Local test counts are separate from cloud counts.

The counter loads with the page and after successful sends. Refresh updates it
manually; there is no background polling. Requests use the existing Firebase
guest and App Check verification and a separate rate allowance. A counter outage
shows “Share count unavailable” and does not stop sharing.

## Update the existing public deployment

Run these yourself in the TextBridge Sharing Prototype folder, in order. This
update does not require new projects, new keys, a billing change, or a new cleanup
schedule. Keep your existing private environment settings.

1. Preview the database migration. Expect only
   `202611090003_share_count.sql` if your previous migrations are installed.

   ```sh
   ./node_modules/.bin/supabase db push --project-ref ucxmnospkhnoetxixzqg --dry-run --skip-vault
   ```

2. Apply it. Do not reset the database or modify previously applied migrations.

   ```sh
   ./node_modules/.bin/supabase db push --project-ref ucxmnospkhnoetxixzqg --skip-vault
   ```

3. Deploy the updated API. This preserves Firebase verification inside the handler;
   the flag disables only the Supabase gateway's different JWT check.

   ```sh
   ./node_modules/.bin/supabase functions deploy api --project-ref ucxmnospkhnoetxixzqg --no-verify-jwt --use-api
   ```

4. Build and publish the frontend.

   ```sh
   npm run build:public
   ./node_modules/.bin/firebase deploy --only hosting --config firebase.hosting.json --project textbridge-8c8a4
   ```

5. Open the public website on two devices. Send one harmless text and one small
   file, then refresh the counter on the other device. Each new share adds one.
   Receiving again and refreshing the counter must not increase the total. The
   total remains after the shares expire and cleanup runs.

The migration must precede the API release. If you published the frontend first,
the counter can be unavailable until the backend update is complete. Existing
sharing still works. Git push and cloud publication remain separate actions.

## Local checks

With local Supabase running and the new migration installed locally:

```sh
npm run check
npm run test:share-count
```

The database counter test uses loopback only and rolls back its synthetic records
and counter changes. It checks pending uploads, repeated readiness calls, file
shares, reused codes, expiry, cleanup, exact large totals, permissions, and
separate rate limits. Browser QA should use synthetic data and avoid posting
persistent test comments.
