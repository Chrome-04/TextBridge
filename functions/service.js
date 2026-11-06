import { randomBytes, randomUUID, createHmac } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const MAX_TEXT_BYTES = 20 * 1024 * 1024
export const MAX_FILE_BYTES = 20_000_000
export const secureCode = () =>
  Array.from(randomBytes(6), (b) => ALPHABET[b % 32]).join('')
export const validCode = (code) =>
  typeof code === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(code)
export const normalizeCode = (code) =>
  typeof code === 'string' ? code.toUpperCase().replace(/[\s-]/g, '') : ''
export class ApiError extends Error {
  constructor(status, kind) {
    super(kind)
    this.status = status
    this.kind = kind
  }
}
export function validateContent(body, kind, duration, name = '') {
  if (
    !Buffer.isBuffer(body) ||
    !['text', 'file'].includes(kind) ||
    !['10 minutes', '30 minutes'].includes(duration)
  )
    throw new ApiError(400, 'invalid')
  if (kind === 'file') {
    if (
      body.length >= MAX_FILE_BYTES ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 240
    )
      throw new ApiError(400, 'invalid')
    return name.replace(/[\/\\\x00-\x1f\x7f]/g, '_')
  }
  if (body.length > MAX_TEXT_BYTES) throw new ApiError(413, 'invalid')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    throw new ApiError(400, 'invalid')
  }
  if (!text.trim()) throw new ApiError(400, 'invalid')
  let words = 0
  for (const _ of text.matchAll(/\S+/gu))
    if (++words > 100_000) throw new ApiError(400, 'invalid')
  return ''
}

export function createShareService({
  db,
  bucket,
  now = Date.now,
  generateCode = secureCode,
  salt,
}) {
  // Atomic server counters. Hashed addresses and counters never enter public responses.
  async function limit(client, action, bytes = 0) {
    const minute = Math.floor(now() / 60_000)
    const hash = createHmac('sha256', salt).update(client).digest('hex')
    const refs = [
      db.doc(`rateLimits/${action}-${minute}-${hash}`),
      db.doc(`rateLimits/${action}-${minute}-global`),
    ]
    await db.runTransaction(async (tx) => {
      const snapshots = await tx.getAll(...refs)
      const max = action === 'create' ? [5, 100] : [20, 400]
      const byteMax = [100 * 1024 * 1024, 400 * 1024 * 1024]
      for (let i = 0; i < refs.length; i++) {
        const old = snapshots[i].data() ?? { count: 0, bytes: 0 }
        if (old.count >= max[i] || old.bytes + bytes > byteMax[i])
          throw new ApiError(429, 'rate-limited')
        tx.set(refs[i], {
          count: old.count + 1,
          bytes: old.bytes + bytes,
          expiresAt: Timestamp.fromMillis((minute + 2) * 60_000),
        })
      }
    })
  }
  function metadata(code, data) {
    return {
      code,
      text: '',
      duration: data.duration,
      expiresAt: data.expiresAt.toMillis(),
      ...(data.kind === 'file'
        ? {
            file: {
              name: data.name,
              size: data.size,
              type: 'application/octet-stream',
            },
          }
        : {}),
    }
  }
  async function create({ body, kind, duration, name, client }) {
    const filename = validateContent(body, kind, duration, name)
    await limit(client, 'create', body.length)
    const generation = randomUUID()
    const path = `payloads/${generation}`
    let reserved
    for (let attempt = 0; attempt < 20 && !reserved; attempt++) {
      const code = generateCode()
      if (!validCode(code)) continue
      const ref = db.doc(`shares/${code}`)
      const data = {
        generation,
        path,
        kind,
        name: filename,
        size: body.length,
        duration,
        state: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(
          now() + (duration === '10 minutes' ? 600_000 : 1_800_000),
        ),
      }
      const won = await db.runTransaction(async (tx) => {
        const old = await tx.get(ref)
        if (old.exists && old.data().expiresAt.toMillis() > now()) return false
        if (old.exists)
          tx.set(db.doc(`garbage/${old.data().generation}`), {
            path: old.data().path,
          })
        tx.set(ref, data)
        return true
      })
      if (won) reserved = { code, ref, data }
    }
    if (!reserved) throw new ApiError(503, 'unavailable')
    try {
      await bucket.file(path).save(body, {
        resumable: false,
        metadata: {
          contentType: 'application/octet-stream',
          cacheControl: 'no-store',
        },
      })
      await db.runTransaction(async (tx) => {
        const current = await tx.get(reserved.ref)
        if (
          current.data()?.generation !== generation ||
          current.data().expiresAt.toMillis() <= now()
        )
          throw new ApiError(503, 'unavailable')
        tx.update(reserved.ref, { state: 'ready' })
      })
      return metadata(reserved.code, reserved.data)
    } catch (error) {
      // Keep a failed reservation for the cleanup worker; never expose its code.
      await db
        .doc(`garbage/${generation}`)
        .set({ path })
        .catch(() => {})
      throw error
    }
  }
  async function retrieve(input, client) {
    // Count malformed guesses too. No code appears in a request URL.
    await limit(client, 'receive')
    const code = normalizeCode(input)
    if (!validCode(code)) throw new ApiError(400, 'invalid')
    const snapshot = await db.doc(`shares/${code}`).get()
    const data = snapshot.data()
    if (!data || data.state !== 'ready' || data.expiresAt.toMillis() <= now())
      throw new ApiError(404, 'not-found')
    // Separate byte counter keeps repeated large downloads bounded.
    await limit(client, 'download', data.size)
    const [body] = await bucket.file(data.path).download()
    if (data.expiresAt.toMillis() <= now()) throw new ApiError(404, 'not-found')
    if (body.length !== data.size) throw new ApiError(503, 'unavailable')
    return { metadata: metadata(code, data), body, kind: data.kind }
  }
  async function cleanup() {
    const expired = await db
      .collection('shares')
      .where('expiresAt', '<=', Timestamp.fromMillis(now()))
      .limit(100)
      .get()
    for (const old of expired.docs) {
      const data = old.data()
      await bucket.file(data.path).delete({ ignoreNotFound: true })
      await db.runTransaction(async (tx) => {
        const current = await tx.get(old.ref)
        if (current.data()?.generation === data.generation) tx.delete(old.ref)
      })
    }
    const garbage = await db.collection('garbage').limit(100).get()
    for (const item of garbage.docs) {
      await bucket.file(item.data().path).delete({ ignoreNotFound: true })
      await item.ref.delete()
    }
    const counters = await db
      .collection('rateLimits')
      .where('expiresAt', '<=', Timestamp.fromMillis(now()))
      .limit(500)
      .get()
    if (!counters.empty) {
      const batch = db.batch()
      counters.docs.forEach((doc) => batch.delete(doc.ref))
      await batch.commit()
    }
    return {
      shares: expired.size,
      garbage: garbage.size,
      counters: counters.size,
    }
  }
  return { create, retrieve, cleanup }
}
