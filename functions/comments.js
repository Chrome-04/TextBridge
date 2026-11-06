import { createHmac } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { ApiError } from './service.js'

export function createCommentService({ db, salt, now = Date.now }) {
  async function limit(client, action) {
    const minute = Math.floor(now() / 60_000)
    const hash = createHmac('sha256', salt).update(client).digest('hex')
    const refs = [
      db.doc(`rateLimits/comments-${action}-${minute}-${hash}`),
      db.doc(`rateLimits/comments-${action}-${minute}-global`),
    ]
    const limits = action === 'post' ? [3, 30] : [30, 500]
    await db.runTransaction(async (tx) => {
      const snapshots = await tx.getAll(...refs)
      if (
        snapshots.some(
          (snapshot, i) => (snapshot.data()?.count ?? 0) >= limits[i],
        )
      )
        throw new ApiError(429, 'rate-limited')
      snapshots.forEach((snapshot, i) =>
        tx.set(refs[i], {
          count: (snapshot.data()?.count ?? 0) + 1,
          expiresAt: Timestamp.fromMillis((minute + 2) * 60_000),
        }),
      )
    })
  }
  function publicComment(snapshot) {
    const data = snapshot.data()
    return {
      id: snapshot.id,
      nickname: data.nickname,
      comment: data.comment,
      createdAt: data.createdAt.toMillis(),
    }
  }
  async function post(input, client) {
    await limit(client, 'post')
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (key) => !['nickname', 'comment'].includes(key),
      ) ||
      typeof input.nickname !== 'string' ||
      typeof input.comment !== 'string'
    )
      throw new ApiError(400, 'invalid')
    const nickname = input.nickname.trim()
    const comment = input.comment.trim()
    if (
      !nickname ||
      nickname.length > 40 ||
      /[\r\n\x00-\x1f\x7f]/u.test(nickname) ||
      !comment ||
      comment.length > 1000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(comment)
    )
      throw new ApiError(400, 'invalid')
    const ref = await db.collection('comments').add({
      nickname,
      comment,
      createdAt: FieldValue.serverTimestamp(),
    })
    return publicComment(await ref.get())
  }
  async function list(client) {
    await limit(client, 'list')
    const snapshot = await db
      .collection('comments')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get()
    return snapshot.docs.map(publicComment)
  }
  return { post, list }
}
