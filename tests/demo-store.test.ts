import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createDemoStore,
  countCharacters,
  normalizeCode,
  isValidCode,
  makeCode,
  ShareError,
  NOTE_PREFIX,
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
  const second = store.create('another note', '1 hour')
  assert.notEqual(first.code, second.code)
  for (let i = 0; i < 2; i++)
    assert.equal(createDemoStore(storage).retrieve(first.code).text, text)
  assert.equal(store.retrieve(second.code).text, 'another note')
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

test('validates empty text, code-point length boundaries, and expiration choices', () => {
  const store = createDemoStore(memoryStorage())
  assert.equal(countCharacters('🌉日本'), 3)
  for (const text of ['', ' \n ', 'x'.repeat(10001), '🌉'.repeat(10001)])
    assert.throws(() => store.create(text, '10 minutes'), fails('invalid'))
  assert.equal(
    store.create('🌉'.repeat(10000), '10 minutes').text,
    '🌉'.repeat(10000),
  )
  assert.throws(
    () => store.create('note', '24 hours' as Duration),
    fails('invalid'),
  )
})

test('rejects at the exact expiry boundary and cleans up without extending the timer', () => {
  let time = 1000
  const storage = memoryStorage()
  const store = createDemoStore(storage, () => time)
  const short = store.create('short', '10 minutes')
  const long = store.create('long', '1 hour')
  assert.equal(short.expiresAt, 601000)
  assert.equal(long.expiresAt, 3601000)
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
  assert.equal(store.create('second', '1 hour').code, 'DEF567')
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
