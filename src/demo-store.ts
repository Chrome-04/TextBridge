// Browser-only adapter. Replace this boundary with Firebase functions in Stage 2.
export type Duration = '10 minutes' | '30 minutes'
export type SharedNote = {
  code: string
  text: string
  duration: Duration | '1 hour'
  expiresAt: number
}
export type Failure =
  'invalid' | 'not-found' | 'rate-limited' | 'network' | 'storage'
export class ShareError extends Error {
  kind: Failure
  constructor(kind: Failure) {
    super(kind)
    this.kind = kind
  }
}

export const MAX_WORDS = 100_000
export const MAX_BYTES = 20 * 1024 * 1024
export const textBytes = (text: string) =>
  new TextEncoder().encode(text).byteLength
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const NOTE_PREFIX = 'textbridge:demo:v1:note:'
const RATE_PREFIX = 'textbridge:demo:v1:rate:'
// A word is a run of non-whitespace, including URLs, emoji, and code tokens.
export const countWords = (text: string) => {
  let count = 0
  for (const _word of text.matchAll(/\S+/gu)) count++
  return count
}
export const normalizeCode = (code: string) =>
  code.toUpperCase().replace(/[\s-]/g, '')
export const isValidCode = (code: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(code)
export const durationMs = (duration: Duration) =>
  duration === '10 minutes' ? 600_000 : 1_800_000

export function makeCode() {
  // 32 symbols divide 256 evenly, so each symbol is equally likely.
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (byte) => ALPHABET[byte % 32],
  ).join('')
}

function isNote(value: unknown): value is SharedNote {
  if (!value || typeof value !== 'object') return false
  const note = value as SharedNote
  return (
    typeof note.code === 'string' &&
    isValidCode(note.code) &&
    typeof note.text === 'string' &&
    !!note.text.trim() &&
    countWords(note.text) <= MAX_WORDS &&
    textBytes(note.text) <= MAX_BYTES &&
    ['10 minutes', '30 minutes', '1 hour'].includes(note.duration) &&
    Number.isFinite(note.expiresAt)
  )
}

export function createDemoStore(
  storage: Storage,
  now = Date.now,
  generateCode = makeCode,
) {
  function safely<T>(operation: () => T): T {
    try {
      return operation()
    } catch (error) {
      if (error instanceof ShareError) throw error
      throw new ShareError('storage')
    }
  }

  function read(code: string): SharedNote | null {
    const key = NOTE_PREFIX + code
    const raw = storage.getItem(key)
    if (raw === null) return null
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      storage.removeItem(key)
      return null
    }
    if (!isNote(value) || value.code !== code || value.expiresAt <= now()) {
      storage.removeItem(key)
      return null
    }
    return value
  }

  function cleanup() {
    const keys = Array.from({ length: storage.length }, (_, i) =>
      storage.key(i),
    )
    for (const key of keys)
      if (key?.startsWith(NOTE_PREFIX)) read(key.slice(NOTE_PREFIX.length))
  }

  function limit(action: 'create' | 'receive') {
    const key = RATE_PREFIX + action
    const raw = storage.getItem(key)
    let attempts: number[] = []
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed))
          attempts = parsed.filter(
            (time) => typeof time === 'number' && time > now() - 60_000,
          )
      } catch {
        /* Ignore damaged demo counters. */
      }
    }
    if (attempts.length >= (action === 'create' ? 5 : 20))
      throw new ShareError('rate-limited')
    storage.setItem(key, JSON.stringify([...attempts, now()]))
  }

  return {
    create(text: string, duration: Duration): SharedNote {
      return safely(() => {
        if (
          typeof text !== 'string' ||
          !text.trim() ||
          countWords(text) > MAX_WORDS ||
          textBytes(text) > MAX_BYTES ||
          !['10 minutes', '30 minutes'].includes(duration)
        )
          throw new ShareError('invalid')
        limit('create')
        cleanup()
        for (let attempt = 0; attempt < 20; attempt++) {
          const code = generateCode()
          if (!isValidCode(code) || read(code)) continue
          const note = {
            code,
            text,
            duration,
            expiresAt: now() + durationMs(duration),
          }
          storage.setItem(NOTE_PREFIX + code, JSON.stringify(note))
          return note
        }
        throw new ShareError('rate-limited')
      })
    },
    retrieve(input: string): SharedNote {
      return safely(() => {
        limit('receive')
        const code = normalizeCode(input)
        if (!isValidCode(code)) throw new ShareError('invalid')
        const note = read(code)
        if (!note) throw new ShareError('not-found')
        return note
      })
    },
    cleanup: () => safely(cleanup),
  }
}
