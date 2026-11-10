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
import { firebaseSession, notesAreLocal } from './firebase-session'
import { notePayload, validateDocument, type NoteNode } from './note-document'
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
  if (!user || user.isAnonymous || user.uid !== uid)
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
  const result = await getDocsFromServer(
    query(
      owner(uid),
      orderBy('updatedAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(30),
    ),
  )
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
    transaction.delete(ref)
  })
}
