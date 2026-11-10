import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from 'firebase/auth'
import {
  firebaseSession,
  notesAreLocal,
  withAuthOperation,
} from './firebase-session'
import { documentFromText, titleFromText } from './note-document'
import { notesError } from './notes-error'

type SaveDraft = { id?: string; uid?: string; text?: string }

type Account = {
  user: User | null
  ready: boolean
  saving: boolean
  requestedNote: string | null
  logIn: () => Promise<User | null>
  logOut: () => Promise<void>
  saveText: (text: string, draft?: SaveDraft) => Promise<string | null>
  openSaved: (id?: string) => void
  confirmLeave: () => boolean
  leaveGuard: React.MutableRefObject<(() => boolean) | null>
}
const Context = createContext<Account | null>(null)
export function useNotesAccount() {
  const value = useContext(Context)
  if (!value) throw new Error('Notes account provider missing.')
  return value
}

function authError(error: unknown) {
  const code = (error as { code?: string })?.code
  if (code === 'auth/operation-not-allowed')
    return 'Email/password accounts are not enabled yet. The owner needs to enable this provider in Firebase Authentication.'
  if (code === 'auth/network-request-failed')
    return notesAreLocal
      ? 'Start npm run notes:emulators, then try again.'
      : 'Could not connect. Check your internet connection and try again.'
  if (code === 'auth/too-many-requests')
    return 'Too many attempts. Please wait a few minutes before trying again.'
  if (
    code === 'auth/weak-password' ||
    code === 'auth/password-does-not-meet-requirements'
  )
    return 'Choose a stronger password that meets this project’s password policy.'
  return 'Could not complete this request. Check your email and password, or try logging in if you already have an account.'
}

