import { withDemoStore } from './indexed-store'
import { ShareError, type SharedNote, type Duration } from './demo-store'

export const usingBackend = import.meta.env.VITE_SHARE_MODE !== 'demo'
type Store = {
  create(text: string, duration: Duration): SharedNote | Promise<SharedNote>
  createFile(file: File, duration: Duration): SharedNote | Promise<SharedNote>
  retrieve(code: string): SharedNote | Promise<SharedNote>
  cleanup(): void | Promise<void>
}
async function request(path: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await fetch(`/api${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      if (response.status === 429) throw new ShareError('rate-limited')
      if (response.status === 404) throw new ShareError('not-found')
      if ([400, 413].includes(response.status)) throw new ShareError('invalid')
      throw new ShareError('network')
    }
    // Consume the body inside the timeout, including large downloads.
    return { response, body: await response.arrayBuffer() }
  } catch (error) {
    if (error instanceof ShareError) throw error
    throw new ShareError('network')
  } finally {
    clearTimeout(timeout)
  }
}
async function create(
  body: Blob,
  kind: 'text' | 'file',
  duration: Duration,
  name = '',
) {
  const result = await request('/shares', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Share-Kind': kind,
      'X-Share-Duration': duration,
      'X-Share-Name': encodeURIComponent(name),
    },
    body,
  })
  try {
    return JSON.parse(new TextDecoder().decode(result.body)) as SharedNote
  } catch {
    throw new ShareError('network')
  }
}
const backend: Store = {
  create: (text, duration) => create(new Blob([text]), 'text', duration),
  createFile: (file, duration) => create(file, 'file', duration, file.name),
  async retrieve(code) {
    const { response, body } = await request('/retrieve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    try {
      const encoded = response.headers.get('X-Share-Metadata')
      if (!encoded) throw new Error('metadata missing')
      const note = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
        ),
      ) as SharedNote
      return note.file
        ? {
            ...note,
            blob: new Blob([body], { type: 'application/octet-stream' }),
          }
        : {
            ...note,
            text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(body),
          }
    } catch {
      throw new ShareError('network')
    }
  },
  // Availability is enforced by the server. Cleanup is a separate local command.
  cleanup: () => {},
}
export async function withShareStore<T>(
  operation: (store: Store) => T | Promise<T>,
): Promise<T> {
  if (usingBackend) return operation(backend)
  return withDemoStore(operation)
}
