import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { createHandler, secureCode } from '../supabase/functions/api/handler.ts'

// Opt-in, loopback-only tests. Never reset databases or import emulator data.
if (process.env.TEXTBRIDGE_SUPABASE_TEST !== '1')
  throw new Error('Use pnpm test:supabase.')
const vars = Object.fromEntries(
  (
    await readFile(
      new URL('../.supabase-local/status.env', import.meta.url),
      'utf8',
    )
  )
    .split('\n')
    .filter((s) => s.includes('='))
    .map((s) => {
      const i = s.indexOf('=')
      return [s.slice(0, i), s.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)
const base = vars.API_URL || 'http://127.0.0.1:54321'
const dbUrl = vars.DB_URL
for (const value of [base, dbUrl]) {
  if (
    !value ||
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)
  )
    throw new Error('Tests refuse remote services.')
}
const key = vars.SECRET_KEY || vars.SERVICE_ROLE_KEY
assert.ok(key, 'Local backend key missing; run pnpm supabase:status.')
const publicKey = vars.PUBLISHABLE_KEY || vars.ANON_KEY
const sql = postgres(dbUrl, { max: 10, onnotice: () => {} })
const generations = new Set()
const commentIds = new Set()
const clients = new Set()
const adminHeaders = {
  apikey: key,
  ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
}
const rpc = async (name, input, credentials = adminHeaders) => {
  const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...credentials, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  assert.ok([200, 204].includes(res.status), `RPC ${name} should succeed`)
  return res.status === 204 ? null : res.json()
}
function app() {
  const handler = createHandler({
    url: base,
    key,
    salt: crypto.randomUUID(),
    local: true,
    cleanupSecret: 'test-cleanup',
    fetch: async (url, init) => {
      if (String(url).endsWith('/tb_limit'))
        clients.add(JSON.parse(init.body).p_client)
      return fetch(url, init)
    },
  })
  const request = (path, body = '{}', headers = {}) =>
    handler(
      new Request(`http://localhost/api${path}`, {
        method: 'POST',
        body,
        headers,
      }),
    )
  const share = async (
    body,
    kind = 'text',
    name = '',
    duration = '10 minutes',
  ) => {
    const res = await request('/shares', body, {
      'X-Share-Kind': kind,
      'X-Share-Name': encodeURIComponent(name),
      'X-Share-Duration': duration,
    })
    assert.equal(res.status, 201, 'Share should be created')
    const note = await res.json()
    const [row] =
      await sql`select * from textbridge_private.shares where code=${note.code}`
    generations.add(row.generation)
    return { note, row }
  }
  const receive = (code) => request('/retrieve', JSON.stringify({ code }))
  return { request, share, receive }
}
before(async () => {
  const res = await fetch(`${base}/functions/v1/api/health`)
  assert.equal(res.status, 200, 'Real Edge Function must be running')
  assert.equal((await res.json()).mode, 'supabase-local')
})
after(async () => {
  // Remove only records and payloads created by this run. Leave user data alone.
  for (const id of generations) {
    await fetch(`${base}/storage/v1/object/textbridge`, {
      method: 'DELETE',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [`payloads/${id}`] }),
    })
    await sql`delete from textbridge_private.shares where generation=${id}`
    await sql`delete from textbridge_private.garbage where generation=${id}`
  }
  for (const id of commentIds)
    await sql`delete from textbridge_private.comments where id=${id}`
  for (const client of clients)
    await sql`delete from textbridge_private.rate_limits where right(id,64)=${client}`
  await sql.end()
})
test('real Supabase stores exact Unicode and repeated reads with database timestamps', async () => {
  const a = app()
  const body = Buffer.from(
    ' 🌉\nမြန်မာစာ 日本語\n<script>literal text</script> ',
  )
  const { note, row } = await a.share(body)
  assert.equal(row.state, 'ready')
  assert.ok(
    row.expires_at - row.created_at <= 600_000 &&
      row.expires_at - row.created_at >= 599_900,
  )
  for (let i = 0; i < 2; i++) {
    const res = await a.receive(note.code.toLowerCase().split('').join('-'))
    assert.equal(res.status, 200)
    assert.match(res.headers.get('Cache-Control'), /no-store/)
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), body)
  }
  const rejected = await a.request('/shares', 'old option', {
    'X-Share-Kind': 'text',
    'X-Share-Duration': '30 minutes',
  })
  assert.equal(rejected.status, 400)
  // A previously created 30-minute record remains readable at its original expiry.
  const [legacy] =
    await sql`update textbridge_private.shares set duration='30 minutes', expires_at=created_at+interval '30 minutes' where generation=${row.generation} returning expires_at`
  const previous = await a.receive(note.code)
  assert.equal(previous.status, 200)
  const data = JSON.parse(atob(previous.headers.get('X-Share-Metadata')))
  assert.equal(data.duration, '30 minutes')
  assert.equal(data.expiresAt, legacy.expires_at.getTime())
})
test('real Storage round trips 100,000 words and a file just below 20 MB', async () => {
  const a = app()
  const text = Buffer.from(('abcdefghij'.repeat(6) + ' ').repeat(100_000))
  const first = await a.share(text)
  assert.deepEqual(
    Buffer.from(await (await a.receive(first.note.code)).arrayBuffer()),
    text,
  )
  const bytes = Buffer.alloc(19_999_999, 23)
  const file = await a.share(bytes, 'file', '日本語.pdf', '5 minutes')
  assert.ok(
    file.row.expires_at - file.row.created_at <= 300_000 &&
      file.row.expires_at - file.row.created_at >= 299_900,
  )
  const res = await a.receive(file.note.code)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Content-Disposition'), 'attachment')
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes)
})
test('database reservations serialize concurrent collisions and protect generation', async () => {
  const code = secureCode()
  const values = await Promise.all(
    Array.from({ length: 8 }, async () => {
      const generation = crypto.randomUUID()
      generations.add(generation)
      return rpc('tb_reserve', {
        p_code: code,
        p_generation: generation,
        p_kind: 'text',
        p_name: '',
        p_size: 1,
        p_duration: '10 minutes',
      })
    }),
  )
  const winner = values.filter(Boolean)
  assert.equal(winner.length, 1)
  assert.equal(
    await rpc('tb_ready', { p_code: code, p_generation: crypto.randomUUID() }),
    false,
  )
  assert.equal(await rpc('tb_lookup', { p_code: code }), null)
  assert.equal(
    await rpc('tb_ready', { p_code: code, p_generation: winner[0].generation }),
    true,
  )
  assert.equal(
    (await rpc('tb_lookup', { p_code: code })).generation,
    winner[0].generation,
  )
})
test('atomic database rate counters cannot race', async () => {
  const client = 'a' + crypto.randomUUID().replaceAll('-', '') + 'b'.repeat(31)
  clients.add(client)
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      rpc('tb_limit', { p_client: client, p_action: 'create', p_bytes: 0 }),
    ),
  )
  assert.equal(results.filter(Boolean).length, 5)
})
test('browser roles cannot read private metadata, call backend RPCs, or download payloads', async () => {
  const a = app()
  const { row } = await a.share('private storage access test')
  const headers = {
    apikey: publicKey,
    ...(publicKey.startsWith('eyJ')
      ? { Authorization: `Bearer ${publicKey}` }
      : {}),
    'Content-Type': 'application/json',
  }
  for (const name of [
    'tb_limit',
    'tb_reserve',
    'tb_ready',
    'tb_lookup',
    'tb_comment',
    'tb_comments',
    'tb_cleanup_batch',
    'tb_cleanup_done',
  ]) {
    const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    assert.ok([401, 403, 404].includes(res.status), `Public RPC ${name} denied`)
  }
  const object = await fetch(
    `${base}/storage/v1/object/textbridge/payloads/${row.generation}`,
    { headers },
  )
  assert.ok([400, 401, 403, 404].includes(object.status))
  const permissions =
    await sql`select has_function_privilege('anon', oid, 'EXECUTE') as anon_allowed, has_function_privilege('authenticated', oid, 'EXECUTE') as auth_allowed from pg_proc where proname in ('tb_limit','tb_reserve','tb_ready','tb_lookup','tb_comment','tb_comments','tb_cleanup_batch','tb_cleanup_done')`
  assert.equal(permissions.length, 8)
  assert.ok(permissions.every((p) => !p.anon_allowed && !p.auth_allowed))
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`set local role anon`
      await tx`select * from textbridge_private.shares`
    }),
    (e) => e.code === '42501',
  )
})
test('expiry is enforced before cleanup; reuse and cleanup preserve the new generation', async () => {
  const a = app()
  const { note, row } = await a.share('expire this synthetic note')
  await sql`update textbridge_private.shares set expires_at=clock_timestamp()-interval '1 second' where generation=${row.generation}`
  assert.equal((await a.receive(note.code)).status, 404)
  const next = crypto.randomUUID()
  generations.add(next)
  const replacement = await rpc('tb_reserve', {
    p_code: note.code,
    p_generation: next,
    p_kind: 'text',
    p_name: '',
    p_size: 1,
    p_duration: '10 minutes',
  })
  assert.equal(replacement.generation, next)
  assert.ok((await rpc('tb_cleanup_batch', {})).includes(row.generation))
  const cleaned = await a.request('/cleanup', '{}', {
    'X-TextBridge-Cleanup': 'test-cleanup',
  })
  assert.equal(cleaned.status, 200)
  assert.ok((await cleaned.json()).removed >= 1)
  const [preserved] =
    await sql`select generation from textbridge_private.shares where code=${note.code}`
  assert.equal(preserved.generation, next)
  const old = await fetch(
    `${base}/storage/v1/object/textbridge/payloads/${row.generation}`,
    { headers: adminHeaders },
  )
  assert.equal(old.ok, false)
})
test('comments persist with server time, reject excess fields and enforce posting limits', async () => {
  const a = app()
  for (let i = 0; i < 3; i++) {
    const res = await a.request(
      '/comments',
      JSON.stringify({
        nickname: ' Synthetic guest ',
        comment: `日本語 <script>plain text</script> ${i}`,
      }),
    )
    assert.equal(res.status, 201)
    const item = await res.json()
    commentIds.add(item.id)
    assert.equal(item.nickname, 'Synthetic guest')
    assert.ok(Math.abs(Date.now() - item.createdAt) < 10_000)
  }
  assert.equal(
    (
      await a.request(
        '/comments',
        JSON.stringify({ nickname: 'guest', comment: 'limited' }),
      )
    ).status,
    429,
  )
  const reader = app()
  const list = await (await reader.request('/comments/list')).json()
  for (const id of commentIds)
    assert.ok(list.comments.some((item) => item.id === id))
  assert.equal(
    (
      await reader.request(
        '/comments',
        JSON.stringify({ nickname: 'guest', comment: 'test', email: 'extra' }),
      )
    ).status,
    400,
  )
})
test('real Edge Function handles the near-20 MB upload and repeat download end to end', async () => {
  const bytes = Buffer.alloc(19_999_999, 41)
  const created = await fetch(`${base}/functions/v1/api/shares`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Share-Kind': 'file',
      'X-Share-Name': 'edge-test.pdf',
      'X-Share-Duration': '10 minutes',
    },
    body: bytes,
  })
  assert.equal(created.status, 201)
  const note = await created.json()
  const [row] =
    await sql`select generation from textbridge_private.shares where code=${note.code}`
  generations.add(row.generation)
  for (let i = 0; i < 2; i++) {
    const received = await fetch(`${base}/functions/v1/api/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: note.code }),
    })
    assert.equal(received.status, 200)
    assert.deepEqual(Buffer.from(await received.arrayBuffer()), bytes)
  }
})