function AccountDialog({
  onComplete,
  onCancel,
  saving,
}: {
  onComplete: (user: User) => void
  onCancel: () => void
  saving: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  function switchMode(next: typeof mode) {
    setMode(next)
    setError('')
    setMessage('')
    setPassword('')
    setConfirm('')
  }
  return (
    <dialog
      className="account-dialog"
      ref={dialog}
      aria-labelledby="account-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <div className="account-dialog-head">
        <span className="eyebrow">Your private space</span>
        <button
          className="dialog-close"
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close account dialog"
        >
          ×
        </button>
      </div>
      <h2 id="account-title">
        {mode === 'signup'
          ? 'Create your account.'
          : mode === 'reset'
            ? 'Reset your password.'
            : 'Welcome back.'}
      </h2>
      <p className="muted">
        {saving
          ? 'Log in to save a private copy of your text. Your text will stay here.'
          : 'Keep your notes together, wherever you open TextBridge.'}
      </p>
      {notesAreLocal && (
        <p className="notes-local">
          Local test accounts only · Firebase emulators
        </p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          setMessage('')
          if (mode === 'signup' && password !== confirm) {
            setError('The passwords do not match.')
            return
          }
          setBusy(true)
          try {
            const { auth } = firebaseSession()
            await auth.authStateReady()
            if (mode === 'reset') {
              await sendPasswordResetEmail(auth, email.trim())
              setMessage(
                notesAreLocal
                  ? 'Password reset link generated in the emulator terminal. No real email is sent in local testing.'
                  : 'If this email has an account, a reset link will arrive shortly. Check your spam folder too.',
              )
            } else {
              const credential = await withAuthOperation(() =>
                mode === 'signup'
                  ? createUserWithEmailAndPassword(auth, email.trim(), password)
                  : signInWithEmailAndPassword(auth, email.trim(), password),
              )
              setPassword('')
              setConfirm('')
              onComplete(credential.user)
            }
          } catch (failure) {
            setError(authError(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy}>
          <label htmlFor="account-email">Email</label>
          <input
            id="account-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
          {mode !== 'reset' && (
            <>
              <label htmlFor="account-password">Password</label>
              <input
                id="account-password"
                type="password"
                autoComplete={
                  mode === 'signup' ? 'new-password' : 'current-password'
                }
                required
                minLength={mode === 'signup' ? 8 : undefined}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={
                  mode === 'signup' ? 'password-hint' : undefined
                }
              />
              {mode === 'signup' && (
                <>
                  <p className="size-hint" id="password-hint">
                    At least 8 characters. Use a password you don’t use
                    elsewhere.
                  </p>
                  <label htmlFor="account-confirm">Confirm password</label>
                  <input
                    id="account-confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </>
              )}
            </>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="notes-message" role="status">
              {message}
            </p>
          )}
          <button className="primary-button" type="submit">
            {busy
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'reset'
                  ? 'Send reset link'
                  : 'Log in'}
          </button>
        </fieldset>
      </form>
      <div className="account-switch">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
        >
          {mode === 'signup'
            ? 'Already have an account? Log in'
            : 'New here? Create an account'}
        </button>
        {mode !== 'reset' && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => switchMode('reset')}
          >
            Forgot password?
          </button>
        )}
        {mode === 'reset' && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => switchMode('login')}
          >
            Back to log in
          </button>
        )}
      </div>
      <p className="size-hint">
        This device uses a session login. Always log out before leaving a shared
        computer.
      </p>
    </dialog>
  )
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [requestedNote, setRequestedNote] = useState<string | null>(null)
  const [notice, setNotice] = useState<{
    text: string
    id?: string
    error?: boolean
  } | null>(null)
  const waiting = useRef<((user: User | null) => void)[]>([])
  const leaveGuard = useRef<(() => boolean) | null>(null)
  const confirmLeave = () => leaveGuard.current?.() ?? true
  useEffect(() => {
    try {
      return onAuthStateChanged(firebaseSession().auth, (current) => {
        setUser(current && !current.isAnonymous ? current : null)
        setReady(true)
        setNotice(null)
        setRequestedNote(null)
      })
    } catch {
      setReady(true)
    }
  }, [])
  useEffect(
    () => () => waiting.current.splice(0).forEach((resolve) => resolve(null)),
    [],
  )
  const finish = (current: User | null) => {
    setShowAccount(false)
    waiting.current.splice(0).forEach((resolve) => resolve(current))
  }
  const logIn = async () => {
    try {
      const { auth } = firebaseSession()
      await auth.authStateReady()
      if (auth.currentUser && !auth.currentUser.isAnonymous)
        return auth.currentUser
    } catch {
      setNotice({
        text: 'Firebase accounts are not configured. Please contact the site owner.',
        error: true,
      })
      return null
    }
    setShowAccount(true)
    return new Promise<User | null>((resolve) => waiting.current.push(resolve))
  }
  const openSaved = (id?: string) => {
    if (!confirmLeave()) return
    setRequestedNote(id || null)
    if (window.location.pathname !== '/saved') {
      window.history.pushState({}, '', '/saved')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
    setNotice(null)
  }
  const value: Account = {
    user,
    ready,
    saving,
    requestedNote,
    logIn,
    openSaved,
    confirmLeave,
    leaveGuard,
    logOut: async () => {
      if (!confirmLeave()) return
      try {
        await withAuthOperation(() => signOut(firebaseSession().auth))
        setNotice(null)
        setRequestedNote(null)
      } catch {
        setNotice({
          text: 'Could not log out. Please try again before leaving this device.',
          error: true,
        })
      }
    },
    saveText: async (text, draft = {}) => {
      if (savingRef.current) return null
      savingRef.current = true
      setSaving(true)
      setNotice(null)
      try {
        const document = documentFromText(text)
        const current = await logIn()
        if (!current) return null
        const { newNoteId, saveNote } = await import('./notes-client')
        if (draft.uid !== current.uid || draft.text !== text) {
          draft.id = newNoteId(current.uid)
          draft.uid = current.uid
          draft.text = text
        }
        const id = draft.id!
        await saveNote(current.uid, id, titleFromText(text), document, null)
        if (firebaseSession().auth.currentUser?.uid !== current.uid) return null
        setNotice({ text: 'Saved to your private notes.', id })
        return id
      } catch (error) {
        setNotice({ text: notesError(error), error: true })
        return null
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
  }
  return (
    <Context.Provider value={value}>
      {children}
      {showAccount && (
        <AccountDialog
          onComplete={finish}
          onCancel={() => finish(null)}
          saving={saving}
        />
      )}
      {notice && (
        <div
          className={`notes-toast${notice.error ? ' notes-toast-error' : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          <span>{notice.text}</span>
          {notice.id && (
            <button
              className="text-button"
              onClick={() => openSaved(notice.id)}
            >
              Open note
            </button>
          )}
          <button
            className="dialog-close"
            aria-label="Dismiss message"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  )
}

export function AccountButton() {
  const { user, ready, logIn, logOut } = useNotesAccount()
  return (
    <button
      className="secondary-button account-button"
      disabled={!ready}
      onClick={() => (user ? void logOut() : void logIn())}
      title={user?.email || undefined}
    >
      {!ready ? 'Account…' : user ? 'Log out' : 'Log in'}
    </button>
  )
}

export function SaveToNotes({ text }: { text: string }) {
  const { user, saveText, saving, openSaved } = useNotesAccount()
  const [saved, setSaved] = useState<{
    id: string
    uid: string
    text: string
  } | null>(null)
  const draft = useRef<SaveDraft>({})
  const currentSaved =
    saved?.text === text && saved.uid === user?.uid ? saved : null
  return (
    <div className="save-to-notes">
      <button
        className="secondary-button"
        type="button"
        disabled={!text.trim() || saving || !!currentSaved}
        onClick={async () => {
          const id = await saveText(text, draft.current)
          const uid = firebaseSession().auth.currentUser?.uid
          if (id && uid) setSaved({ id, uid, text })
        }}
      >
        {saving ? 'Saving…' : currentSaved ? '✓ Saved' : 'Save to Notes'}
      </button>
      {currentSaved && (
        <button
          className="text-button"
          type="button"
          onClick={() => openSaved(currentSaved.id)}
        >
          Open note
        </button>
      )}
    </div>
  )
}
