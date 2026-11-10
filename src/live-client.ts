import { signInAnonymously } from 'firebase/auth'
import { getToken } from 'firebase/app-check'
import { firebaseSession, withAuthOperation } from './firebase-session'
export async function liveHeaders(): Promise<Record<string, string>> {
  const session = firebaseSession()
  if (!session.appCheck) throw new Error('Public connection not configured')
  await session.auth.authStateReady()
  const user = await withAuthOperation(
    async () =>
      session.auth.currentUser || (await signInAnonymously(session.auth)).user,
  )
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
