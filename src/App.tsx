import { withDemoStore } from './indexed-store'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  countWords,
  isValidCode,
  normalizeCode,
  MAX_WORDS,
  MAX_BYTES,
  textBytes,
  ShareError,
  type Duration,
  type SharedNote,
  type Failure,
} from './demo-store'

type Mode = 'send' | 'receive'
type View =
  Mode | 'generating' | 'generated' | 'retrieving' | 'received' | 'failure'
type Simulation = 'normal' | 'network' | 'rate-limited'

function Icon({
  children,
  size = 20,
  className = '',
}: {
  children: ReactNode
  size?: number
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  )
}

function CopyIcon() {
  return (
    <Icon size={18}>
      <rect
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
        width="13"
        x="8"
        y="8"
      />
      <path
        d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </Icon>
  )
}

function ArrowIcon() {
  return (
    <Icon size={18}>
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </Icon>
  )
}

function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick}>
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      <span>TextBridge</span>
    </button>
  )
}

function Header({
  onSend,
  onReceive,
  theme,
  onTheme,
}: {
  theme: 'light' | 'dark'
  onTheme: () => void
  onSend: () => void
  onReceive: () => void
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand onClick={onSend} />
        <nav aria-label="Primary navigation">
          <button className="nav-link" onClick={onSend}>
            Send text
          </button>
          <span className="nav-divider" />
          <button className="nav-link" onClick={onReceive}>
            Receive text
          </button>
          <button
            className="theme-toggle"
            onClick={onTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            {theme === 'dark' ? 'Light' : 'Dark'} mode
          </button>
        </nav>
      </div>
    </header>
  )
}

function ModeTabs({
  mode,
  onSend,
  onReceive,
}: {
  mode: 'send' | 'receive'
  onSend: () => void
  onReceive: () => void
}) {
  return (
    <div className="mode-row">
      <div
        className="mode-tabs"
        role="tablist"
        aria-label="TextBridge mode"
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const next =
              event.key === 'Home'
                ? 'send'
                : event.key === 'End'
                  ? 'receive'
                  : mode === 'send'
                    ? 'receive'
                    : 'send'
            if (next === 'send') onSend()
            else onReceive()
            document.getElementById(`tab-${next}`)?.focus()
          }
        }}
      >
        <button
          id="tab-send"
          aria-controls="tool-panel"
          tabIndex={mode === 'send' ? 0 : -1}
          aria-selected={mode === 'send'}
          className={mode === 'send' ? 'mode-tab active' : 'mode-tab'}
          onClick={onSend}
          role="tab"
        >
          <Icon size={17}>
            <path
              d="M5 12h14m-5-5 5 5-5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </Icon>
          Send
        </button>
        <button
          id="tab-receive"
          aria-controls="tool-panel"
          tabIndex={mode === 'receive' ? 0 : -1}
          aria-selected={mode === 'receive'}
          className={mode === 'receive' ? 'mode-tab active' : 'mode-tab'}
          onClick={onReceive}
          role="tab"
        >
          <Icon size={17}>
            <path
              d="M19 12H5m5-5-5 5 5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </Icon>
          Receive
        </button>
      </div>
      <span className="prototype-badge">
        <span /> Local demo · this browser only
      </span>
    </div>
  )
}

function Intro({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description: string
}) {
  return (
    <div className="intro">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  )
}

