import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createDemoStore,
  countWords,
  normalizeCode,
  isValidCode,
  makeCode,
  ShareError,
  NOTE_PREFIX,
  MAX_BYTES,
  FILE_LIMIT_BYTES,
  safeFileName,
  type Duration,
} from '../src/demo-store.ts'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    clear: () => data.clear(),
  }
}
const fails = (kind: string) => (error: unknown) =>
  error instanceof ShareError && error.kind === kind

test('multiple notes survive new adapters and repeat retrieval, preserving exact Unicode text', () => {
  const storage = memoryStorage()
  const store = createDemoStore(storage)
  const text =
    '  Hello 🌉\nမြန်မာစာ 日本語\nconst x = "<script>";\nhttps://example.com/' +
    'a'.repeat(2000) +
    '\n'
  const first = store.create(text, '10 minutes')
  const second = store.create('another note', '30 minutes')
  assert.notEqual(first.code, second.code)
  for (let i = 0; i < 2; i++)
    assert.equal(createDemoStore(storage).retrieve(first.code).text, text)
  assert.equal(store.retrieve(second.code).text, 'another note')
})

test('files preserve exact bytes and metadata, repeat reads, and expire with their blobs', async () => {
  let time = 1000
  const storage = memoryStorage()
  const blobs = new Map<string, Blob>()
  const store = createDemoStore(storage, () => time, undefined, blobs)
  const bytes = new Uint8Array([0, 255, 12, 13, 10, 200])
  const file = new File([bytes], 'မြန်မာ-日本.pdf', { type: 'application/pdf' })
  const note = store.createFile(file, '30 minutes')
  assert.equal(note.file?.name, file.name)
  assert.equal(note.file?.size, bytes.length)
  assert.equal(note.expiresAt, 1801000)
  for (let i = 0; i < 2; i++) {
    const received = createDemoStore(
      storage,
      () => time,
      undefined,
      blobs,
    ).retrieve(note.code)
    assert.deepEqual(new Uint8Array(await received.blob!.arrayBuffer()), bytes)
  }
  time = note.expiresAt
  assert.throws(() => store.retrieve(note.code), fails('not-found'))
  assert.equal(blobs.has(note.code), false)
  assert.equal(storage.getItem(NOTE_PREFIX + note.code), null)
})

test('file boundary is strictly under 20 MB; names and duration are validated', () => {
  const store = createDemoStore(
    memoryStorage(),
    Date.now,
    undefined,
    new Map<string, Blob>(),
  )
  const large = new Uint8Array(FILE_LIMIT_BYTES)
  assert.ok(
    store.createFile(new File([large.subarray(1)], 'large.jpg'), '10 minutes'),
  )
  assert.throws(
    () => store.createFile(new File([large], 'too-large.pdf'), '10 minutes'),
    fails('invalid'),
  )
  assert.throws(
    () => store.createFile(new File(['x'], 'note.txt'), '1 hour' as Duration),
    fails('invalid'),
  )
  assert.equal(safeFileName('../test\\name\u0000.pdf'), '.._test_name_.pdf')
  assert.equal(safeFileName(''), 'download')
})

test('text and files share collision protection and creation limits; missing blobs fail', () => {
  const codes = ['ABC234', 'ABC234', 'DEF567', 'GHJ678', 'JKL789', 'MNP892']
  const blobs = new Map<string, Blob>()
  const store = createDemoStore(
    memoryStorage(),
    Date.now,
    () => codes.shift()!,
    blobs,
  )
  store.create('original', '10 minutes')
  const file = new File(['data'], 'test.txt')
  const note = store.createFile(file, '10 minutes')
  assert.equal(note.code, 'DEF567')
  assert.equal(store.retrieve('ABC234').text, 'original')
  blobs.delete(note.code)
  assert.throws(() => store.retrieve(note.code), fails('not-found'))
  for (let i = 0; i < 3; i++) store.createFile(file, '10 minutes')
  assert.throws(
    () => store.createFile(file, '10 minutes'),
    fails('rate-limited'),
  )
})

test('normalizes only whitespace, hyphens, and case; rejects malformed codes', () => {
  assert.equal(normalizeCode(' a b-c2 3\n4 '), 'ABC234')
  assert.ok(isValidCode('ABC234'))
  for (const code of [
    'ABC23',
    'ABC2345',
    'ABC23!',
    'OBC234',
    'IBC234',
    '0BC234',
    '1BC234',
  ])
    assert.equal(isValidCode(code), false)
  assert.equal(normalizeCode('abc234!'), 'ABC234!')
})

