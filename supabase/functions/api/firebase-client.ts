import {
  createRemoteJWKSet,
  importX509,
  jwtVerify,
  type JWTVerifyGetKey,
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
      return `firebase:${sub}`
    } catch {
      return null
    }
  }
}
