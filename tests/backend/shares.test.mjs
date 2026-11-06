import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  createShareService,
  ApiError,
  secureCode,
  validateContent,
  MAX_TEXT_BYTES,
} from '../../functions/service.js'
const require = createRequire(
  new URL('../../functions/package.json', import.meta.url),
)
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { getStorage } = require('firebase-admin/storage')
if (
  process.env.TEXTBRIDGE_TEST_RUN !== '1' ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
)
  throw new Error('Run only through npm run test:backend with fresh emulators.')
const project = 'demo-textbridge'
const app = initializeApp({
  projectId: project,
  storageBucket: `${project}.appspot.com`,
})
const db = getFirestore(app)
const bucket = getStorage(app).bucket()
const api = `http://127.0.0.1:5001/${project}/us-central1/api`
const options = {
  body: Buffer.from('hello 🌉\nမြန်မာစာ 日本語\n<script>literal</script>'),
  kind: 'text',
  duration: '10 minutes',
  client: 'test-client',
}
const service = (extra) =>
  createShareService({ db, bucket, salt: 'test-only', ...extra })
const create = (body, kind = 'text', duration = '10 minutes', name = '') =>
  fetch(api + '/shares', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Share-Kind': kind,
      'X-Share-Duration': duration,
      'X-Share-Name': encodeURIComponent(name),
    },
    body,
  })
