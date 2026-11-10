// Owner-only, manual migration. This file is not imported by Cloud Functions.
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
const args = process.argv.slice(2)
const project = args[args.indexOf('--project') + 1]
const apply = args.includes('--apply')
const uid = args.includes('--uid') ? args[args.indexOf('--uid') + 1] : undefined
if (args.includes('--uid') && (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)))
  throw new Error('A valid --uid is required when targeting one account.')
if (!args.includes('--project') || !project || project.startsWith('--'))
  throw new Error(
    'Specify --project demo-textbridge (local) or the exact cloud project ID.',
  )
if (process.env.FIRESTORE_EMULATOR_HOST && project !== 'demo-textbridge')
  throw new Error('Local migration must explicitly target demo-textbridge.')
if (
  !process.env.FIRESTORE_EMULATOR_HOST &&
  (!args.includes('--writes-frozen') || project === 'demo-textbridge')
)
  throw new Error(
    'Cloud migration requires --writes-frozen after deploying the maintenance rules. See NOTE_LIMIT_SETUP.md.',
  )
const app = initializeApp({
  projectId: project,
  ...(process.env.FIRESTORE_EMULATOR_HOST
    ? {}
    : { credential: applicationDefault() }),
})
const db = getFirestore(app)
const users = uid
  ? [db.collection('users').doc(uid)]
  : await db.collection('users').listDocuments()
let scanned = 0
let changed = 0
for (const user of users) {
  const notes = await user.collection('notes').listDocuments()
  const quota = user.collection('noteState').doc('quota')
  const previous = await quota.get()
  if (!notes.length && !previous.exists) continue
  const ids = Object.fromEntries(notes.map((note) => [note.id, true]))
  if (notes.some((note) => !/^[A-Za-z0-9_-]{1,128}$/.test(note.id)))
    throw new Error(
      'Unsupported legacy note ID found; no notes have been deleted. Contact the maintainer.',
    )
  scanned++
  const old = previous.data()?.noteIds
  if (
    old &&
    typeof old === 'object' &&
    !Array.isArray(old) &&
    Object.values(old).every((value) => value === true) &&
    Object.keys(old).length === notes.length &&
    notes.every((note) => old[note.id] === true)
  )
    continue
  if (apply)
    await quota.set({
      noteIds: ids,
      changedNoteId: 'migration',
      updatedAt: FieldValue.serverTimestamp(),
    })
  changed++
  if (notes.length > 20)
    console.log(
      'An existing account exceeds 20 notes. All notes retained; new saves blocked until below 20.',
    )
}
console.log(
  `${apply ? 'Updated' : 'Would update'} ${changed} of ${scanned} account registries. No note content or account identifiers printed. No notes deleted.`,
)
await db.terminate()
