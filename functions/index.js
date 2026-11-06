import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { getAppCheck } from 'firebase-admin/app-check'
import { onRequest } from 'firebase-functions/v2/https'
import { createShareService, ApiError, MAX_TEXT_BYTES } from './service.js'

const emulator = process.env.FUNCTIONS_EMULATOR === 'true'
const projectId = process.env.GCLOUD_PROJECT
const app = initializeApp({
  projectId,
  storageBucket: emulator
    ? `${projectId}.appspot.com`
    : process.env.TEXTBRIDGE_STORAGE_BUCKET,
})
let service
function getService() {
  if (
    emulator &&
    (!process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
      !projectId?.startsWith('demo-'))
  )
    throw new ApiError(503, 'unavailable')
  if (
    !emulator &&
    (!process.env.TEXTBRIDGE_RATE_SALT ||
      !process.env.TEXTBRIDGE_STORAGE_BUCKET)
  )
    throw new ApiError(503, 'unavailable')
  return (service ??= createShareService({
    db: getFirestore(app),
    bucket: getStorage(app).bucket(),
    salt: emulator ? 'local-emulator-only' : process.env.TEXTBRIDGE_RATE_SALT,
  }))
}
export const api = onRequest(
  {
    region: 'us-central1',
    maxInstances: 2,
    concurrency: 4,
    memory: '1GiB',
    timeoutSeconds: 60,
    cors: false,
  },
  async (req, res) => {
    res.set({
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    })
    try {
      // Live access stays disabled until the deployment-specific App Check client,
      // origin allowlist, secret binding, and billing limits have been reviewed.
      if (!emulator) {
        if (process.env.TEXTBRIDGE_LIVE_ENABLED !== 'true')
          throw new ApiError(503, 'unavailable')
        const allowedOrigin = process.env.TEXTBRIDGE_ORIGIN
        if (!allowedOrigin || req.get('origin') !== allowedOrigin)
          throw new ApiError(403, 'forbidden')
        const token = req.get('X-Firebase-AppCheck')
        if (!token) throw new ApiError(403, 'forbidden')
        try {
          await getAppCheck(app).verifyToken(token)
        } catch {
          throw new ApiError(403, 'forbidden')
        }
      }
      const store = getService()
      if (req.path === '/health' && req.method === 'GET') {
        res.json({ mode: emulator ? 'emulator' : 'live' })
        return
      }
      if (req.method !== 'POST') throw new ApiError(405, 'invalid')
      // Local requests share loopback limits; forwarded headers cannot bypass them.
      // Review the production proxy/IP trust contract before enabling live traffic.
      const client = emulator
        ? req.socket.remoteAddress || 'local'
        : req.ip || 'unknown'
      if (req.path === '/shares') {
        if (
          Number(req.get('content-length')) > MAX_TEXT_BYTES ||
          req.rawBody?.length > MAX_TEXT_BYTES
        )
          throw new ApiError(413, 'invalid')
        let name = ''
        try {
          name = decodeURIComponent(req.get('x-share-name') || '')
        } catch {
          throw new ApiError(400, 'invalid')
        }
        const result = await store.create({
          body: req.rawBody,
          kind: req.get('x-share-kind'),
          duration: req.get('x-share-duration'),
          name,
          client,
        })
        res.status(201).json(result)
        return
      }
      if (req.path === '/retrieve') {
        if (!req.rawBody || req.rawBody.length > 256)
          throw new ApiError(400, 'invalid')
        let input
        try {
          input = JSON.parse(req.rawBody.toString('utf8'))
        } catch {
          throw new ApiError(400, 'invalid')
        }
        const result = await store.retrieve(input?.code, client)
        res.set({
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment',
          'X-Share-Metadata': Buffer.from(
            JSON.stringify(result.metadata),
          ).toString('base64'),
          'X-Share-Kind': result.kind,
        })
        res.send(result.body)
        return
      }
      throw new ApiError(404, 'not-found')
    } catch (error) {
      // Never log request bodies, filenames, sharing codes, or database errors.
      const status = error instanceof ApiError ? error.status : 503
      if (status === 429) res.set('Retry-After', '60')
      res
        .status(status)
        .json({ error: error instanceof ApiError ? error.kind : 'unavailable' })
    }
  },
)
