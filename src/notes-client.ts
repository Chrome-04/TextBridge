import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { firebaseSession, notesAreLocal, canUseNotes } from './firebase-session'
import { notePayload, validateDocument, type NoteNode } from './note-document'
export const MAX_SAVED_NOTES = 20
export { notesError } from './notes-error'

let database: ReturnType<typeof getFirestore> | undefined
function db() {
  if (!database) {
    database = getFirestore(firebaseSession().app)
    // Memory cache only. Private notes are never persisted in IndexedDB.
    if (notesAreLocal) connectFirestoreEmulator(database, '127.0.0.1', 8082)
  }
  return database
}
function owner(uid: string) {
  const user = firebaseSession().auth.currentUser
  if (!user || !canUseNotes(user) || user.uid !== uid)
    throw new Error('Please log in again to access your notes.')
  return collection(db(), 'users', uid, 'notes')
}
export type SavedNote = {
  id: string
  title: string
  document: NoteNode
  text: string
  revision: number
  updatedAt: number
}
function decode(id: string, data: DocumentData): SavedNote {
  if (
    typeof data.title !== 'string' ||
    typeof data.document !== 'string' ||
    data.formatVersion !== 1 ||
    !Number.isInteger(data.revision)
  )
    throw new Error(
      'This note could not be read. Its saved copy has not been changed.',
    )
  const document = validateDocument(JSON.parse(data.document))
  return {
    id,
    title: data.title,
    document,
    text: notePayload(data.title, document).text,
    revision: data.revision,
    updatedAt: (data.updatedAt as Timestamp)?.toMillis() || 0,
  }
}
export function newNoteId(uid: string) {
  return doc(owner(uid)).id
}
export async function loadNotes(
  uid: string,
  cursor?: QueryDocumentSnapshot<DocumentData>,
) {
  const [usage, result] = await Promise.all([
    getDocFromServer(doc(db(), 'users', uid, 'noteState', 'quota')),
    getDocsFromServer(
      query(
        owner(uid),
        orderBy('updatedAt', 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(30),
      ),
    ),
  ])
  // A malformed record must not prevent access to the rest of the library.
  const notes: SavedNote[] = []
  let unreadable = 0
  for (const item of result.docs) {
    try {
      notes.push(decode(item.id, item.data()))
    } catch {
      unreadable++
    }
  }
  return {
    notes,
    total: usage.exists()
      ? Object.keys(quotaIds(usage.data())).length
      : result.empty && !cursor
        ? 0
        : null,
    cursor:
      result.docs.length === 30
        ? result.docs[result.docs.length - 1]
        : undefined,
    unreadable,
  }
}
export async function loadNote(uid: string, id: string) {
  const result = await getDocFromServer(doc(owner(uid), id))
  if (!result.exists())
    throw new Error(
      'This note was deleted. You can save your edits as a new note.',
    )
  return decode(result.id, result.data())
}

function quotaIds(data: DocumentData): Record<string, true> {
  const ids = data.noteIds
  if (
    !ids ||
    typeof ids !== 'object' ||
    Array.isArray(ids) ||
    Object.values(ids).some((value) => value !== true)
  )
    throw new Error(
      'Your notes setup needs updating. Your existing notes are safe; please contact the site owner.',
    )
  return ids
}
export class NoteLimitError extends Error {
  constructor() {
    super(
      'You have reached the 20-note limit. Delete a saved note to free a slot. Your text is still here.',
    )
  }
}
export class NoteConflict extends Error {
  constructor() {
    super(
      'This note changed on another device. Open the latest version or save your edits as a new note.',
    )
  }
}
export async function saveNote(
  uid: string,
  id: string,
  title: string,
  document: unknown,
  expectedRevision: number | null,
) {
  if (!navigator.onLine)
    throw new Error(
      'You’re offline. Reconnect and save again. Your edits are still here.',
    )
  const payload = notePayload(title, document)
  const ref = doc(owner(uid), id)
  return runTransaction(db(), async (transaction) => {
    owner(uid)
    const existing = await transaction.get(ref)
    if (existing.exists()) {
      const data = existing.data()
      // A retry after an uncertain response is idempotent for this draft ID.
      if (data.title === payload.title && data.document === payload.document)
        return decode(id, data)
      if (expectedRevision === null || data.revision !== expectedRevision)
        throw new NoteConflict()
      transaction.update(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
        revision: data.revision + 1,
      })
      return {
        id,
        ...payload,
        document: validateDocument(document),
        revision: data.revision + 1,
        updatedAt: Date.now(),
      }
    }
    if (expectedRevision !== null) throw new NoteConflict()
    const quota = doc(db(), 'users', uid, 'noteState', 'quota')
    const usage = await transaction.get(quota)
    const ids = usage.exists() ? quotaIds(usage.data()) : {}
    if (!usage.exists()) {
      // Old installations must be backfilled by the owner before quota rules go live.
      const legacy = await getDocsFromServer(query(owner(uid), limit(1)))
      if (!legacy.empty)
        throw new Error(
          'Your notes setup needs updating. Your existing notes are safe; please contact the site owner.',
        )
    }
    if (Object.keys(ids).length >= MAX_SAVED_NOTES) throw new NoteLimitError()
    transaction.set(quota, {
      noteIds: { ...ids, [id]: true },
      changedNoteId: id,
      updatedAt: serverTimestamp(),
    })
    transaction.set(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      revision: 1,
    })
    return {
      id,
      ...payload,
      document: validateDocument(document),
      revision: 1,
      updatedAt: Date.now(),
    }
  })
}
export async function removeNote(uid: string, id: string, revision: number) {
  const ref = doc(owner(uid), id)
  await runTransaction(db(), async (transaction) => {
    owner(uid)
    const item = await transaction.get(ref)
    if (!item.exists()) return
    if (item.data().revision !== revision) throw new NoteConflict()
    const quota = doc(db(), 'users', uid, 'noteState', 'quota')
    const usage = await transaction.get(quota)
    if (!usage.exists())
      throw new Error(
        'Your notes setup needs updating before deletion. Your existing notes are safe; please contact the site owner.',
      )
    const ids = { ...quotaIds(usage.data()) }
    if (!ids[id])
      throw new Error(
        'Your notes setup needs updating. Your existing notes are safe; please contact the site owner.',
      )
    delete ids[id]
    transaction.set(quota, {
      noteIds: ids,
      changedNoteId: id,
      updatedAt: serverTimestamp(),
    })
    transaction.delete(ref)
  })
}
