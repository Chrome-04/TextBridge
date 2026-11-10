import { initializeApp } from 'firebase/app'
import {
  initializeAuth,
  browserSessionPersistence,
  connectAuthEmulator,
} from 'firebase/auth'
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
} from 'firebase/app-check'

export const notesAreLocal = import.meta.env.VITE_SHARE_STAGE !== 'live'
let session: ReturnType<typeof initialize> | undefined

function initialize() {
  const config = notesAreLocal
    ? {
        apiKey: 'demo-textbridge-key',
        authDomain: 'demo-textbridge.firebaseapp.com',
        projectId: 'demo-textbridge',
        appId: 'demo-textbridge-web',
      }
    : {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      }
  if (Object.values(config).some((value) => !value))
    throw new Error('Firebase connection is not configured.')
  const app = initializeApp(config, 'textbridge-public')
  // School/shared computers should not retain an account after its tab closes.
  const auth = initializeAuth(app, { persistence: browserSessionPersistence })
  if (notesAreLocal)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    })
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY
  const appCheck =
    !notesAreLocal && siteKey
      ? initializeAppCheck(app, {
          provider:
            import.meta.env.VITE_FIREBASE_APPCHECK_PROVIDER === 'v3'
              ? new ReCaptchaV3Provider(siteKey)
              : new ReCaptchaEnterpriseProvider(siteKey),
          isTokenAutoRefreshEnabled: true,
        })
      : undefined
  return { app, auth, appCheck }
}

export function firebaseSession() {
  session ||= initialize()
  return session
}

// Guest token requests and account changes must never overwrite each other.
let authOperation: Promise<unknown> = Promise.resolve()
export function withAuthOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = authOperation.catch(() => {}).then(operation)
  authOperation = next
  return next
}
