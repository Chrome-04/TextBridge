import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, secureCode } from '../supabase/functions/api/handler.ts'

// These are HTTP contract tests with a fake upstream, not database integration tests.
function fixture(options: Record<string, unknown> = {}) {
  let record: Record<string, unknown> | null = null
  let payload = new Uint8Array()
  const calls: { name: string; input: Record<string, unknown> }[] = []
  let allow = true
  let expireAfterDownload = false
  let collisions = 0
  const comments: Record<string, unknown>[] = []
  const upstream: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('apikey'), 'test-backend-key')
    assert.equal(headers.has('authorization'), false)
    if (path.includes('/rpc/')) {
      const name = path.split('/').at(-1)!
      const input = JSON.parse(String(init?.body))
      calls.push({ name, input })
      if (name === 'tb_limit') return Response.json(allow)
      if (name === 'tb_reserve') {
        if (collisions-- > 0) return Response.json(null)
        record = {
          code: input.p_code,
          generation: input.p_generation,
          kind: input.p_kind,
          name: input.p_name,
          size: input.p_size,
          duration: input.p_duration,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        }
        return Response.json(record)
      }
      if (name === 'tb_ready') return Response.json(true)
      if (name === 'tb_lookup') return Response.json(record)
      if (name === 'tb_comment') {
        const comment = {
          id: crypto.randomUUID(),
          nickname: input.p_nickname,
          comment: input.p_comment,
          createdAt: Date.now(),
        }
        comments.push(comment)
        return Response.json(comment)
      }
      if (name === 'tb_comments') return Response.json(comments)
      throw new Error('Unexpected RPC')
    }
    assert.match(
      path,
      /^\/storage\/v1\/object\/textbridge\/payloads\/[a-f0-9-]{36}$/,
    )
    if (init?.method === 'POST') {
      assert.equal(headers.get('content-type'), 'application/octet-stream')
      payload = new Uint8Array(await new Response(init.body).arrayBuffer())
      return Response.json({})
    }
    if (expireAfterDownload) record = null
    return new Response(payload)
  }
  const handler = createHandler({
    url: 'http://127.0.0.1:54321',
    key: 'test-backend-key',
    salt: 'test-rate-salt',
    local: true,
    fetch: upstream,
    ...options,
  })
  const request = (
    path: string,
    body: string | Uint8Array = '{}',
    headers: Record<string, string> = {},
  ) =>
    handler(
      new Request(`http://127.0.0.1:54321/functions/v1/api${path}`, {
        method: 'POST',
        body: typeof body === 'string' ? body : new Uint8Array(body).buffer,
        headers,
      }),
    )
  const share = (text = 'hello world', kind = 'text', name = '') =>
    request('/shares', text, {
      'X-Share-Kind': kind,
      'X-Share-Duration': '10 minutes',
      'X-Share-Name': encodeURIComponent(name),
    })
  return {
    handler,
    request,
    share,
    calls,
    deny: () => {
      allow = false
    },
    expire: () => {
      expireAfterDownload = true
    },
    collide: () => {
      collisions = 2
    },
  }
}