function SendView({
  text,
  setText,
  duration,
  setDuration,
  onGenerate,
}: {
  text: string
  setText: (text: string) => void
  duration: Duration
  setDuration: (duration: Duration) => void
  onGenerate: () => void
}) {
  const { count, bytes } = useMemo(
    () => ({ count: countWords(text), bytes: textBytes(text) }),
    [text],
  )
  const tooLong = count > MAX_WORDS || bytes > MAX_BYTES
  return (
    <>
      <Intro
        title="Move text. Skip the friction."
        description="Notes, links, and code snippets. One short code. No account needed."
      />
      <form
        className="card composer"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim() && !tooLong) onGenerate()
        }}
      >
        <div className="field-head">
          <label htmlFor="shared-text">Text or link</label>
          <span
            id="word-count"
            className={count > 95000 ? 'count count-warning' : 'count'}
          >
            {count.toLocaleString()} / 100,000 words
          </span>
        </div>
        <textarea
          id="shared-text"
          aria-describedby={
            tooLong ? 'word-count size-hint text-error' : 'word-count size-hint'
          }
          aria-invalid={tooLong}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            'Paste anything you want to move…\nLinks, notes, or a code snippet.'
          }
          rows={8}
          value={text}
          spellCheck={false}
        />
        <p id="size-hint" className="size-hint">
          Up to 100,000 words · 20 MiB of text. Words are separated by spaces or
          line breaks.
        </p>
        {tooLong && (
          <p id="text-error" className="field-error" role="alert">
            {bytes > MAX_BYTES
              ? 'This text exceeds 20 MiB. Shorten it to continue.'
              : `Remove ${(count - MAX_WORDS).toLocaleString()} ${count - MAX_WORDS === 1 ? 'word' : 'words'} to continue.`}
          </p>
        )}
        <div className="form-footer">
          <fieldset>
            <legend>Keep for</legend>
            <div className="duration-group">
              {(['10 minutes', '30 minutes'] as Duration[]).map((option) => (
                <label
                  className={
                    duration === option ? 'duration active' : 'duration'
                  }
                  key={option}
                >
                  <input
                    checked={duration === option}
                    name="duration"
                    onChange={() => setDuration(option)}
                    type="radio"
                    value={option}
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            className="primary-button"
            disabled={!text.trim() || tooLong}
            type="submit"
          >
            Generate code <ArrowIcon />
          </button>
        </div>
      </form>
    </>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const copy = async () => {
    if (timer.current) clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(value)
      setStatus('copied')
    } catch {
      setStatus('error')
    }
    timer.current = setTimeout(() => setStatus('idle'), 4000)
  }
  return (
    <>
      <button className="copy-button code-copy" onClick={copy}>
        <CopyIcon />
        {status === 'copied' ? 'Copied!' : label}
      </button>
      <div role="status" className={status === 'idle' ? 'toast' : 'toast show'}>
        {status === 'copied'
          ? `${label === 'Copy code' ? 'Code' : 'Text'} copied to clipboard.`
          : status === 'error'
            ? 'Could not copy. Select the content and copy it manually.'
            : ''}
      </div>
    </>
  )
}

function Expiry({ note }: { note: SharedNote }) {
  return (
    <span>
      Expires at{' '}
      <time dateTime={new Date(note.expiresAt).toISOString()}>
        {new Date(note.expiresAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </time>{' '}
      · {note.duration} from creation
    </span>
  )
}

function GeneratedView({
  note,
  onNew,
}: {
  note: SharedNote
  onNew: () => void
}) {
  return (
    <>
      <Intro
        eyebrow="Code ready"
        title="Your sharing code is ready."
        description="Use this code to retrieve the text before it expires."
      />
      <section className="card code-result" aria-labelledby="code-result-title">
        <div className="code-result-main">
          <span className="mini-label" id="code-result-title">
            Sharing code
          </span>
          <strong
            className="sharing-code"
            aria-label={`Sharing code: ${note.code}`}
          >
            {note.code}
          </strong>
          <CopyButton value={note.code} label="Copy code" />
          <div className="expiry-row">
            <span className="status-dot" />
            <Expiry note={note} />
          </div>
        </div>
        <div className="code-instructions">
          <Icon size={21}>
            <rect
              height="18"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.6"
              width="12"
              x="6"
              y="3"
            />
            <path
              d="M10 17.5h4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
          </Icon>
          <p>
            On the other device, open TextBridge, choose Receive, and enter this
            code.
          </p>
          <small>
            For now, test Receive in this browser or another tab at the same
            address. Cross-device sharing is not connected yet.
          </small>
        </div>
        <div className="result-footer">
          <p>Open this code as often as you need until it expires.</p>
          <button className="secondary-button" onClick={onNew}>
            Send another
          </button>
        </div>
      </section>
    </>
  )
}

function ReceiveView({
  code,
  setCode,
  onSubmit,
}: {
  code: string
  setCode: (code: string) => void
  onSubmit: () => void
}) {
  const [submitted, setSubmitted] = useState(false)
  const invalid = submitted && !isValidCode(code)
  return (
    <>
      <Intro
        title="Receive shared text."
        description="Enter the six-character code shown on the sending device."
      />
      <form
        className="card receiver-card"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (isValidCode(code)) onSubmit()
        }}
      >
        <label htmlFor="sharing-code">Enter sharing code</label>
        <p id="code-hint">
          Spaces and hyphens are ignored. Lowercase works too.
        </p>
        <input
          id="sharing-code"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={invalid ? 'code-hint code-error' : 'code-hint'}
          aria-invalid={invalid}
          onChange={(event) => {
            setCode(normalizeCode(event.target.value))
            setSubmitted(false)
          }}
          placeholder="ABC234"
          value={code}
        />
        {invalid && (
          <p id="code-error" className="field-error" role="alert">
            Use exactly 6 letters or numbers, excluding O, 0, I, and 1.
          </p>
        )}
        <button className="primary-button receiver-submit" type="submit">
          View text <ArrowIcon />
        </button>
      </form>
    </>
  )
}

function ReceivedView({
  note,
  onAnother,
}: {
  note: SharedNote
  onAnother: () => void
}) {
  return (
    <>
      <Intro
        eyebrow={`Code ${note.code}`}
        title="Text received."
        description="Your text, just as it was sent. Ready for its next stop."
      />
      <section className="card note-card" aria-labelledby="note-title">
        <div className="note-head">
          <div>
            <span className="status-dot" />
            <span id="note-title">Shared text</span>
          </div>
          <CopyButton value={note.text} label="Copy text" />
        </div>
        <pre tabIndex={0} aria-label="Shared text content">
          {note.text}
        </pre>
        <div className="note-footer">
          <p>
            <Expiry note={note} />
            <br />
            You can retrieve this text again until it expires.
          </p>
          <button className="secondary-button" onClick={onAnother}>
            Receive another
          </button>
        </div>
      </section>
    </>
  )
}

const stateContent: Record<
  Failure,
  {
    tag: string
    title: string
    body: string
  }
> = {
  'not-found': {
    tag: 'Code unavailable',
    title: 'Code not found or expired.',
    body: 'Check the code and try again, or ask the sender for a new one. Demo codes only work in the browser where they were created.',
  },
  invalid: {
    tag: 'Check your input',
    title: 'Something needs another look.',
    body: 'Use up to 100,000 words (20 MiB maximum), one of the two expiration choices, and a valid six-character code.',
  },
  network: {
    tag: 'Demo connection error',
    title: 'The bridge is down.',
    body: 'This is a simulated network error. Your input is still here. Try again when you are ready.',
  },
  storage: {
    tag: 'Browser storage unavailable',
    title: 'Your browser couldn’t save or read this note.',
    body: 'Storage may be full or blocked. Allow site storage or free some space, then try again. Your input is still here.',
  },
  'rate-limited': {
    tag: 'Request paused',
    title: 'Too many attempts. Take a moment.',
    body: 'Wait up to a minute, then try again. Demo limits are 5 creations and 20 lookups per minute in this browser. These are not server abuse protection.',
  },
}

function EmptyState({
  kind,
  mode,
  onAction,
}: {
  kind: Failure
  mode: Mode
  onAction: () => void
}) {
  const content = stateContent[kind]
  return (
    <section className="state-card" role="alert">
      <div className="state-icon error">
        <Icon size={28}>
          <path
            d="M12 8v4.5m0 3.5h.01M5.1 20h13.8a2 2 0 0 0 1.74-3L13.74 5a2 2 0 0 0-3.48 0L3.36 17a2 2 0 0 0 1.74 3Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </Icon>
      </div>
      <p className="eyebrow">{content.tag}</p>
      <h1>{content.title}</h1>
      <p>{content.body}</p>
      <button className="primary-button" onClick={onAction}>
        Back to {mode === 'send' ? 'Send' : 'Receive'} <ArrowIcon />
      </button>
    </section>
  )
}

function LoadingView({ mode }: { mode: Mode }) {
  return (
    <section role="status" className="state-card loading-state">
      <div className="loader" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">
        {mode === 'send' ? 'Generating code' : 'Checking code'}
      </p>
      <h1>
        {mode === 'send' ? 'Building your bridge…' : 'Fetching the text…'}
      </h1>
      <p>This should only take a moment.</p>
    </section>
  )
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('textbridge:theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch {
      /* Theme still works without persistence. */
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f6f9f6' : '#0b0d0c')
    try {
      localStorage.setItem('textbridge:theme', theme)
    } catch {
      /* Optional preference only. */
    }
  }, [theme])
  const [mode, setMode] = useState<Mode>(() =>
    window.location.pathname.replace(/\/$/, '') === '/receive'
      ? 'receive'
      : 'send',
  )
  const [view, setView] = useState<View>(mode)
  const [note, setNote] = useState<SharedNote | null>(null)
  const [text, setText] = useState('')
  const [duration, setDuration] = useState<Duration>('10 minutes')
  const [code, setCode] = useState('')
  const [failure, setFailure] = useState<Failure>('not-found')
  const [simulation, setSimulation] = useState<Simulation>('normal')
  const request = useRef(0)
  const mainRef = useRef<HTMLElement>(null)

  // Invalidate pending demo requests when the user changes screens.
  const navigate = (next: Mode, updateHistory = true) => {
    request.current++
    const path = next === 'receive' ? '/receive' : '/'
    if (updateHistory && window.location.pathname !== path)
      window.history.pushState({}, '', path)
    setMode(next)
    setView(next)
    setNote(null)
  }
  useEffect(() => {
    const pop = () =>
      navigate(
        window.location.pathname.replace(/\/$/, '') === '/receive'
          ? 'receive'
          : 'send',
        false,
      )
    window.addEventListener('popstate', pop)
    return () => {
      window.removeEventListener('popstate', pop)
      request.current++
    }
  }, [])

  useEffect(() => {
    if (!['send', 'receive'].includes(view)) mainRef.current?.focus()
  }, [view])

  // Expiry is checked at retrieval AND while the result is open, including after sleep.
  useEffect(() => {
    if (!note || !['generated', 'received'].includes(view)) return
    const expire = () => {
      if (Date.now() >= note.expiresAt) {
        setNote(null)
        setFailure('not-found')
        setView('failure')
        try {
          void withDemoStore((store) => store.cleanup()).catch(() => {})
        } catch {
          /* Display expiry even if storage is blocked. */
        }
      }
    }
    const timer = window.setInterval(expire, 1000)
    document.addEventListener('visibilitychange', expire)
    window.addEventListener('pageshow', expire)
    expire()
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', expire)
      window.removeEventListener('pageshow', expire)
    }
  }, [note, view])

  const run = async (operation: Mode) => {
    const id = ++request.current
    const simulatedFailure = simulation
    setSimulation('normal')
    setView(operation === 'send' ? 'generating' : 'retrieving')
    await new Promise((resolve) => setTimeout(resolve, 550))
    if (id !== request.current) return
    try {
      if (simulatedFailure !== 'normal') throw new ShareError(simulatedFailure)
      const result = await withDemoStore((store) =>
        operation === 'send'
          ? store.create(text, duration)
          : store.retrieve(code),
      )
      if (id !== request.current) return
      setNote(result)
      setView(operation === 'send' ? 'generated' : 'received')
      if (operation === 'send') setText('')
    } catch (error) {
      if (id !== request.current) return
      setNote(null)
      setFailure(error instanceof ShareError ? error.kind : 'storage')
      setView('failure')
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to sharing tool
      </a>
      <Header
        theme={theme}
        onTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onReceive={() => navigate('receive')}
        onSend={() => navigate('send')}
      />
      <main
        id="main"
        className={`page page-${view}`}
        ref={mainRef}
        tabIndex={-1}
      >
        <ModeTabs
          mode={mode}
          onReceive={() => navigate('receive')}
          onSend={() => navigate('send')}
        />
        <div className="demo-banner">
          <span className="demo-label">DEMO</span>
          <p>
            Stored only in this browser. Cross-device sharing is not connected
            yet.
          </p>
        </div>
        <section
          id="tool-panel"
          role="tabpanel"
          aria-labelledby={`tab-${mode}`}
        >
          {view === 'send' && (
            <SendView
              text={text}
              setText={setText}
              duration={duration}
              setDuration={setDuration}
              onGenerate={() => run('send')}
            />
          )}
          {(view === 'generating' || view === 'retrieving') && (
            <LoadingView mode={mode} />
          )}
          {view === 'generated' && note && (
            <GeneratedView
              note={note}
              onNew={() => {
                setDuration('10 minutes')
                navigate('send')
              }}
            />
          )}
          {view === 'receive' && (
            <ReceiveView
              code={code}
              setCode={setCode}
              onSubmit={() => run('receive')}
            />
          )}
          {view === 'received' && note && (
            <ReceivedView
              note={note}
              onAnother={() => {
                setCode('')
                navigate('receive')
              }}
            />
          )}
          {view === 'failure' && (
            <EmptyState
              kind={failure}
              mode={mode}
              onAction={() => navigate(mode)}
            />
          )}
        </section>
        <p className="privacy-note">
          Anyone who knows an active code can read its text until it expires.
        </p>
        <details className="demo-controls">
          <summary>Demo testing options</summary>
          <label htmlFor="simulation">Next request</label>
          <select
            id="simulation"
            value={simulation}
            onChange={(event) =>
              setSimulation(event.target.value as Simulation)
            }
          >
            <option value="normal">Normal behavior</option>
            <option value="network">Simulate network error</option>
            <option value="rate-limited">Simulate rate limit</option>
          </select>
          <p>
            Applies once to Generate code or View text. No server is connected.
          </p>
        </details>
      </main>
      <footer>
        <p>
          TextBridge <span>·</span> A little bridge between your devices.
        </p>
      </footer>
    </div>
  )
}
