// Standard Web APIs let the same request handler run in Deno and Node tests.
export class ApiError extends Error {
  status: number
  kind: string
  constructor(status: number, kind: string) {
    super(kind)
    this.status = status
    this.kind = kind
  }
}
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const secureCode = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (b) => ALPHABET[b % 32],
  ).join('')
const validCode = (v: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(v)
const normalize = (v: unknown) =>
  typeof v === 'string' ? v.toUpperCase().replace(/[\s-]/g, '') : ''
type RecordData = {
  code: string
  generation: string
  kind: string
  name: string
  size: number
  duration: string
  expires_at: string
}
type Settings = {
  url: string
  key: string
  salt: string
  local: boolean
  liveEnabled?: boolean
  origin?: string
  verifyClient?: (request: Request) => Promise<string | null>
  cleanupSecret?: string
  generateCode?: () => string
  fetch?: typeof fetch
}

async function readBody(req: Request, max: number) {
  if (Number(req.headers.get('content-length')) > max)
    throw new ApiError(413, 'invalid')
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) {
        await reader.cancel()
        throw new ApiError(413, 'invalid')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return body
}
async function jsonBody(req: Request, max: number) {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await readBody(req, max),
      ),
    )
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(400, 'invalid')
  }
}
function metadata(data: RecordData) {
  return {
    code: data.code,
    text: '',
    duration: data.duration,
    expiresAt: Date.parse(data.expires_at),
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

export function createHandler(settings: Settings) {
  const request = settings.fetch || fetch
  const base = settings.url.replace(/\/$/, '')
  const adminHeaders = {
    apikey: settings.key,
    ...(settings.key.startsWith('eyJ')
      ? { Authorization: `Bearer ${settings.key}` }
      : {}),
  }
  const rpc = async <T>(name: string, input: object = {}): Promise<T> => {
    const response = await request(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new ApiError(503, 'unavailable')
    if (response.status === 204) return null as T
    return response.json()
  }
  const storage = async (path: string, init: RequestInit = {}) => {
    const response = await request(
      `${base}/storage/v1/object/textbridge${path}`,
      {
        ...init,
        headers: { ...adminHeaders, ...init.headers },
        cache: 'no-store',
        signal: AbortSignal.timeout(60_000),
      },
    )
    if (!response.ok) throw new ApiError(503, 'unavailable')
    return response
  }
  const limit = async (client: string, action: string, bytes = 0) => {
    if (
      !(await rpc('tb_limit', {
        p_client: client,
        p_action: action,
        p_bytes: bytes,
      }))
    )
      throw new ApiError(429, 'rate-limited')
  }
  const clientHash = async (address: string) => {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(settings.salt),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    return Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          'HMAC',
          key,
          new TextEncoder().encode(address),
        ),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
  }
  return async (req: Request) => {
    const headers = new Headers({
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    })
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers })
    try {
      if (!settings.key || !settings.salt)
        throw new ApiError(503, 'unavailable')
      // Local mode is never accepted for a hosted Supabase URL.
      const localHost = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(
        new URL(base).hostname,
      )
      if (settings.local && !localHost) throw new ApiError(503, 'unavailable')
      const origin = req.headers.get('origin')
      const path = new URL(req.url).pathname.replace(/^.*\/api(?=\/|$)/, '')
      if (!settings.local) {
        if (!settings.liveEnabled || !settings.verifyClient || !settings.origin)
          throw new ApiError(503, 'unavailable')
        const allowedOrigins = settings.origin
          .split(',')
          .map((value) => value.trim())
        if (
          path !== '/cleanup' &&
          (!origin || !allowedOrigins.includes(origin))
        )
          throw new ApiError(403, 'forbidden')
      }
      if (origin) {
        const host = new URL(origin).hostname
        if (
          settings.local &&
          !['localhost', '127.0.0.1', '[::1]'].includes(host) &&
          origin !== settings.origin
        )
          throw new ApiError(403, 'forbidden')
        headers.set('Access-Control-Allow-Origin', origin)
        headers.set('Vary', 'Origin')
        headers.set(
          'Access-Control-Expose-Headers',
          'X-Share-Metadata, Retry-After',
        )
      }
      if (req.method === 'OPTIONS') {
        headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        headers.set(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Firebase-AppCheck, X-Share-Kind, X-Share-Name, X-Share-Duration',
        )
        return new Response(null, { status: 204, headers })
      }
      if (path === '/health' && req.method === 'GET')
        return json({
          mode: settings.local ? 'supabase-local' : 'supabase-live',
        })
      if (req.method !== 'POST') throw new ApiError(405, 'invalid')
      if (path === '/cleanup') {
        if (
          !settings.cleanupSecret ||
          req.headers.get('X-TextBridge-Cleanup') !== settings.cleanupSecret
        )
          throw new ApiError(403, 'forbidden')
        const items = await rpc<string[]>('tb_cleanup_batch')
        for (const generation of items) {
          await storage('', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: [`payloads/${generation}`] }),
          })
          await rpc('tb_cleanup_done', { p_generation: generation })
        }
        return json({ removed: items.length })
      }
      // CORS is not authentication: verify both Firebase tokens for live calls.
      const identity = settings.local
        ? 'local'
        : await settings.verifyClient!(req)
      if (!identity) throw new ApiError(403, 'forbidden')
      const client = await clientHash(identity)
      if (path === '/shares') {
        await limit(client, 'create')
        const body = await readBody(req, 20 * 1024 * 1024)
        const kind = req.headers.get('X-Share-Kind')
        const duration = req.headers.get('X-Share-Duration')
        if (
          !['text', 'file'].includes(kind || '') ||
          !['5 minutes', '10 minutes'].includes(duration || '')
        )
          throw new ApiError(400, 'invalid')
        let name = ''
        if (kind === 'file') {
          try {
            name = decodeURIComponent(req.headers.get('X-Share-Name') || '')
          } catch {
            throw new ApiError(400, 'invalid')
          }
          if (!name.trim() || name.length > 240 || body.length >= 20_000_000)
            throw new ApiError(400, 'invalid')
          name = name.replace(/[\/\\\x00-\x1f\x7f]/g, '_')
        } else {
          let text: string
          try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(body)
          } catch {
            throw new ApiError(400, 'invalid')
          }
          if (!text.trim()) throw new ApiError(400, 'invalid')
          let words = 0
          for (const _ of text.matchAll(/\S+/gu))
            if (++words > 100_000) throw new ApiError(400, 'invalid')
        }
        await limit(client, 'upload', body.length)
        const generation = crypto.randomUUID()
        let record: RecordData | null = null
        for (let attempt = 0; attempt < 20 && !record; attempt++) {
          const code = (settings.generateCode || secureCode)()
          if (!validCode(code)) continue
          record = await rpc('tb_reserve', {
            p_code: code,
            p_generation: generation,
            p_kind: kind,
            p_name: name,
            p_size: body.length,
            p_duration: duration,
          })
        }
        if (!record) throw new ApiError(503, 'unavailable')
        await storage(`/payloads/${generation}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
          },
          body,
        })
        if (
          !(await rpc('tb_ready', {
            p_code: record.code,
            p_generation: generation,
          }))
        )
          throw new ApiError(503, 'unavailable')
        return json(metadata(record), 201)
      }
      if (path === '/retrieve') {
        await limit(client, 'receive')
        const input = await jsonBody(req, 256)
        const code = normalize(input?.code)
        if (!validCode(code)) throw new ApiError(400, 'invalid')
        const record = await rpc<RecordData | null>('tb_lookup', {
          p_code: code,
        })
        if (!record) throw new ApiError(404, 'not-found')
        await limit(client, 'download', record.size)
        const body = await (
          await storage(`/payloads/${record.generation}`)
        ).arrayBuffer()
        const current = await rpc<RecordData | null>('tb_lookup', {
          p_code: code,
        })
        if (!current || current.generation !== record.generation)
          throw new ApiError(404, 'not-found')
        if (body.byteLength !== record.size)
          throw new ApiError(503, 'unavailable')
        const encoded = new TextEncoder().encode(
          JSON.stringify(metadata(record)),
        )
        headers.set(
          'X-Share-Metadata',
          btoa(Array.from(encoded, (b) => String.fromCharCode(b)).join('')),
        )
        headers.set('Content-Type', 'application/octet-stream')
        headers.set('Content-Disposition', 'attachment')
        return new Response(body, { headers })
      }
      if (path === '/comments' || path === '/comments/list') {
        await limit(
          client,
          path === '/comments' ? 'comment-post' : 'comment-list',
        )
        const input = await jsonBody(req, 8192)
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new ApiError(400, 'invalid')
        if (path === '/comments/list') {
          if (Object.keys(input).length) throw new ApiError(400, 'invalid')
          return json({ comments: await rpc('tb_comments') })
        }
        if (
          Object.keys(input).some(
            (k) => !['nickname', 'comment'].includes(k),
          ) ||
          typeof input.nickname !== 'string' ||
          typeof input.comment !== 'string'
        )
          throw new ApiError(400, 'invalid')
        const nickname = input.nickname.trim()
        const comment = input.comment.trim()
        if (
          !nickname ||
          nickname.length > 40 ||
          /[\r\n\x00-\x1f\x7f]/u.test(nickname) ||
          !comment ||
          comment.length > 1000 ||
          /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(comment)
        )
          throw new ApiError(400, 'invalid')
        return json(
          await rpc('tb_comment', { p_nickname: nickname, p_comment: comment }),
          201,
        )
      }
      throw new ApiError(404, 'not-found')
    } catch (error) {
      // Never log request data, codes, contact details, secrets, or DB errors.
      if (error instanceof ApiError && error.status === 429)
        headers.set('Retry-After', '60')
      return json(
        { error: error instanceof ApiError ? error.kind : 'unavailable' },
        error instanceof ApiError ? error.status : 503,
      )
    }
  }
}
