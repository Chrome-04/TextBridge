import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
} from 'firebase/auth'
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  updateDoc,
  runTransaction,
  serverTimestamp,
  terminate,
} from 'firebase/firestore'
const require = createRequire(
  new URL('../functions/package.json', import.meta.url),
)
const {
  initializeApp: adminApp,
  deleteApp: deleteAdmin,
} = require('firebase-admin/app')
const { getFirestore: adminDb, Timestamp } = require('firebase-admin/firestore')
const exec = promisify(execFile)
test(
  'owner migration preserves legacy notes, dry run, idempotency and accounts over the new limit',
  { timeout: 60_000 },
  async () => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082'
    const admin = adminApp({ projectId: 'demo-textbridge' }, randomUUID())
    const dbAdmin = adminDb(admin)
    const app = initializeApp(
      { projectId: 'demo-textbridge', apiKey: 'demo-key' },
      randomUUID(),
    )
    const auth = getAuth(app)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    })
    const db = getFirestore(app)
    connectFirestoreEmulator(db, '127.0.0.1', 8082)
    const { user } = await createUserWithEmailAndPassword(
      auth,
      `legacy-${randomUUID()}@textbridge.invalid`,
      'Legacy-test-274!',
    )
    const parent = dbAdmin.doc(`users/${user.uid}`)
    const state = parent.collection('noteState').doc('quota')
    try {
      const batch = dbAdmin.batch()
      for (let i = 0; i < 27; i++)
        batch.set(parent.collection('notes').doc(`legacy-${i}`), {
          title: `Legacy ${i}`,
          text: 'Keep this note',
          document:
            '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Keep this note"}]}]}',
          formatVersion: 1,
          revision: 1,
          createdAt: Timestamp.fromMillis(1),
          updatedAt: Timestamp.fromMillis(1),
        })
      await batch.commit()
      const args = [
        'functions/migrate-note-quota.mjs',
        '--project',
        'demo-textbridge',
        '--uid',
        user.uid,
      ]
      const preview = await exec(process.execPath, args, {
        env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8082' },
      })
      assert.match(preview.stdout, /Would update 1 of 1/)
      assert.equal((await state.get()).exists, false)
      const applied = await exec(process.execPath, [...args, '--apply'], {
        env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8082' },
      })
      assert.match(applied.stdout, /Updated 1 of 1/)
      assert.equal(Object.keys((await state.get()).data().noteIds).length, 27)
      assert.equal((await parent.collection('notes').get()).size, 27)
      assert.equal(
        (await parent.collection('notes').doc('legacy-0').get()).data().text,
        'Keep this note',
      )
      const repeat = await exec(process.execPath, [...args, '--apply'], {
        env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8082' },
      })
      assert.match(repeat.stdout, /Updated 0 of 1/)
      // The same owner migration also repairs a malformed registry without touching notes.
      await state.set({
        noteIds: [],
        changedNoteId: 'migration',
        updatedAt: Timestamp.fromMillis(1),
      })
      const repaired = await exec(process.execPath, [...args, '--apply'], {
        env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8082' },
      })
      assert.match(repaired.stdout, /Updated 1 of 1/)
      assert.equal(Object.keys((await state.get()).data().noteIds).length, 27)
      const original = doc(db, `users/${user.uid}/notes/legacy-0`)
      await updateDoc(original, {
        title: 'Still editable above cap',
        revision: 2,
        updatedAt: serverTimestamp(),
      })
      const quota = doc(db, state.path)
      for (let i = 0; i < 8; i++) {
        await runTransaction(db, async (tx) => {
          const current = await tx.get(quota)
          const ids = { ...current.data().noteIds }
          delete ids[`legacy-${i}`]
          tx.set(quota, {
            noteIds: ids,
            changedNoteId: `legacy-${i}`,
            updatedAt: serverTimestamp(),
          })
          tx.delete(doc(db, `users/${user.uid}/notes/legacy-${i}`))
        })
      }
      assert.equal(
        Object.keys((await getDocFromServer(quota)).data().noteIds).length,
        19,
      )
      assert.equal((await parent.collection('notes').get()).size, 19)
    } finally {
      const notes = await parent.collection('notes').get()
      const batch = dbAdmin.batch()
      for (const note of notes.docs) batch.delete(note.ref)
      batch.delete(state)
      await batch.commit()
      await deleteUser(user)
      await terminate(db)
      await deleteApp(app)
      await dbAdmin.terminate()
      await deleteAdmin(admin)
    }
  },
)
