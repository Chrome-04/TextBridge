import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  ReCaptchaEnterpriseProvider,
  getToken,
} from 'firebase/app-check'

let session: ReturnType<typeof initialize> | undefined
function initialize() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY
  if (Object.values(config).some((value) => !value) || !siteKey)
    throw new Error('Public connection not configured')
  const app = initializeApp(config, 'textbridge-public')
  const auth = getAuth(app)
  const appCheck = initializeAppCheck(app, {
    provider:
      import.meta.env.VITE_FIREBASE_APPCHECK_PROVIDER === 'v3'
        ? new ReCaptchaV3Provider(siteKey)
        : new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  })
  return { auth, appCheck }
}
let signingIn: Promise<void> | undefined
export async function liveHeaders(): Promise<Record<string, string>> {
  session ||= initialize()
  await session.auth.authStateReady()
  if (!session.auth.currentUser) {
    signingIn ||= signInAnonymously(session.auth)
      .then(() => {})
      .finally(() => {
        signingIn = undefined
      })
    await signingIn
  }
  const user = session.auth.currentUser
  if (!user) throw new Error('Guest session unavailable')
  const [identity, attestation] = await Promise.all([
    user.getIdToken(),
    getToken(session.appCheck),
  ])
  return {
    Authorization: `Bearer ${identity}`,
    'X-Firebase-AppCheck': attestation.token,
  }
}