test('Supabase: secure codes use the six-character product alphabet', () => {
  for (let i = 0; i < 100; i++)
    assert.match(secureCode(), /^[A-HJ-NP-Z2-9]{6}$/)
})
test('Supabase: text round trip preserves whitespace and sends no-store metadata', async () => {
  const f = fixture()
  const text = '  hello\n世界 <script>alert(1)</script>  '
  const created = await f.share(text)
  assert.equal(created.status, 201)
  const note = await created.json()
  const received = await f.request(
    '/retrieve',
    JSON.stringify({ code: note.code.toLowerCase().split('').join('-') }),
  )
  assert.equal(received.status, 200)
  assert.equal(await received.text(), text)
  assert.match(received.headers.get('cache-control')!, /no-store/)
  const metadata = JSON.parse(atob(received.headers.get('X-Share-Metadata')!))
  assert.equal(metadata.code, note.code)
  assert.equal('generation' in metadata, false)
  assert.equal('key' in metadata, false)
})
test('Supabase: file round trip downloads bytes with sanitized Unicode filename', async () => {
  const f = fixture()
  const created = await f.share('PDF test data', 'file', '日本/notes.pdf')
  const note = await created.json()
  assert.equal(note.file.name, '日本_notes.pdf')
  const result = await f.request(
    '/retrieve',
    JSON.stringify({ code: note.code }),
  )
  assert.equal(result.headers.get('Content-Disposition'), 'attachment')
  assert.equal(result.headers.get('Content-Type'), 'application/octet-stream')
  assert.equal(await result.text(), 'PDF test data')
})
test('Supabase: retries atomic reservations after collisions', async () => {
  const f = fixture()
  f.collide()
  assert.equal((await f.share()).status, 201)
  assert.equal(f.calls.filter((c) => c.name === 'tb_reserve').length, 3)
})
test('Supabase: rechecks expiry after downloading payload', async () => {
  const f = fixture()
  const note = await (await f.share()).json()
  f.expire()
  const result = await f.request(
    '/retrieve',
    JSON.stringify({ code: note.code }),
  )
  assert.equal(result.status, 404)
  assert.deepEqual(await result.json(), { error: 'not-found' })
})
test('Supabase: rejects invalid text, duration, oversized files, and too many words', async () => {
  const f = fixture()
  assert.equal((await f.share(' \n ')).status, 400)
  assert.equal((await f.share('word '.repeat(100_001))).status, 400)
  assert.equal(
    (
      await f.request('/shares', 'text', {
        'X-Share-Kind': 'text',
        'X-Share-Duration': '24 hours',
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await f.request('/shares', new Uint8Array(20_000_000), {
        'X-Share-Kind': 'file',
        'X-Share-Duration': '10 minutes',
        'X-Share-Name': 'test.pdf',
      })
    ).status,
    400,
  )
  assert.equal(
    f.calls.some((c) => c.name === 'tb_reserve'),
    false,
  )
})
test('Supabase: comments validate, trim, and list public fields', async () => {
  const f = fixture()
  assert.equal(
    (
      await f.request(
        '/comments',
        JSON.stringify({ nickname: 'a', comment: 'b', email: 'ignored' }),
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await f.request(
        '/comments',
        JSON.stringify({ nickname: 'a'.repeat(41), comment: 'b' }),
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await f.request(
        '/comments',
        JSON.stringify({ nickname: 'a', comment: 'b'.repeat(1001) }),
      )
    ).status,
    400,
  )
  const result = await f.request(
    '/comments',
    JSON.stringify({ nickname: ' Guest ', comment: ' <b>plain text</b> ' }),
  )
  assert.equal(result.status, 201)
  const saved = await result.json()
  assert.equal(saved.nickname, 'Guest')
  assert.equal(saved.comment, '<b>plain text</b>')
  const list = await f.request('/comments/list')
  assert.deepEqual((await list.json()).comments, [saved])
})
test('Supabase: rate rejection happens before storage access', async () => {
  const f = fixture()
  f.deny()
  const result = await f.share()
  assert.equal(result.status, 429)
  assert.equal(result.headers.get('Retry-After'), '60')
  assert.equal(f.calls.length, 1)
  assert.match(String(f.calls[0].input.p_client), /^[a-f0-9]{64}$/)
})
test('Supabase: live remains disabled and local mode rejects a cloud URL', async () => {
  for (const options of [
    { local: false },
    { url: 'https://example.supabase.co', local: true },
  ]) {
    const f = fixture(options)
    assert.equal((await f.share()).status, 503)
    assert.equal(f.calls.length, 0)
  }
})
test('Supabase: live requires matching proxy and origin', async () => {
  const f = fixture({
    local: false,
    liveEnabled: true,
    proxySecret: 'test-proxy',
    origin: 'https://example.com',
  })
  assert.equal((await f.share()).status, 403)
  assert.equal(f.calls.length, 0)
})
test('Supabase: unexpected origins and unauthenticated cleanup are denied', async () => {
  const f = fixture()
  assert.equal(
    (
      await f.request('/comments/list', '{}', {
        origin: 'https://other.example',
      })
    ).status,
    403,
  )
  assert.equal((await f.request('/cleanup')).status, 403)
  assert.equal(f.calls.length, 0)
})
test('Supabase: upstream failures return a generic response', async () => {
  const f = fixture({
    fetch: async () => {
      throw new Error('internal sensitive detail')
    },
  })
  const result = await f.share()
  assert.equal(result.status, 503)
  assert.deepEqual(await result.json(), { error: 'unavailable' })
})
