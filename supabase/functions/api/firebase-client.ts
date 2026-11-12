import {
  createRemoteJWKSet,
  importX509,
  jwtVerify,
  type JWTVerifyGetKey,
  decodeJwt,
} from 'jose'

const certificateURL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
const appCheckKeys = createRemoteJWKSet(
  new URL('https://firebaseappcheck.googleapis.com/v1/jwks'),
  { cacheMaxAge: 6 * 60 * 60 * 1000 },
)
let certificates: Record<string, string> = {}
let expires = 0
let loading: Promise<void> | undefined
async function loadCertificates() {
  if (Date.now() < expires) return
  loading ||= (async () => {
    const result = await fetch(certificateURL, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!result.ok) throw new Error('Verification unavailable')
    certificates = await result.json()
    const age = Number(
      result.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 300,
    )
    expires = Date.now() + Math.min(age, 21_600) * 1000
  })().finally(() => {
    loading = undefined
  })
  await loading
}
const authKeys: JWTVerifyGetKey = async (header) => {
  if (!header.kid || header.alg !== 'RS256') throw new Error('Invalid token')
  await loadCertificates()
  const certificate = certificates[header.kid]
  if (!certificate) throw new Error('Invalid token')
  return importX509(certificate, 'RS256')
}

// The browser never supplies a trusted IP address. Signed Firebase guest IDs
// identify rate-limit sessions; App Check attests the configured Firebase app.
export function firebaseClientVerifier(
  config: { projectId: string; projectNumber: string; appId: string },
  keys: { auth: JWTVerifyGetKey; appCheck: JWTVerifyGetKey } = {
    auth: authKeys,
    appCheck: appCheckKeys,
  },
  registeredOnly = false,
) {
  return async (request: Request): Promise<string | null> => {
    try {
      if (
        !config.projectId ||
        !/^\d+$/.test(config.projectNumber) ||
        !config.appId.startsWith(`1:${config.projectNumber}:web:`)
      )
        return null
      const authorization = request.headers.get('authorization') || ''
      const attestation = request.headers.get('X-Firebase-AppCheck') || ''
      if (
        !authorization.startsWith('Bearer ') ||
        authorization.length > 8192 ||
        !attestation ||
        attestation.length > 8192
      )
        return null
      const [auth, check] = await Promise.all([
        jwtVerify(authorization.slice(7), keys.auth, {
          algorithms: ['RS256'],
          issuer: `https://securetoken.google.com/${config.projectId}`,
          audience: config.projectId,
          requiredClaims: ['exp', 'iat', 'auth_time', 'sub'],
        }),
        jwtVerify(attestation, keys.appCheck, {
          algorithms: ['RS256'],
          typ: 'JWT',
          issuer: `https://firebaseappcheck.googleapis.com/${config.projectNumber}`,
          audience: `projects/${config.projectNumber}`,
          subject: config.appId,
          requiredClaims: ['exp', 'iat', 'sub'],
        }),
      ])
      const now = Date.now() / 1000
      const { sub, iat, auth_time } = auth.payload
      if (
        !sub ||
        sub.length > 128 ||
        typeof iat !== 'number' ||
        iat > now ||
        typeof auth_time !== 'number' ||
        auth_time > now ||
        typeof check.payload.iat !== 'number' ||
        check.payload.iat > now
      )
        return null
      const provider = (
        auth.payload.firebase as { sign_in_provider?: string } | undefined
      )?.sign_in_provider
      if (
        registeredOnly &&
        !['password', 'google.com', 'apple.com'].includes(provider || '')
      )
        return null
      return `firebase:${sub}`
    } catch {
      return null
    }
  }
}

// The unsigned demo tokens are accepted only after an emulator lookup, and this
// verifier is installed only for the loopback-only local handler.
export async function localFirebaseAccountVerifier(
  request: Request,
): Promise<string | null> {
  try {
    const token =
      request.headers.get('authorization')?.replace(/^Bearer /, '') || ''
    if (!token || token.length > 8192) return null
    const payload = decodeJwt(token)
    const provider = (
      payload.firebase as { sign_in_provider?: string } | undefined
    )?.sign_in_provider
    if (
      payload.aud !== 'demo-textbridge' ||
      payload.iss !== 'https://securetoken.google.com/demo-textbridge' ||
      !payload.sub ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Date.now() / 1000 ||
      !['password', 'google.com', 'apple.com'].includes(provider || '')
    )
      return null
    const response = await fetch(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!response.ok) return null
    const data = await response.json()
    return data.users?.some(
      (user: { localId: string; disabled?: boolean }) =>
        user.localId === payload.sub && !user.disabled,
    )
      ? `firebase:${payload.sub}`
      : null
  } catch {
    return null
  }
}
