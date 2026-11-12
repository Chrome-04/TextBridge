import { canUseNotes, firebaseSession, notesAreLocal } from './firebase-session'

export const FILE_STORAGE_BYTES = 20_000_000
export type StoredFile = {
  id: string
  name: string
  size: number
  state: 'pending' | 'ready' | 'deleting'
  created_at: string
}
export type FileLibrary = {
  files: StoredFile[]
  usedBytes: number
  limitBytes: number
  count: number
}
function account(uid: string) {
  const user = firebaseSession().auth.currentUser
  if (!user || !canUseNotes(user) || user.uid !== uid)
    throw new Error('Log in to access your private files.')
  return user
}
async function request(
  uid: string,
  path: string,
  body: BodyInit,
  headers: Record<string, string>,
  signal: AbortSignal,
) {
  const user = account(uid)
  let endpoint = '/file-api'
  let identity: Record<string, string>
  if (notesAreLocal)
    identity = { Authorization: `Bearer ${await user.getIdToken()}` }
  else {
    const url = new URL(import.meta.env.VITE_SUPABASE_FUNCTION_URL || '')
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.supabase.co') ||
      url.pathname !== '/functions/v1/api' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error('File storage is not configured.')
    endpoint = `${url.href}/files`
    identity = await (await import('./live-client')).liveHeaders()
  }
  account(uid)
  const timeout = AbortSignal.timeout(60_000)
  const response = await fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers: { ...headers, ...identity },
    body,
    cache: 'no-store',
    signal: AbortSignal.any([signal, timeout]),
  })
  if (!response.ok) {
    let kind = ''
    try {
      kind = (await response.json()).error
    } catch {
      /* generic response */
    }
    if (kind === 'storage-full')
      throw new Error(
        'Your 20 MB file storage is full. Delete a file to free space.',
      )
    if (kind === 'pending')
      throw new Error(
        'This upload is still being confirmed. Refresh files before trying again.',
      )
    if (response.status === 403)
      throw new Error('Log in again to access your private files.')
    if (response.status === 404)
      throw new Error('This file is no longer available. Refresh your files.')
    if (response.status === 429)
      throw new Error('Too many requests. Wait a minute and try again.')
    if ([400, 413].includes(response.status))
      throw new Error(
        'Choose a non-empty file with a name up to 240 characters, within your remaining storage.',
      )
    throw new Error(
      'File storage is unavailable. Try refreshing; the owner may need to finish the file storage setup.',
    )
  }
  const result = await response.arrayBuffer()
  account(uid)
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  return result
}
function jsonBody(value: unknown) {
  return JSON.stringify(value)
}
export async function loadSavedFiles(
  uid: string,
  offset: number,
  signal: AbortSignal,
): Promise<FileLibrary> {
  const bytes = await request(
    uid,
    '/list',
    jsonBody({ offset }),
    { 'Content-Type': 'application/json' },
    signal,
  )
  const data = JSON.parse(new TextDecoder().decode(bytes)) as FileLibrary
  if (
    !Number.isSafeInteger(data.usedBytes) ||
    data.usedBytes < 0 ||
    data.limitBytes !== FILE_STORAGE_BYTES ||
    !Number.isSafeInteger(data.count) ||
    !Array.isArray(data.files) ||
    data.files.length > 50 ||
    data.files.some(
      (file) =>
        !/^[0-9a-f-]{36}$/i.test(file.id) ||
        typeof file.name !== 'string' ||
        file.name.length > 240 ||
        !Number.isSafeInteger(file.size) ||
        !['pending', 'ready', 'deleting'].includes(file.state),
    )
  )
    throw new Error('Could not read your file list. Try refreshing.')
  return data
}
export async function uploadSavedFile(
  uid: string,
  file: File,
  id: string,
  signal: AbortSignal,
) {
  if (
    !file.size ||
    file.size > FILE_STORAGE_BYTES ||
    !file.name.trim() ||
    file.name.length > 240
  )
    throw new Error(
      'Choose a non-empty file up to 20 MB, with a name up to 240 characters.',
    )
  await request(
    uid,
    '/upload',
    file,
    {
      'Content-Type': 'application/octet-stream',
      'X-Share-Name': encodeURIComponent(file.name),
      'X-File-Id': id,
    },
    signal,
  )
}
export async function downloadSavedFile(
  uid: string,
  file: StoredFile,
  signal: AbortSignal,
) {
  const bytes = await request(
    uid,
    '/download',
    jsonBody({ id: file.id }),
    { 'Content-Type': 'application/json' },
    signal,
  )
  if (bytes.byteLength !== file.size)
    throw new Error('The download was incomplete. Please try again.')
  return new Blob([bytes], { type: 'application/octet-stream' })
}
export async function deleteSavedFile(
  uid: string,
  id: string,
  signal: AbortSignal,
) {
  await request(
    uid,
    '/delete',
    jsonBody({ id }),
    { 'Content-Type': 'application/json' },
    signal,
  )
}
