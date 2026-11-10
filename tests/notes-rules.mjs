import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInAnonymously,
  deleteUser,
} from 'firebase/auth'
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  collection,
  setDoc,
  getDocFromServer,
  getDocsFromServer,
  query,
  limit,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  terminate,
  setLogLevel,
} from 'firebase/firestore'

setLogLevel('silent')
test(
  'private Firestore notes: owner CRUD, isolation, anonymous denial, schema and revision enforcement',
  { timeout: 90_000 },
  async () => {
    const clients = []
    async function client(anonymous = false) {
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
      const { user } = anonymous
        ? await signInAnonymously(auth)
        : await createUserWithEmailAndPassword(
            auth,
            `rules-${randomUUID()}@textbridge.invalid`,
            `Test-${randomUUID()}`,
          )
      const result = { app, auth, db, user }
      clients.push(result)
      return result
    }
    const denied = (operation) =>
      assert.rejects(operation, (error) => error.code === 'permission-denied')
    const payload = () => ({
      title: 'Private note',
      document:
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"secret"}]}]}',
      text: 'secret',
      formatVersion: 1,
      revision: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    try {
      const alice = await client(),
        bob = await client(),
        guest = await client(true)
      const path = `users/${alice.user.uid}/notes/test`
      await setDoc(doc(alice.db, path), payload())
      assert.equal(
        (await getDocFromServer(doc(alice.db, path))).data().text,
        'secret',
      )
      assert.equal(
        (
          await getDocsFromServer(
            query(
              collection(alice.db, `users/${alice.user.uid}/notes`),
              limit(30),
            ),
          )
        ).size,
        1,
      )
      await denied(
        getDocsFromServer(
          collection(alice.db, `users/${alice.user.uid}/notes`),
        ),
      )
      await denied(
        getDocsFromServer(
          query(
            collection(alice.db, `users/${alice.user.uid}/notes`),
            limit(31),
          ),
        ),
      )
      await denied(getDocFromServer(doc(bob.db, path)))
      await denied(setDoc(doc(bob.db, path), payload()))
      await denied(deleteDoc(doc(bob.db, path)))
      await denied(getDocFromServer(doc(guest.db, path)))
      await denied(
        setDoc(doc(guest.db, `users/${guest.user.uid}/notes/test`), payload()),
      )
      await denied(
        setDoc(doc(alice.db, `users/${alice.user.uid}/notes/invalid`), {
          ...payload(),
          extraField: 'no',
        }),
      )
      await denied(
        setDoc(doc(alice.db, `users/${alice.user.uid}/notes/invalid`), {
          ...payload(),
          text: 'x'.repeat(50_001),
        }),
      )
      await denied(
        setDoc(doc(alice.db, `users/${alice.user.uid}/notes/invalid`), {
          ...payload(),
          title: 'x'.repeat(121),
        }),
      )
      await denied(
        setDoc(doc(alice.db, `users/${alice.user.uid}/notes/invalid`), {
          ...payload(),
          document: 'x'.repeat(200_001),
        }),
      )
      await denied(
        setDoc(doc(alice.db, `users/${alice.user.uid}/notes/invalid`), {
          ...payload(),
          createdAt: new Date(0),
        }),
      )
      await updateDoc(doc(alice.db, path), {
        title: 'Updated',
        revision: 2,
        updatedAt: serverTimestamp(),
      })
      await denied(
        updateDoc(doc(alice.db, path), {
          revision: 2,
          updatedAt: serverTimestamp(),
        }),
      )
      await denied(
        updateDoc(doc(alice.db, path), {
          revision: 3,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      )
      await denied(getDocFromServer(doc(alice.db, 'shares/private')))
      await denied(getDocFromServer(doc(alice.db, 'comments/private')))
      await deleteDoc(doc(alice.db, path))
      assert.equal(
        (await getDocFromServer(doc(alice.db, path))).exists(),
        false,
      )
    } finally {
      for (const { app, db, user } of clients) {
        const own = await getDocsFromServer(
          query(collection(db, `users/${user.uid}/notes`), limit(30)),
        ).catch(() => null)
        for (const item of own?.docs || []) await deleteDoc(item.ref)
        await deleteUser(user)
        await terminate(db)
        await deleteApp(app)
      }
    }
  },
)
