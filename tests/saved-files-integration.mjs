import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { createHandler } from '../supabase/functions/api/handler.ts'
if (process.env.TEXTBRIDGE_SUPABASE_TEST !== '1')
  throw new Error('Explicit local test opt-in required.')
const vars = Object.fromEntries(
  (
    await readFile(
      new URL('../.supabase-local/status.env', import.meta.url),
      'utf8',
    )
  )
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)
const base = vars.API_URL
if (
  ![base, vars.DB_URL].every(
    (value) =>
      value &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname),
  )
)
  throw new Error('Tests refuse remote services.')
const key = vars.SECRET_KEY || vars.SERVICE_ROLE_KEY
const admin = {
  apikey: key,
  ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
}
const sql = postgres(vars.DB_URL, { max: 5, onnotice: () => {} })
const accounts = []
const ids = new Set()
async function signup(anonymous = false) {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        anonymous
          ? { returnSecureToken: true }
          : {
              email: `files-${crypto.randomUUID()}@example.test`,
              password: 'Files-test-123!',
              returnSecureToken: true,
            },
      ),
    },
  )
  assert.equal(response.status, 200)
  const account = await response.json()
  accounts.push(account)
  return account
}
async function call(account, path, body = {}, headers = {}) {
  return fetch(`${base}/functions/v1/api/files${path}`, {
    method: 'POST',
    headers: {
      ...(account ? { Authorization: `Bearer ${account.idToken}` } : {}),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body instanceof Uint8Array ? body : JSON.stringify(body),
  })
}
async function upload(
  account,
  bytes,
  name = 'CV.pdf',
  id = crypto.randomUUID(),
) {
  ids.add(id)
  const response = await call(account, '/upload', bytes, {
    'Content-Type': 'application/octet-stream',
    'X-Share-Name': encodeURIComponent(name),
    'X-File-Id': id,
  })
  return { response, id }
}
const library = async (account) => {
  const r = await call(account, '/list')
  assert.equal(r.status, 200)
  return r.json()
}

test(
  'real private files: registered accounts, exact downloads, aggregate 20 MB race, deletion and cleanup isolation',
  { timeout: 180000 },
  async () => {
    try {
      const health = await fetch(`${base}/functions/v1/api/health`, {
        signal: AbortSignal.timeout(30_000),
      })
      assert.equal(health.status, 200, 'Local Edge runtime must be ready')
      assert.equal((await health.json()).mode, 'supabase-local')
      const alice = await signup(),
        bob = await signup(),
        guest = await signup(true)
      for (const account of [null, guest, { idToken: 'fake-token' }])
        assert.equal((await call(account, '/list')).status, 403)
      assert.equal(
        (await call(alice, '/list', { owner_id: `firebase:${bob.localId}` }))
          .status,
        400,
      )
      assert.equal((await library(alice)).usedBytes, 0)
      const payload = new Uint8Array(12_000_000).fill(123)
      const race = await Promise.all([
        upload(alice, payload, 'CV résumé.pdf'),
        upload(alice, payload, 'Other.pdf'),
      ])
      assert.deepEqual(
        race.map((item) => item.response.status).sort(),
        [201, 409],
      )
      const winner = race.find((item) => item.response.status === 201)
      const first = await library(alice)
      assert.equal(first.usedBytes, 12_000_000)
      assert.equal(first.files.length, 1)
      assert.equal(first.files[0].state, 'ready')
      assert.equal((await library(bob)).count, 0)
      assert.equal(
        (await call(bob, '/download', { id: winner.id })).status,
        404,
      )
      assert.equal((await call(bob, '/delete', { id: winner.id })).status, 404)
      const download = await call(alice, '/download', { id: winner.id })
      assert.equal(download.status, 200)
      assert.equal(
        download.headers.get('content-type'),
        'application/octet-stream',
      )
      assert.equal(download.headers.get('content-disposition'), 'attachment')
      assert.match(download.headers.get('cache-control'), /no-store/)
      assert.deepEqual(new Uint8Array(await download.arrayBuffer()), payload)
      const direct = await fetch(
        `${base}/storage/v1/object/textbridge-saved/${winner.id}`,
        { headers: { apikey: vars.PUBLISHABLE_KEY || vars.ANON_KEY } },
      )
      assert.notEqual(direct.status, 200)
      const again = await upload(alice, payload, first.files[0].name, winner.id)
      assert.equal(again.response.status, 200)
      assert.equal((await library(alice)).usedBytes, 12_000_000)
      const fill = await upload(
        alice,
        new Uint8Array(8_000_000).fill(9),
        'Documents.zip',
      )
      assert.equal(fill.response.status, 201)
      assert.equal((await library(alice)).usedBytes, 20_000_000)
      assert.equal(
        (await upload(alice, new Uint8Array([1]), 'one-byte.txt')).response
          .status,
        409,
      )
      assert.equal(
        (await upload(bob, new Uint8Array(0), 'empty.txt')).response.status,
        400,
      )
      assert.equal(
        (await upload(bob, new Uint8Array(20_000_001), 'oversize.bin')).response
          .status,
        413,
      )
      const capitalId = crypto.randomUUID().toUpperCase()
      const capital = await upload(
        bob,
        new Uint8Array([7, 8, 9]),
        'case.txt',
        capitalId,
      )
      assert.equal(capital.response.status, 201)
      const capitalDownload = await call(bob, '/download', { id: capitalId })
      assert.equal(capitalDownload.status, 200)
      assert.deepEqual(
        new Uint8Array(await capitalDownload.arrayBuffer()),
        new Uint8Array([7, 8, 9]),
      )
      assert.equal((await call(bob, '/delete', { id: capitalId })).status, 200)
      const [permission] =
        await sql`select has_table_privilege('anon','textbridge_private.saved_files','select') as anonymous,has_function_privilege('authenticated','public.tb_files_list(text,integer)','execute') as authenticated`
      assert.deepEqual(permission, { anonymous: false, authenticated: false })
      const rollback = new Error('rollback')
      const pending = crypto.randomUUID()
      ids.add(pending)
      try {
        await sql.begin(async (tx) => {
          await tx`select public.tb_file_reserve(${`firebase:${bob.localId}`},${pending}::uuid,'pending.txt',1)`
          const [young] =
            await tx`select public.tb_file_lookup(${`firebase:${bob.localId}`},${pending}::uuid,true) as item`
          assert.equal(young.item.state, 'pending')
          await tx`update textbridge_private.saved_files set created_at=clock_timestamp()-interval '16 minutes' where id=${pending}::uuid`
          await tx`update textbridge_private.saved_files set created_at=clock_timestamp()-interval '30 days' where id in (${winner.id}::uuid, ${fill.id}::uuid)`
          const [cleanup] = await tx`select public.tb_files_cleanup() as ids`
          assert.ok(cleanup.ids.includes(pending))
          assert.ok(!cleanup.ids.includes(winner.id))
          assert.ok(!cleanup.ids.includes(fill.id))
          throw rollback
        })
      } catch (error) {
        if (error !== rollback) throw error
      }
      // A failed object deletion keeps bytes reserved; retry removes the object first.
      const failing = createHandler({
        url: base,
        key,
        salt: crypto.randomUUID(),
        local: true,
        verifyAccountClient: async () => `firebase:${alice.localId}`,
        fetch: async (url, init) =>
          String(url).includes('/storage/v1/object/textbridge-saved') &&
          init?.method === 'DELETE'
            ? new Response('', { status: 503 })
            : fetch(url, init),
      })
      const failed = await failing(
        new Request('http://localhost/api/files/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: winner.id }),
        }),
      )
      assert.equal(failed.status, 503)
      assert.equal((await library(alice)).usedBytes, 20_000_000)
      assert.equal(
        (await call(alice, '/download', { id: winner.id })).status,
        404,
      )
      assert.equal(
        (await call(alice, '/delete', { id: winner.id })).status,
        200,
      )
      assert.equal((await library(alice)).usedBytes, 8_000_000)
      assert.equal((await call(alice, '/delete', { id: fill.id })).status, 200)
      assert.equal((await library(alice)).usedBytes, 0)
    } finally {
      for (const account of accounts) {
        const rows =
          await sql`select id from textbridge_private.saved_files where owner_id=${`firebase:${account.localId}`}`
        rows.forEach((row) => ids.add(row.id))
        await sql`delete from textbridge_private.saved_files where owner_id=${`firebase:${account.localId}`}`
        await fetch(
          'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: account.idToken }),
          },
        )
      }
      await fetch(`${base}/storage/v1/object/textbridge-saved`, {
        method: 'DELETE',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [...ids] }),
      })
      await sql.end()
    }
  },
)