test('generates six symbols exclusively from the allowed alphabet', () => {
  for (let i = 0; i < 500; i++) assert.ok(isValidCode(makeCode()))
})

test('validates empty text, word and byte boundaries, and expiration choices', () => {
  const store = createDemoStore(memoryStorage())
  assert.equal(countWords('🌉 日本\nမြန်မာစာ'), 3)
  assert.equal(countWords('  a\t b\n c  '), 3)
  for (const text of [
    '',
    ' \n ',
    'word '.repeat(100001),
    'x'.repeat(MAX_BYTES + 1),
  ])
    assert.throws(() => store.create(text, '10 minutes'), fails('invalid'))
  assert.equal(
    store.create('🌉 '.repeat(100000), '10 minutes').text,
    '🌉 '.repeat(100000),
  )
  assert.throws(
    () => store.create('note', '1 hour' as Duration),
    fails('invalid'),
  )
})

test('rejects at the exact expiry boundary and cleans up without extending the timer', () => {
  let time = 1000
  const storage = memoryStorage()
  const store = createDemoStore(storage, () => time)
  const short = store.create('short', '10 minutes')
  const long = store.create('long', '30 minutes')
  assert.equal(short.expiresAt, 601000)
  assert.equal(long.expiresAt, 1801000)
  time = 600999
  assert.equal(store.retrieve(short.code).text, 'short')
  time++
  assert.throws(() => store.retrieve(short.code), fails('not-found'))
  assert.equal(storage.getItem(NOTE_PREFIX + short.code), null)
  assert.equal(store.retrieve(long.code).text, 'long')
  time = long.expiresAt
  assert.throws(() => store.retrieve(long.code), fails('not-found'))
})

test('retries active-code collisions and may reuse an expired code', () => {
  const storage = memoryStorage()
  const codes = ['ABC234', 'ABC234', 'DEF567', 'ABC234']
  let time = 1000
  const store = createDemoStore(
    storage,
    () => time,
    () => codes.shift()!,
  )
  store.create('first', '10 minutes')
  assert.equal(store.create('second', '30 minutes').code, 'DEF567')
  assert.equal(store.retrieve('ABC234').text, 'first')
  time += 600000
  assert.equal(store.create('new', '10 minutes').code, 'ABC234')
  assert.equal(store.retrieve('ABC234').text, 'new')
})

test('collision retry budget cannot overwrite an active note', () => {
  const store = createDemoStore(memoryStorage(), Date.now, () => 'ABC234')
  store.create('first', '10 minutes')
  assert.throws(
    () => store.create('second', '10 minutes'),
    fails('rate-limited'),
  )
  assert.equal(store.retrieve('ABC234').text, 'first')
})

test('demo creation and guessing limits survive adapters and recover after one minute', () => {
  let time = 1000
  const storage = memoryStorage()
  const store = createDemoStore(storage, () => time)
  for (let i = 0; i < 5; i++) store.create('note', '10 minutes')
  assert.throws(
    () => createDemoStore(storage, () => time).create('note', '10 minutes'),
    fails('rate-limited'),
  )
  for (let i = 0; i < 20; i++)
    assert.throws(() => store.retrieve('ABC234'), fails('not-found'))
  assert.throws(() => store.retrieve('ABC234'), fails('rate-limited'))
  time += 60000
  assert.ok(store.create('note', '10 minutes'))
  assert.throws(() => store.retrieve('ABC234'), fails('not-found'))
})

test('handles damaged and blocked storage without returning false success', () => {
  const storage = memoryStorage()
  storage.setItem(NOTE_PREFIX + 'ABC234', '{broken')
  storage.setItem(
    NOTE_PREFIX + 'DEF567',
    JSON.stringify({ code: 'DEF567', text: 3, expiresAt: 9999999999999 }),
  )
  const store = createDemoStore(storage)
  assert.throws(() => store.retrieve('ABC234'), fails('not-found'))
  assert.throws(() => store.retrieve('DEF567'), fails('not-found'))
  storage.setItem = () => {
    throw new Error('quota exceeded')
  }
  assert.throws(() => store.create('text', '10 minutes'), fails('storage'))
})
