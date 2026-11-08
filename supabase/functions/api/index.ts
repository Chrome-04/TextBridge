import { createHandler } from './handler.ts'
import { firebaseClientVerifier } from './firebase-client.ts'

let keys: Record<string, string> = {}
try {
  keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
} catch {
  /* unavailable */
}
Deno.serve(
  createHandler({
    url: Deno.env.get('SUPABASE_URL') || '',
    key:
      Deno.env.get('SUPABASE_SECRET_KEY') ||
      keys.default ||
      Object.values(keys)[0] ||
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
      '',
    salt: Deno.env.get('TEXTBRIDGE_RATE_SALT') || '',
    local: Deno.env.get('TEXTBRIDGE_MODE') === 'local',
    liveEnabled: Deno.env.get('TEXTBRIDGE_LIVE_ENABLED') === 'true',
    origin: Deno.env.get('TEXTBRIDGE_ORIGIN'),
    verifyClient: firebaseClientVerifier({
      projectId: Deno.env.get('TEXTBRIDGE_FIREBASE_PROJECT_ID') || '',
      projectNumber: Deno.env.get('TEXTBRIDGE_FIREBASE_PROJECT_NUMBER') || '',
      appId: Deno.env.get('TEXTBRIDGE_FIREBASE_APP_ID') || '',
    }),
    cleanupSecret: Deno.env.get('TEXTBRIDGE_CLEANUP_SECRET'),
  }),
)