const retrieve = (code) =>
  fetch(api + '/retrieve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
before(async () => {
  const health = await fetch(api + '/health', {
    signal: AbortSignal.timeout(60_000),
  })
  assert.equal(
    health.status,
    200,
    'Firebase api function must be loaded before tests',
  )
})
beforeEach(async () => {
  const cleared = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${project}/databases/(default)/documents`,
    { method: 'DELETE' },
  )
  assert.equal(cleared.status, 200)
  const [files] = await bucket.getFiles()
  await Promise.all(files.map((file) => file.delete()))
})
after(async () => {
  const counters = await db.collection('rateLimits').get()
  const batch = db.batch()
  counters.docs.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()
  await deleteApp(app)
})

test('HTTP sharing preserves Unicode and newlines; repeated reads and no-store responses', async () => {
  const response = await create(options.body)
  assert.equal(response.status, 201)
  assert.match(response.headers.get('cache-control'), /no-store/)
  const note = await response.json()
  assert.match(note.code, /^[A-HJ-NP-Z2-9]{6}$/)
  const record = (await db.doc(`shares/${note.code}`).get()).data()
  assert.ok(record.createdAt instanceof Timestamp)
  assert.ok(
    record.expiresAt.toMillis() - record.createdAt.toMillis() <= 600_000,
  )
  for (let i = 0; i < 2; i++) {
    const result = await retrieve(
      ` ${note.code.slice(0, 3).toLowerCase()}-${note.code.slice(3).toLowerCase()} `,
    )
    assert.equal(result.status, 200)
    assert.match(result.headers.get('cache-control'), /no-store/)
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), options.body)
  }
})

test('100,000 words beyond Firestore document size and a file just below 20 MB round trip', async () => {
  const text = Buffer.from(('abcdefghij'.repeat(6) + ' ').repeat(100_000))
  const created = await create(text)
  assert.equal(created.status, 201)
  const received = await retrieve((await created.json()).code)
  assert.equal(received.status, 200)
  assert.deepEqual(Buffer.from(await received.arrayBuffer()), text)
  const file = Buffer.alloc(19_999_999, 23)
  const upload = await create(file, 'file', '30 minutes', '日本語.pdf')
  assert.equal(upload.status, 201)
  const note = await upload.json()
  assert.equal(note.file.name, '日本語.pdf')
  const download = await retrieve(note.code)
  assert.equal(download.status, 200)
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), file)
})

test('backend rejects malformed text, size, duration, filename and code input', async () => {
  for (const args of [
    [Buffer.from(' ')],
    [Buffer.from('word '.repeat(100001))],
    [Buffer.from([255]), 'text'],
    [Buffer.from('x'), 'text', '1 hour'],
    [Buffer.alloc(20_000_000), 'file', '10 minutes', 'large.jpg'],
  ]) {
    const response = await create(...args)
    assert.ok([400, 413].includes(response.status))
  }
  assert.throws(
    () =>
      validateContent(Buffer.alloc(MAX_TEXT_BYTES + 1), 'text', '10 minutes'),
    ApiError,
  )
  assert.equal((await retrieve('O0I123')).status, 400)
  assert.equal((await retrieve('ABC234')).status, 404)
  assert.equal((await retrieve({ bad: true })).status, 400)
})

test('atomic reservations retry collisions and never overwrite an active share', async () => {
  let time = Date.now()
  const initial = service({ generateCode: () => 'ABC234', now: () => time })
  await initial.create(options)
  const sequence = ['ABC234', 'DEF567']
  const retry = service({
    generateCode: () => sequence.shift(),
    now: () => time,
  })
  const second = await retry.create({
    ...options,
    body: Buffer.from('second'),
    duration: '30 minutes',
  })
  assert.equal(second.code, 'DEF567')
  await assert.rejects(initial.create(options), (e) => e.status === 503)
  assert.deepEqual(
    (await initial.retrieve('ABC234', 'reader')).body,
    options.body,
  )
  time += 600_000
  const replacement = await initial.create({
    ...options,
    body: Buffer.from('new'),
  })
  assert.equal(replacement.code, 'ABC234')
  await initial.cleanup()
  assert.equal(
    (await initial.retrieve('ABC234', 'reader')).body.toString(),
    'new',
  )
})

test('concurrent creation reserves distinct codes and rate counters cannot race', async () => {
  const store = service({ generateCode: secureCode })
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => store.create(options)),
  )
  const good = results.filter((r) => r.status === 'fulfilled')
  assert.equal(good.length, 5)
  assert.equal(new Set(good.map((r) => r.value.code)).size, 5)
  assert.ok(
    results
      .filter((r) => r.status === 'rejected')
      .every((r) => r.reason.status === 429),
  )
})

test('expiry is checked on every read and cleanup is independent of availability', async () => {
  let time = Date.now()
  const store = service({ now: () => time })
  const note = await store.create(options)
  const record = (await db.doc(`shares/${note.code}`).get()).data()
  time = note.expiresAt - 1
  assert.deepEqual(
    (await store.retrieve(note.code, 'reader')).body,
    options.body,
  )
  time++
  await assert.rejects(
    store.retrieve(note.code, 'reader'),
    (e) => e.status === 404,
  )
  assert.equal((await bucket.file(record.path).exists())[0], true)
  const counts = await store.cleanup()
  assert.equal(counts.shares, 1)
  assert.equal((await bucket.file(record.path).exists())[0], false)
  assert.equal((await db.doc(`shares/${note.code}`).get()).exists, false)
})

test('public HTTP lookup refuses expired metadata; database and file access are denied', async () => {
  const response = await create(options.body)
  const note = await response.json()
  const ref = db.doc(`shares/${note.code}`)
  const data = (await ref.get()).data()
  const directDB = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents/shares/${note.code}`,
  )
  assert.equal(directDB.status, 403)
  const directWrite = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents/shares/ABC234`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { text: { stringValue: 'denied' } } }),
    },
  )
  assert.equal(directWrite.status, 403)
  const storageURL = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${project}.appspot.com/o/${encodeURIComponent(data.path)}?alt=media`
  assert.equal((await fetch(storageURL)).status, 403)
  const uploadDenied = await fetch(
    `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${project}.appspot.com/o?uploadType=media&name=denied.txt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: 'denied',
    },
  )
  assert.ok([401, 403].includes(uploadDenied.status))
  await ref.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) })
  const expired = await retrieve(note.code)
  assert.equal(expired.status, 404)
  assert.match(expired.headers.get('cache-control'), /no-store/)
})

test('HTTP backend limits creation and malformed guesses without trusting identity headers', async () => {
  for (let i = 0; i < 5; i++)
    assert.equal((await create(options.body)).status, 201)
  assert.equal((await create(options.body)).status, 429)
  const spoof = await fetch(api + '/shares', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Share-Kind': 'text',
      'X-Share-Duration': '10 minutes',
      'X-Forwarded-For': '203.0.113.50',
    },
    body: options.body,
  })
  assert.equal(spoof.status, 429)
  for (let i = 0; i < 20; i++) assert.equal((await retrieve('bad')).status, 400)
  const limited = await retrieve('bad')
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '60')
})
