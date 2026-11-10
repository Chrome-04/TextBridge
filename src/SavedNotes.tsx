import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { QRCodeSVG } from 'qrcode.react'
import { useNotesAccount } from './NotesAccount'
import { notesAreLocal } from './firebase-session'
import {
  documentFromText,
  MAX_NOTE_TEXT,
  MAX_NOTE_TITLE,
  notePayload,
  plainText,
  type NoteNode,
} from './note-document'
import {
  loadNote,
  loadNotes,
  newNoteId,
  NoteConflict,
  notesError,
  removeNote,
  saveNote,
  type SavedNote,
} from './notes-client'
import { withShareStore } from './share-client'
import { type Duration, type SharedNote } from './demo-store'

type Draft = {
  id: string
  title: string
  document: NoteNode
  revision: number | null
}
type NotePage = Awaited<ReturnType<typeof loadNotes>>

function RichText({
  initial,
  disabled,
  onChange,
}: {
  initial: NoteNode
  disabled: boolean
  onChange: (value: unknown) => void
}) {
  const [emoji, setEmoji] = useState(false)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        strike: false,
        orderedList: { keepMarks: true },
        bulletList: { keepMarks: true },
      }),
    ],
    content: initial,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Note content',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
  })
  useEffect(() => {
    editor?.setEditable(!disabled, false)
  }, [editor, disabled])
  if (!editor)
    return (
      <p className="muted" role="status">
        Opening editor…
      </p>
    )
  const tools = [
    {
      label: 'Bold',
      text: <strong>B</strong>,
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      text: <em>I</em>,
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Underline',
      text: <u>U</u>,
      active: editor.isActive('underline'),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: 'Bullet list',
      text: 'Bullet list',
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered list',
      text: 'Numbered list',
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ]
  return (
    <div className="rich-text">
      <div
        className="notes-format-bar"
        role="group"
        aria-label="Text formatting"
      >
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            aria-label={tool.label}
            title={tool.label}
            aria-pressed={tool.active}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={tool.run}
          >
            {tool.text}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || !editor.can().undo()}
          aria-label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </button>
        <button
          type="button"
          disabled={disabled || !editor.can().redo()}
          aria-label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Insert emoji"
          aria-expanded={emoji}
          onClick={() => setEmoji(!emoji)}
        >
          ☺ Emoji
        </button>
      </div>
      {emoji && (
        <div className="notes-emoji" role="group" aria-label="Choose an emoji">
          {[
            '😀',
            '😊',
            '😂',
            '❤️',
            '👍',
            '🎉',
            '✨',
            '💡',
            '✅',
            '📌',
            '🙏',
            '🚀',
            '📚',
            '💻',
            '☕',
            '🌱',
          ].map((value) => (
            <button
              type="button"
              disabled={disabled}
              key={value}
              aria-label={`Insert ${value}`}
              onClick={() => {
                editor.commands.insertContent({ type: 'text', text: value })
                editor.view.focus()
                setEmoji(false)
              }}
            >
              {value}
            </button>
          ))}
          <button type="button" onClick={() => setEmoji(false)}>
            Close
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

function ShareNoteDialog({
  note,
  onClose,
  onShared,
}: {
  note: SavedNote
  onClose: () => void
  onShared: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [duration, setDuration] = useState<Duration>('5 minutes')
  const [result, setResult] = useState<SharedNote | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const url = result ? `${window.location.origin}/receive#${result.code}` : ''
  const seconds = result
    ? Math.max(0, Math.ceil((result.expiresAt - now) / 1000))
    : 0
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(`${label} copied.`)
    } catch {
      setCopied('Copy was blocked. Select and copy the code or link manually.')
    }
  }
  return (
    <dialog
      className="account-dialog share-note-dialog"
      ref={dialog}
      aria-labelledby="share-note-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="account-dialog-head">
        <span className="eyebrow">A temporary copy</span>
        <button
          type="button"
          className="dialog-close"
          disabled={busy}
          onClick={onClose}
          aria-label="Close sharing dialog"
        >
          ×
        </button>
      </div>
      <h2 id="share-note-title">
        {result ? 'Ready to share.' : 'Share this note.'}
      </h2>
      <p className="muted">{note.title}</p>
      <p className="size-hint">
        Only the plain text is shared. Your saved note stays private and remains
        in Saved. Later edits will not change this copy.
      </p>
      {result ? (
        seconds > 0 ? (
          <>
            <p className="notes-share-code" aria-label="Sharing code">
              {result.code}
            </p>
            <p className="notes-message">
              Expires in {Math.floor(seconds / 60)}:
              {String(seconds % 60).padStart(2, '0')}
            </p>
            <div className="notes-share-qr">
              <QRCodeSVG
                value={url}
                size={160}
                bgColor="#fff"
                fgColor="#0b0d0c"
                marginSize={2}
                title="Scan to receive this note"
              />
            </div>
            <label htmlFor="saved-share-link">Sharing link</label>
            <input
              id="saved-share-link"
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
            />
            <div className="notes-actions">
              <button
                className="secondary-button"
                onClick={() => void copy(result.code, 'Code')}
              >
                Copy code
              </button>
              <button
                className="secondary-button"
                onClick={() => void copy(url, 'Link')}
              >
                Copy link
              </button>
            </div>
            <p className="size-hint">
              Anyone with this code or link can read this copy until it expires.
            </p>
          </>
        ) : (
          <p className="notes-message" role="status">
            This sharing code has expired. Your saved note is still available.
          </p>
        )
      ) : (
        <>
          <fieldset className="notes-share-duration" disabled={busy}>
            <legend>Keep shared copy for</legend>
            {(['5 minutes', '10 minutes'] as Duration[]).map((choice) => (
              <label key={choice}>
                <input
                  type="radio"
                  name="note-share-duration"
                  checked={duration === choice}
                  onChange={() => setDuration(choice)}
                />{' '}
                {choice}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={async () => {
              if (busyRef.current) return
              busyRef.current = true
              setBusy(true)
              setError('')
              try {
                const created = await withShareStore((store) =>
                  store.create(note.text, duration),
                )
                setResult(created)
                setNow(Date.now())
                onShared()
              } catch {
                setError(
                  'Could not generate a code. Your saved note is unchanged. Check your connection and try again.',
                )
              } finally {
                setBusy(false)
                busyRef.current = false
              }
            }}
          >
            {busy ? 'Generating…' : 'Generate sharing code'}
          </button>
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {copied && (
        <p className="notes-message" role="status">
          {copied}
        </p>
      )}
      <button className="text-button" disabled={busy} onClick={onClose}>
        Back to note
      </button>
    </dialog>
  )
}

function NoteEditor({
  initial,
  uid,
  onSaved,
  onDeleted,
  onDirty,
  onShared,
}: {
  initial: Draft
  uid: string
  onSaved: (note: SavedNote) => void
  onDeleted: () => void
  onDirty: (dirty: boolean) => void
  onShared: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [document, setDocument] = useState<unknown>(initial.document)
  const [revision, setRevision] = useState(initial.revision)
  const [id, setId] = useState(initial.id)
  const [saved, setSaved] = useState<SavedNote | null>(
    initial.revision === null
      ? null
      : {
          ...initial,
          revision: initial.revision,
          text: plainText(initial.document),
          updatedAt: 0,
        },
  )
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [reload, setReload] = useState(0)
  const baseline = useRef(JSON.stringify([initial.title, initial.document]))
  const dirty = JSON.stringify([title, document]) !== baseline.current
  const characters = plainText(document as NoteNode).length
  useEffect(() => {
    onDirty(dirty || busy)
    return () => onDirty(false)
  }, [dirty, busy, title, document, onDirty])
  async function persist(copy = false) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setStatus('')
    try {
      // Validate before allocating a new ID so failed retries use the same ID.
      const payload = notePayload(title, document)
      const target = copy ? newNoteId(uid) : id
      const result = await saveNote(
        uid,
        target,
        payload.title,
        document,
        copy ? null : revision,
      )
      setId(result.id)
      setTitle(result.title)
      setRevision(result.revision)
      setSaved(result)
      baseline.current = JSON.stringify([result.title, document])
      setStatus('Saved.')
      setConflict(false)
      onSaved(result)
    } catch (failure) {
      setError(notesError(failure))
      setConflict(failure instanceof NoteConflict)
    } finally {
      setBusy(false)
      busyRef.current = false
    }
  }
  return (
    <section className="notes-editor" aria-label="Note editor">
      <div className="notes-editor-top">
        <span className="notes-editor-state" role="status">
          {busy
            ? 'Working…'
            : dirty
              ? 'Unsaved changes'
              : revision === null
                ? 'New note'
                : status || 'Saved'}
        </span>
        <div className="notes-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !saved || dirty}
            onClick={() => setSharing(true)}
          >
            Share note
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || (!dirty && revision !== null)}
            onClick={() => void persist()}
          >
            {busy ? 'Please wait…' : 'Save note'}
          </button>
        </div>
      </div>
      <label className="sr-only" htmlFor="note-heading">
        Note title
      </label>
      <input
        className="notes-title"
        id="note-heading"
        placeholder="Untitled note"
        maxLength={MAX_NOTE_TITLE}
        value={title}
        disabled={busy}
        onChange={(event) => {
          setTitle(event.target.value)
          setStatus('')
        }}
      />
      <RichText
        key={reload}
        initial={document as NoteNode}
        disabled={busy}
        onChange={(value) => {
          setDocument(value)
          setStatus('')
        }}
      />
      <div className="notes-editor-bottom">
        <p className={characters > MAX_NOTE_TEXT ? 'field-error' : 'size-hint'}>
          {characters.toLocaleString()} / 50,000 characters · Save your edits
          before sharing.
        </p>
        {revision !== null && (
          <button
            type="button"
            className="text-button danger-button"
            disabled={busy}
            onClick={() => setDeleting(!deleting)}
          >
            Delete note
          </button>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {conflict && (
        <div className="notes-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={async () => {
              if (
                dirty &&
                !window.confirm(
                  'Discard your unsaved edits and open the latest saved version?',
                )
              )
                return
              setBusy(true)
              setError('')
              try {
                const latest = await loadNote(uid, id)
                baseline.current = JSON.stringify([
                  latest.title,
                  latest.document,
                ])
                setTitle(latest.title)
                setDocument(latest.document)
                setRevision(latest.revision)
                setSaved(latest)
                setReload((n) => n + 1)
                setConflict(false)
                onSaved(latest)
              } catch (failure) {
                setError(notesError(failure))
              } finally {
                setBusy(false)
              }
            }}
          >
            Open latest version
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void persist(true)}
          >
            Save edits as new note
          </button>
        </div>
      )}
      {deleting && (
        <div
          className="notes-delete-confirm"
          role="group"
          aria-label="Confirm note deletion"
        >
          <p>
            Delete this saved note permanently? Existing temporary sharing codes
            will remain active until they expire.
          </p>
          <div className="notes-actions">
            <button
              className="secondary-button danger-button"
              disabled={busy}
              onClick={async () => {
                if (busyRef.current || revision === null) return
                busyRef.current = true
                setBusy(true)
                setError('')
                try {
                  await removeNote(uid, id, revision)
                  onDirty(false)
                  onDeleted()
                } catch (failure) {
                  setError(notesError(failure))
                  setConflict(failure instanceof NoteConflict)
                } finally {
                  setBusy(false)
                  busyRef.current = false
                }
              }}
            >
              Yes, delete note
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {sharing && saved && (
        <ShareNoteDialog
          note={saved}
          onClose={() => setSharing(false)}
          onShared={onShared}
        />
      )}
    </section>
  )
}

function NotesLibrary({
  uid,
  onShared,
}: {
  uid: string
  onShared: () => void
}) {
  const { requestedNote, leaveGuard } = useNotesAccount()
  const [notes, setNotes] = useState<SavedNote[]>([])
  const [cursor, setCursor] = useState<NotePage['cursor']>()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [opening, setOpening] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const dirty = useRef(false)
  const request = useRef(0)
  const selectionRequest = useRef(0)
  const editVersion = useRef(0)
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value
    if (value) editVersion.current++
  }, [])
  const confirmLeave = useCallback(
    () =>
      !dirty.current ||
      window.confirm('Leave this note and discard unsaved edits?'),
    [],
  )
  useEffect(() => {
    leaveGuard.current = confirmLeave
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const links = (event: MouseEvent) => {
      if ((event.target as Element).closest('a[href^="#"]') && !confirmLeave())
        event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', links, true)
    return () => {
      leaveGuard.current = null
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', links, true)
      request.current++
      selectionRequest.current++
    }
  }, [confirmLeave, leaveGuard])
  async function refresh(more = false) {
    const operation = ++request.current
    setLoading(true)
    setError('')
    try {
      const page = await loadNotes(uid, more ? cursor : undefined)
      if (request.current !== operation) return
      setNotes((old) =>
        more
          ? [
              ...new Map(
                [...old, ...page.notes].map((note) => [note.id, note]),
              ).values(),
            ]
          : page.notes,
      )
      setCursor(page.cursor)
      setWarning(
        page.unreadable
          ? 'A note with unsupported formatting could not be opened. Its saved data has not been changed.'
          : '',
      )
    } catch (failure) {
      if (request.current === operation) setError(notesError(failure))
    } finally {
      if (request.current === operation) setLoading(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [uid])
  const select = async (id: string) => {
    if (!confirmLeave()) return
    const editsAtStart = editVersion.current
    const operation = ++selectionRequest.current
    setLoading(true)
    setError('')
    try {
      const note = await loadNote(uid, id)
      if (operation !== selectionRequest.current) return
      if (editVersion.current !== editsAtStart && !confirmLeave()) return
      dirty.current = false
      setDraft(note)
      setOpening((n) => n + 1)
    } catch (failure) {
      if (operation === selectionRequest.current) setError(notesError(failure))
    } finally {
      if (operation === selectionRequest.current) setLoading(false)
    }
  }
  useEffect(() => {
    if (requestedNote) void select(requestedNote)
  }, [requestedNote])
  const visible = notes.filter((note) =>
    `${note.title}\n${note.text}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  )
  return (
    <div className="notes-workspace card">
      <aside className="notes-sidebar" aria-label="Saved notes library">
        <div className="notes-sidebar-head">
          <h2>Your notes</h2>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (!confirmLeave()) return
              selectionRequest.current++
              setLoading(false)
              dirty.current = false
              setDraft({
                id: newNoteId(uid),
                title: '',
                document: documentFromText(''),
                revision: null,
              })
              setOpening((n) => n + 1)
            }}
          >
            + New note
          </button>
        </div>
        <label htmlFor="notes-search" className="sr-only">
          Search loaded notes
        </label>
        <input
          id="notes-search"
          type="search"
          placeholder="Search your notes…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="notes-list-meta">
          <span>{notes.length} loaded</span>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => void refresh()}
          >
            Refresh notes
          </button>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {warning && (
          <p className="field-error" role="status">
            {warning}
          </p>
        )}
        {loading && (
          <p className="size-hint" role="status">
            Loading notes…
          </p>
        )}
        {!loading && !notes.length && !error && (
          <p className="notes-empty">
            A little space for what you want to keep. Create a note, or save
            text from Send or Receive.
          </p>
        )}
        {!!notes.length && !visible.length && (
          <p className="notes-empty">No matching notes in the loaded list.</p>
        )}
        <ul className="notes-list">
          {visible.map((note) => (
            <li key={note.id}>
              <button
                className={draft?.id === note.id ? 'active' : ''}
                type="button"
                aria-current={draft?.id === note.id ? 'true' : undefined}
                onClick={() => void select(note.id)}
              >
                <strong>{note.title}</strong>
                <span>{note.text.slice(0, 100)}</span>
                <time dateTime={new Date(note.updatedAt).toISOString()}>
                  {new Date(note.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </button>
            </li>
          ))}
        </ul>
        {cursor && (
          <>
            <button
              className="secondary-button"
              disabled={loading}
              onClick={() => void refresh(true)}
            >
              Load more notes
            </button>
            <p className="size-hint">
              Search checks loaded notes. Load more to search older notes.
            </p>
          </>
        )}
      </aside>
      {draft ? (
        <NoteEditor
          key={`${draft.id}:${opening}`}
          initial={draft}
          uid={uid}
          onShared={onShared}
          onDirty={setDirty}
          onSaved={(note) => {
            setNotes((old) =>
              [note, ...old.filter((item) => item.id !== note.id)].sort(
                (a, b) => b.updatedAt - a.updatedAt,
              ),
            )
            setDraft((current) => (current?.id === draft.id ? note : current))
          }}
          onDeleted={() => {
            dirty.current = false
            setNotes((old) => old.filter((item) => item.id !== draft.id))
            setDraft(null)
            void refresh()
          }}
        />
      ) : (
        <section className="notes-welcome">
          <span className="notes-welcome-icon" aria-hidden="true">
            ▤
          </span>
          <h2>Keep a thought.</h2>
          <p>
            Notes, snippets, and the words you’ll need later.
            <br />
            Choose a note or start a new one.
          </p>
          <p className="size-hint">
            Private to your account · No automatic expiry
          </p>
        </section>
      )}
    </div>
  )
}

export default function SavedNotes({ onShared }: { onShared: () => void }) {
  const { user, ready, logIn } = useNotesAccount()
  return (
    <>
      <div className="intro notes-intro">
        <p className="eyebrow">A place to keep things</p>
        <h1>Saved notes.</h1>
        <p>
          {user
            ? 'Your words, kept for later. Share a temporary copy whenever you need.'
            : 'Save a thought now. Find it on your next device.'}
        </p>
      </div>
      {notesAreLocal && (
        <p className="notes-local">
          Local preview · notes use Firebase Auth and Firestore emulators on
          this computer.
        </p>
      )}
      {!ready ? (
        <p role="status">Checking your account…</p>
      ) : user ? (
        <>
          <p className="notes-account-label">
            Signed in as <span>{user.email}</span>
          </p>
          <NotesLibrary key={user.uid} uid={user.uid} onShared={onShared} />
        </>
      ) : (
        <section className="card notes-signin">
          <span className="notes-welcome-icon" aria-hidden="true">
            ▤
          </span>
          <h2>A notebook of your own.</h2>
          <p>
            Log in or create an account to save, edit, and find your notes
            across devices. Sending and receiving temporary text still works
            without an account.
          </p>
          <button className="primary-button" onClick={() => void logIn()}>
            Log in or create account
          </button>
        </section>
      )}
      <p className="size-hint notes-private-hint">
        Notes stay in your account until you delete them. Text only, up to
        50,000 characters per note. Save is manual; formatting stays in your
        notes and sharing sends plain text. Log out when you finish on a shared
        computer.
      </p>
    </>
  )
}
