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
  sendEmailVerification,
  reload,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
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
  runTransaction,
  writeBatch,
} from 'firebase/firestore'

import { verifyEmulatorEmail } from './notes-auth-helpers.mjs'

setLogLevel('silent')
test(
  'private Firestore notes: owner CRUD, isolation, anonymous denial, schema and revision enforcement',
  { timeout: 90_000 },
  async () => {
    const clients = []
    async function client(anonymous = false, verified = true) {
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
      if (!anonymous && verified) {
        await sendEmailVerification(user)
        await verifyEmulatorEmail(user.email)
        await reload(user)
        assert.equal(
          (await user.getIdTokenResult(true)).claims.email_verified,
          true,
        )
      }
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
    function quota(c) {
      return doc(c.db, `users/${c.user.uid}/noteState/quota`)
    }
    function note(c, id) {
      return doc(c.db, `users/${c.user.uid}/notes/${id}`)
    }
    async function create(c, id, data = payload()) {
      return runTransaction(c.db, async (tx) => {
        const current = await tx.get(quota(c))
        const ids = current.data()?.noteIds || {}
        tx.set(quota(c), {
          noteIds: { ...ids, [id]: true },
          changedNoteId: id,
          updatedAt: serverTimestamp(),
        })
        tx.set(note(c, id), data)
      })
    }
    async function remove(c, id) {
      return runTransaction(c.db, async (tx) => {
        const current = await tx.get(quota(c))
        const ids = { ...current.data().noteIds }
        delete ids[id]
        tx.set(quota(c), {
          noteIds: ids,
          changedNoteId: id,
          updatedAt: serverTimestamp(),
        })
        tx.delete(note(c, id))
      })
    }
    try {
      const alice = await client(),
        bob = await client(),
        guest = await client(true),
        unverified = await client(false, false)
      const path = `users/${alice.user.uid}/notes/test`
      await denied(create(unverified, 'no-verification'))
      await denied(getDocFromServer(quota(unverified)))
      console.log('Rules: verified owner create')
      await create(alice, 'test')
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
      await denied(create(alice, 'invalid', { ...payload(), extraField: 'no' }))
      await denied(
        create(alice, 'invalid', { ...payload(), text: 'x'.repeat(50_001) }),
      )
      await denied(
        create(alice, 'invalid', { ...payload(), title: 'x'.repeat(121) }),
      )
      await denied(
        create(alice, 'invalid', {
          ...payload(),
          document: 'x'.repeat(200_001),
        }),
      )
      await denied(
        create(alice, 'invalid', { ...payload(), createdAt: new Date(0) }),
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
      await denied(deleteDoc(doc(alice.db, path)))
      await remove(alice, 'test')
      assert.equal(
        (await getDocFromServer(doc(alice.db, path))).exists(),
        false,
      )
      console.log('Rules: concurrent cap')
      // 19 -> two concurrent attempts: exactly one last slot, even with raw SDK writes.
      for (let i = 0; i < 19; i++) await create(alice, `slot-${i}`)
      const raced = await Promise.allSettled([
        create(alice, 'race-a'),
        create(alice, 'race-b'),
      ])
      assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(
        Object.keys((await getDocFromServer(quota(alice))).data().noteIds)
          .length,
        20,
      )
      await denied(create(alice, 'twenty-one'))
      await denied(setDoc(note(alice, 'bypass'), payload()))
      await denied(deleteDoc(quota(alice)))
      await denied(
        setDoc(quota(alice), {
          noteIds: {},
          changedNoteId: 'slot-0',
          updatedAt: serverTimestamp(),
        }),
      )
      await denied(getDocFromServer(doc(bob.db, quota(alice).path)))
      await updateDoc(note(alice, 'slot-0'), {
        title: 'Edit at cap',
        revision: 2,
        updatedAt: serverTimestamp(),
      })
      await remove(alice, 'slot-0')
      await create(alice, 'replacement')
      // A batch cannot hide a second note behind a single counted addition.
      const bad = writeBatch(bob.db)
      bad.set(note(bob, 'first'), payload())
      bad.set(note(bob, 'hidden'), payload())
      bad.set(quota(bob), {
        noteIds: { first: true },
        changedNoteId: 'first',
        updatedAt: serverTimestamp(),
      })
      await denied(bad.commit())
      assert.equal((await getDocFromServer(note(bob, 'first'))).exists(), false)
      console.log('Rules: OAuth owners')
      // OAuth identities use the same private rules and independent quota.
      for (const provider of ['google.com', 'apple.com']) {
        const c = await client(true)
        const email = `oauth-${randomUUID()}@textbridge.invalid`
        const token = JSON.stringify({
          sub: randomUUID(),
          email,
          email_verified: provider === 'google.com',
          iss:
            provider === 'apple.com'
              ? 'https://appleid.apple.com'
              : 'https://accounts.google.com',
        })
        const credential =
          provider === 'google.com'
            ? GoogleAuthProvider.credential(token)
            : new OAuthProvider('apple.com').credential({ idToken: token })
        await deleteUser(c.user)
        const result = await signInWithCredential(c.auth, credential)
        c.user = result.user
        assert.equal(
          (await c.user.getIdTokenResult(true)).signInProvider,
          provider,
        )
        await create(c, 'oauth-note')
        await denied(getDocFromServer(doc(c.db, path)))
      }
    } finally {
      for (const { app, db, user } of clients) {
        const own = await getDocsFromServer(
          query(collection(db, `users/${user.uid}/notes`), limit(30)),
        ).catch(() => null)
        for (const item of own?.docs || [])
          await fetch(
            `http://127.0.0.1:8082/v1/projects/demo-textbridge/databases/(default)/documents/${item.ref.path}`,
            { method: 'DELETE', headers: { Authorization: 'Bearer owner' } },
          )
        await fetch(
          `http://127.0.0.1:8082/v1/projects/demo-textbridge/databases/(default)/documents/users/${user.uid}/noteState/quota`,
          { method: 'DELETE', headers: { Authorization: 'Bearer owner' } },
        )
        await deleteUser(user)
        await terminate(db)
        await deleteApp(app)
      }
    }
  },
)
