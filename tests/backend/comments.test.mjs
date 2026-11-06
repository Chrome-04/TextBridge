import { beforeEach, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createCommentService } from '../../functions/comments.js'
const require = createRequire(
  new URL('../../functions/package.json', import.meta.url),
)
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
if (
  process.env.TEXTBRIDGE_TEST_RUN !== '1' ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
)
  throw new Error('Use npm run test:backend with fresh test emulators only.')
const app = initializeApp({ projectId: 'demo-textbridge' })
const db = getFirestore(app)
const api = 'http://127.0.0.1:5001/demo-textbridge/us-central1/api'
const request = (path, input) =>
  fetch(api + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
beforeEach(async () => {
  const reset = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-textbridge/databases/(default)/documents`,
    { method: 'DELETE' },
  )
  assert.equal(reset.status, 200)
})
after(() => deleteApp(app))

test('comments persist with server timestamps and are listed safely without private metadata', async () => {
  const started = Date.now()
  const response = await request('/comments', {
    nickname: '  Tester 🌉  ',
    comment: '  မြန်မာစာ 日本語\n<script>literal</script>  ',
  })
  assert.equal(response.status, 201)
  assert.match(response.headers.get('cache-control'), /no-store/)
  const comment = await response.json()
  assert.equal(comment.nickname, 'Tester 🌉')
  assert.equal(comment.comment, 'မြန်မာစာ 日本語\n<script>literal</script>')
  const stored = (await db.doc(`comments/${comment.id}`).get()).data()
  assert.ok(stored.createdAt instanceof Timestamp)
  assert.ok(comment.createdAt >= started && comment.createdAt <= Date.now())
  assert.deepEqual(Object.keys(comment).sort(), [
    'comment',
    'createdAt',
    'id',
    'nickname',
  ])
  const listed = await request('/comments/list', {})
  assert.equal(listed.status, 200)
  assert.deepEqual((await listed.json()).comments, [comment])
  const direct = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-textbridge/databases/(default)/documents/comments/${comment.id}`,
  )
  assert.equal(direct.status, 403)
  const write = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-textbridge/databases/(default)/documents/comments/denied`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { nickname: { stringValue: 'denied' } } }),
    },
  )
  assert.equal(write.status, 403)
})

test('backend rejects empty, oversized, forged and malformed comments', async () => {
  const service = createCommentService({ db, salt: 'test-only' })
  const invalid = [
    null,
    [],
    {},
    { nickname: ' ', comment: 'hello' },
    { nickname: 'x'.repeat(41), comment: 'hello' },
    { nickname: 'Tester', comment: ' ' },
    { nickname: 'Tester', comment: 'x'.repeat(1001) },
    { nickname: 'Tester\nOther', comment: 'hello' },
    { nickname: 'Tester', comment: 'hello', createdAt: 1 },
    { nickname: 'Tester', comment: '<script>literal</script>', admin: true },
  ]
  for (const [index, input] of invalid.entries())
    await assert.rejects(
      service.post(input, `invalid-${index}`),
      (error) => error.status === 400,
    )
  assert.equal((await db.collection('comments').get()).size, 0)
  assert.equal(
    (
      await request('/comments', {
        nickname: 'Tester',
        comment: 'x'.repeat(9000),
      })
    ).status,
    400,
  )
  assert.equal((await request('/comments/list', { admin: true })).status, 400)
})

test('posting limits are atomic, count invalid attempts and reject spoofed identity headers', async () => {
  const service = createCommentService({ db, salt: 'test-only' })
  const outcomes = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      service.post(
        { nickname: 'Tester', comment: 'Concurrent synthetic feedback' },
        'same-client',
      ),
    ),
  )
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 3)
  assert.ok(
    outcomes
      .filter((item) => item.status === 'rejected')
      .every((item) => item.reason.status === 429),
  )
  for (let i = 0; i < 3; i++)
    assert.equal((await request('/comments', {})).status, 400)
  const limited = await fetch(api + '/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.70',
    },
    body: JSON.stringify({
      nickname: 'Tester',
      comment: 'Limited synthetic feedback',
    }),
  })
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '60')
})

test('list returns only the newest 20 and has a bounded request rate', async () => {
  const batch = db.batch()
  for (let i = 0; i < 25; i++)
    batch.set(db.collection('comments').doc(), {
      nickname: 'Synthetic tester',
      comment: `Item ${i}`,
      createdAt: Timestamp.fromMillis(1000 + i),
    })
  await batch.commit()
  const service = createCommentService({ db, salt: 'test-only' })
  const comments = await service.list('reader')
  assert.equal(comments.length, 20)
  assert.equal(comments[0].comment, 'Item 24')
  assert.equal(comments[19].comment, 'Item 5')
  for (let i = 1; i < 30; i++) await service.list('reader')
  await assert.rejects(service.list('reader'), (error) => error.status === 429)
})
