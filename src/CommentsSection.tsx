import { useEffect, useRef, useState } from 'react'
import { ShareError } from './demo-store'
import {
  listComments,
  postComment,
  usingBackend,
  type PublicComment,
} from './share-client'

function errorMessage(error: unknown, posting: boolean) {
  if (error instanceof ShareError && error.kind === 'rate-limited')
    return 'Too many requests. Wait a minute before trying again. Your draft is still here.'
  if (error instanceof ShareError && error.kind === 'invalid')
    return 'Use a nickname of 1–40 characters and a comment of 1–1,000 characters.'
  return posting
    ? 'Could not confirm your comment was posted. Your draft is still here. Check Refresh comments before retrying, and keep the local backend running.'
    : 'Could not load comments. Keep the local backend running, then try Refresh comments.'
}

export default function CommentsSection() {
  const [comments, setComments] = useState<PublicComment[]>([])
  const [nickname, setNickname] = useState('')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(usingBackend)
  const [posting, setPosting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [postError, setPostError] = useState('')
  const [status, setStatus] = useState('')
  const loadId = useRef(0)
  const mounted = useRef(false)
  const load = async () => {
    const id = ++loadId.current
    setLoading(true)
    setLoadError('')
    try {
      const result = await listComments()
      if (mounted.current && id === loadId.current) setComments(result.comments)
    } catch (error) {
      if (mounted.current && id === loadId.current)
        setLoadError(errorMessage(error, false))
    } finally {
      if (mounted.current && id === loadId.current) setLoading(false)
    }
  }
  useEffect(() => {
    mounted.current = true
    if (usingBackend) void load()
    return () => {
      mounted.current = false
      loadId.current++
    }
  }, [])
  const valid =
    !!nickname.trim() &&
    nickname.length <= 40 &&
    !!comment.trim() &&
    comment.length <= 1000
  const submit = async () => {
    if (!valid || posting || loading) return
    setPosting(true)
    setPostError('')
    setStatus('')
    try {
      const created = await postComment(nickname, comment)
      if (!mounted.current) return
      setComments((current) =>
        [created, ...current.filter((item) => item.id !== created.id)].slice(
          0,
          20,
        ),
      )
      setComment('')
      setStatus('Your comment is posted. Thank you for sharing your thoughts.')
    } catch (error) {
      if (mounted.current) setPostError(errorMessage(error, true))
    } finally {
      if (mounted.current) setPosting(false)
    }
  }
  return (
    <section
      id="comments"
      className="help-section comments-section"
      aria-labelledby="comments-title"
      tabIndex={-1}
    >
      <p className="eyebrow">Community feedback</p>
      <h2 id="comments-title">What do you think?</h2>
      <p className="help-intro">
        Share an idea, a suggestion, or how TextBridge worked for you.
      </p>
      {!usingBackend ? (
        <p className="help-demo-note">
          Comments need a connected backend. This browser-only demo cannot post
          or load database comments.
        </p>
      ) : (
        <>
          <p className="local-note">
            Local database comments · visible between browsers on this computer.
            Nothing is published online yet.
          </p>
          <div className="comments-layout">
            <form
              className="comment-form"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
              aria-busy={posting}
            >
              <fieldset disabled={posting}>
                <legend>Leave a comment</legend>
                <label htmlFor="comment-nickname">Nickname</label>
                <input
                  id="comment-nickname"
                  name="nickname"
                  autoComplete="nickname"
                  maxLength={40}
                  required
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
                <div className="comment-label-row">
                  <label htmlFor="comment-message">Your comment</label>
                  <span id="comment-count" className="count">
                    {comment.length.toLocaleString()} / 1,000
                  </span>
                </div>
                <textarea
                  id="comment-message"
                  name="comment"
                  rows={5}
                  maxLength={1000}
                  required
                  aria-describedby="comment-count comment-public-note"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
                <p id="comment-public-note" className="size-hint">
                  Your nickname and comment will be visible to everyone who can
                  open this website. Nicknames are unverified. Comments stay
                  until removed; sharing expiry does not apply.
                </p>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!valid || posting || loading}
                >
                  {posting ? 'Posting…' : 'Post comment'}
                </button>
              </fieldset>
              {postError && (
                <p className="field-error" role="alert">
                  {postError}
                </p>
              )}
              {status && (
                <p className="comment-status" role="status">
                  {status}
                </p>
              )}
            </form>
            <div className="comments-feed" aria-busy={loading}>
              <div className="comments-feed-header">
                <h3>Latest comments</h3>
                <button
                  type="button"
                  className="input-action"
                  disabled={loading || posting}
                  onClick={() => void load()}
                >
                  {loading ? 'Loading…' : 'Refresh comments'}
                </button>
              </div>
              <p className="local-note">Showing the newest 20 comments.</p>
              {loadError && (
                <p className="field-error" role="alert">
                  {loadError}
                </p>
              )}
              {!loading && !loadError && comments.length === 0 && (
                <p className="comments-empty">
                  No comments yet. Be the first to share your thoughts.
                </p>
              )}
              {loading && (
                <p className="comments-empty" role="status">
                  Loading comments…
                </p>
              )}
              <ul className="comment-list">
                {comments.map((item) => (
                  <li key={item.id}>
                    <article>
                      <div className="comment-byline">
                        <strong>{item.nickname}</strong>
                        <time dateTime={new Date(item.createdAt).toISOString()}>
                          {new Date(item.createdAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                      <p>{item.comment}</p>
                    </article>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
