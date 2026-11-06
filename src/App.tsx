import { QRCodeSVG } from 'qrcode.react'
import HelpSections from './HelpSections'
import { withShareStore, usingBackend } from './share-client'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  countWords,
  isValidCode,
  normalizeCode,
  MAX_WORDS,
  fileIsAllowed,
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
  activeMode,
  theme,
  onTheme,
}: {
  theme: 'light' | 'dark'
  onTheme: () => void
  onSend: () => void
  onReceive: () => void
  activeMode: Mode
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand onClick={onSend} />
        <nav aria-label="Primary navigation">
          <button className="nav-link" onClick={onSend}>
            Share now
          </button>
          <a className="nav-link" href="#how-it-works">
            How it works
          </a>
          <a className="nav-link" href="#faq">
            FAQ
          </a>
          <a className="nav-link" href="#contact">
            Contact
          </a>
          <button
            className="header-mode-link"
            onClick={onReceive}
            aria-current={activeMode === 'receive' ? 'page' : undefined}
          >
            Receive
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
        <details className="mobile-menu">
          <summary aria-label="Open navigation">Menu</summary>
          <div className="mobile-menu-links">
            <button onClick={onSend}>Share now</button>
            <button onClick={onReceive}>Receive</button>
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQ</a>
            <a href="#contact">Contact</a>
          </div>
        </details>
      </div>
    </header>
  )
}

function ModeTabs({
  mode,
  onSend,
  onReceive,
  compact = false,
}: {
  mode: 'send' | 'receive'
  onSend: () => void
  onReceive: () => void
  compact?: boolean
}) {
  return (
    <div className={compact ? 'mode-row mode-row-compact' : 'mode-row'}>
      <div
        className="mode-tabs"
        role="group"
        aria-label="Sharing mode"
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
          type="button"
          aria-controls="tool-panel"
          aria-pressed={mode === 'send'}
          className={mode === 'send' ? 'mode-tab active' : 'mode-tab'}
          onClick={onSend}
        >
          <Icon size={17}>
            <path
              d="M12 19V5m-5 5 5-5 5 5"
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
          type="button"
          aria-controls="tool-panel"
          aria-pressed={mode === 'receive'}
          className={mode === 'receive' ? 'mode-tab active' : 'mode-tab'}
          onClick={onReceive}
        >
          <Icon size={17}>
            <path
              d="M12 5v14m-5-5 5 5 5-5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </Icon>
          Receive
        </button>
      </div>
      <span
        className="prototype-badge"
        title={
          usingBackend
            ? 'Local Firebase testing only. Sharing works between browsers on this computer while the app and emulators are running. Nothing is public online.'
            : 'Local demo only. Sharing works in this browser and is not connected to a public server.'
        }
      >
        <span /> {usingBackend ? 'Local test' : 'Demo'}
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
  contentKind,
  setContentKind,
  file,
  setFile,
  mode,
  onSend,
  onReceive,
}: {
  text: string
  setText: (text: string) => void
  duration: Duration
  setDuration: (duration: Duration) => void
  onGenerate: () => void
  contentKind: 'text' | 'file'
  setContentKind: (kind: 'text' | 'file') => void
  file: File | null
  setFile: (file: File | null) => void
  mode: Mode
  onSend: () => void
  onReceive: () => void
}) {
  const { count, bytes } = useMemo(
    () => ({ count: countWords(text), bytes: textBytes(text) }),
    [text],
  )
  const tooLong = count > MAX_WORDS || bytes > MAX_BYTES
  const valid =
    contentKind === 'text'
      ? !!text.trim() && !tooLong
      : !!file && fileIsAllowed(file)
  return (
    <>
      <Intro
        title="Move text. Skip the friction."
        description="Text, links, code snippets, or a file. No account needed."
      />
      <form
        className="card composer"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) onGenerate()
        }}
      >
        <div className="composer-toolbar">
          <ModeTabs mode={mode} onSend={onSend} onReceive={onReceive} compact />
          <fieldset className="content-choice">
            <legend className="sr-only">What would you like to share?</legend>
            <div className="kind-switch">
              {(['text', 'file'] as const).map((kind) => (
                <label
                  className={
                    contentKind === kind ? 'duration active' : 'duration'
                  }
                  key={kind}
                >
                  <input
                    type="radio"
                    name="content-kind"
                    checked={contentKind === kind}
                    onChange={() => setContentKind(kind)}
                  />
                  {kind === 'text' ? 'Text' : 'File'}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {contentKind === 'text' ? (
          <>
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
                tooLong
                  ? 'word-count size-hint text-error'
                  : 'word-count size-hint'
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
              Up to 100,000 words · 20 MiB of text. Words are separated by
              spaces or line breaks.
            </p>
            {tooLong && (
              <p id="text-error" className="field-error" role="alert">
                {bytes > MAX_BYTES
                  ? 'This text exceeds 20 MiB. Shorten it to continue.'
                  : `Remove ${(count - MAX_WORDS).toLocaleString()} ${count - MAX_WORDS === 1 ? 'word' : 'words'} to continue.`}
              </p>
            )}
          </>
        ) : (
          <div className="file-picker">
            <label htmlFor="shared-file">Choose a file</label>
            <p id="file-hint">
              PDF, JPG, PNG, documents, ZIP, and other files under 20 MB. One
              file per code.
            </p>
            <input
              id="shared-file"
              type="file"
              aria-describedby={
                file && !fileIsAllowed(file)
                  ? 'file-hint file-error'
                  : 'file-hint'
              }
              aria-invalid={!!file && !fileIsAllowed(file)}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {file && (
              <div className="file-details">
                <strong>{file.name}</strong>
                <span>{formatBytes(file.size)}</span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setFile(null)
                    const input = document.getElementById(
                      'shared-file',
                    ) as HTMLInputElement
                    input.value = ''
                  }}
                >
                  Remove file
                </button>
              </div>
            )}
            {file && !fileIsAllowed(file) && (
              <p id="file-error" role="alert" className="field-error">
                Choose a file smaller than 20 MB (20,000,000 bytes).
              </p>
            )}
          </div>
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
          <button className="primary-button" disabled={!valid} type="submit">
            Generate code <ArrowIcon />
          </button>
        </div>
        <p className="local-note">
          {usingBackend
            ? 'Local test only · share between browsers on this computer while Firebase emulators are running.'
            : 'Local demo only · sharing is stored in this browser and is not public yet.'}
        </p>
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
      {status !== 'idle' && (
        <div
          role="status"
          className={status === 'copied' ? 'sr-only' : 'toast show'}
        >
          {status === 'copied'
            ? `${label.replace('Copy ', '').replace(/^./, (letter) => letter.toUpperCase())} copied to clipboard.`
            : status === 'error'
              ? 'Could not copy. Select the content and copy it manually.'
              : ''}
        </div>
      )}
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
  const link = new URL('/receive', window.location.origin)
  link.hash = note.code
  const shareLink = link.href
  return (
    <>
      <Intro
        eyebrow="Code ready"
        title="Your sharing code is ready."
        description={
          note.file
            ? `Your file is ready: ${note.file.name}`
            : 'Use the code or link to retrieve your text before it expires.'
        }
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
        <div className="sharing-options">
          <div className="sharing-link">
            <label htmlFor="share-link">Sharing link</label>
            <input
              id="share-link"
              readOnly
              value={shareLink}
              onFocus={(event) => event.target.select()}
            />
            <div className="link-actions">
              <CopyButton value={shareLink} label="Copy link" />
              <a className="secondary-button" href={shareLink}>
                Open link
              </a>
            </div>
          </div>
          <figure className="sharing-qr">
            <QRCodeSVG
              value={shareLink}
              size={192}
              level="M"
              marginSize={4}
              bgColor="#ffffff"
              fgColor="#000000"
              role="img"
              title="QR code for sharing link"
            />
            <figcaption>Scan to open the sharing link</figcaption>
          </figure>
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
            Use the code, open the link, or scan the QR code to reach Receive.
          </p>
          <small>
            {usingBackend
              ? 'Local Firebase: open this link in Chrome or Safari on this computer. Phone sharing needs a reachable website address; 127.0.0.1 refers to each device itself.'
              : 'Local demo: links work in this browser only. Scanning with a phone or opening in another browser cannot retrieve this item yet. A shared backend is still required.'}
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
  mode,
  onSend,
  onReceive,
}: {
  code: string
  setCode: (code: string) => void
  onSubmit: () => void
  mode: Mode
  onSend: () => void
  onReceive: () => void
}) {
  const [submitted, setSubmitted] = useState(false)
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (pendingCaret.current !== null) {
      inputRef.current?.setSelectionRange(
        pendingCaret.current,
        pendingCaret.current,
      )
      pendingCaret.current = null
    }
  })
  const invalid = submitted && !isValidCode(code)
  return (
    <>
      <Intro
        title="Receive shared content."
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
        <div className="receiver-toolbar">
          <ModeTabs mode={mode} onSend={onSend} onReceive={onReceive} compact />
        </div>
        <label htmlFor="sharing-code">Enter sharing code</label>
        <p id="code-hint">
          Spaces and hyphens are ignored. Lowercase works too.
        </p>
        <div className="segmented-code">
          <div className="code-slots" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <span
                key={index}
                className="code-slot"
                data-active={focused && index === Math.min(selection.start, 5)}
                data-selected={
                  focused && index >= selection.start && index < selection.end
                }
                data-invalid={invalid}
              >
                {code[index] || <span className="slot-placeholder" />}
              </span>
            ))}
          </div>
          <input
            ref={inputRef}
            id="sharing-code"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={invalid ? 'code-hint code-error' : 'code-hint'}
            aria-invalid={invalid}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSelect={(event) => {
              const input = event.currentTarget
              setSelection({
                start: input.selectionStart ?? 0,
                end: input.selectionEnd ?? 0,
              })
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              const input = event.currentTarget
              const bounds = input.getBoundingClientRect()
              const position = Math.min(
                code.length,
                6,
                Math.max(
                  0,
                  Math.floor(
                    (event.clientX - bounds.left) / (bounds.width / 6),
                  ),
                ),
              )
              input.focus()
              input.setSelectionRange(position, position)
              setSelection({ start: position, end: position })
            }}
            onChange={(event) => {
              const position = normalizeCode(
                event.target.value.slice(
                  0,
                  event.target.selectionStart ?? event.target.value.length,
                ),
              ).length
              pendingCaret.current = position
              setCode(normalizeCode(event.target.value))
              setSelection({ start: position, end: position })
              setSubmitted(false)
            }}
            placeholder="ABC234"
            value={code}
          />
        </div>
        {code.length > 6 && !invalid && (
          <p className="field-error" role="alert">
            The code is too long. Enter only the six-character sharing code.
          </p>
        )}
        {invalid && (
          <p id="code-error" className="field-error" role="alert">
            Use exactly 6 letters or numbers, excluding O, 0, I, and 1.
          </p>
        )}
        <button className="primary-button receiver-submit" type="submit">
          View content <ArrowIcon />
        </button>
        <p className="local-note">
          {usingBackend
            ? 'Local test only · Firebase emulators must stay running.'
            : 'Local demo only · codes are not shared with other browsers yet.'}
        </p>
      </form>
    </>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} bytes`
  const unit = bytes < 1_000_000 ? 'KB' : 'MB'
  const divisor = unit === 'KB' ? 1000 : 1_000_000
  return `${(bytes / divisor).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`
}

function FileDownload({ note }: { note: SharedNote }) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const objectUrl = useRef<string | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])
  const download = async () => {
    setBusy(true)
    setStatus('')
    try {
      const current = await withShareStore((store) => store.retrieve(note.code))
      if (!mounted.current) return
      if (!current.blob || !current.file || current.expiresAt <= Date.now())
        throw new Error('unavailable')
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = URL.createObjectURL(
        new Blob([current.blob], { type: 'application/octet-stream' }),
      )
      const anchor = document.createElement('a')
      anchor.href = objectUrl.current
      anchor.download = current.file.name
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setStatus('Download started.')
    } catch {
      if (!mounted.current) return
      setStatus(
        'Could not download. The item may have expired, the connection may be unavailable, or the request limit was reached. Try receiving it again.',
      )
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <div className="file-received">
      <p className="file-name">{note.file?.name}</p>
      <p>{formatBytes(note.file?.size ?? 0)} · File</p>
      <button className="primary-button" disabled={busy} onClick={download}>
        {busy ? 'Preparing download…' : 'Download file'}
      </button>
      <p role="status">{status}</p>
    </div>
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
        title={note.file ? 'File received.' : 'Text received.'}
        description={
          note.file
            ? 'Download your file before it expires.'
            : 'Your text, just as it was sent. Ready for its next stop.'
        }
      />
      <section className="card note-card" aria-labelledby="note-title">
        <div className="note-head">
          <div>
            <span className="status-dot" />
            <span id="note-title">
              {note.file ? 'Shared file' : 'Shared text'}
            </span>
          </div>
          {!note.file && <CopyButton value={note.text} label="Copy text" />}
        </div>
        {note.file ? (
          <FileDownload note={note} />
        ) : (
          <pre tabIndex={0} aria-label="Shared text content">
            {note.text}
          </pre>
        )}
        <div className="note-footer">
          <p>
            <Expiry note={note} />
            <br />
            You can retrieve this item again until it expires.
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
    body: usingBackend
      ? 'Check the code and expiry, or ask the sender for a new one. Codes from the old browser-only demo are not stored in Firebase.'
      : 'Check the code and try again, or ask the sender for a new one. Demo codes only work in the browser where they were created.',
  },
  invalid: {
    tag: 'Check your input',
    title: 'Something needs another look.',
    body: 'Use up to 100,000 words (20 MiB maximum), or a file under 20 MB, one of the two expiration choices, and a valid six-character code.',
  },
  network: {
    tag: usingBackend ? 'Connection unavailable' : 'Demo connection error',
    title: 'The bridge is down.',
    body: usingBackend
      ? 'Could not reach the local Firebase backend. Keep the emulators running, then try again. Your input is still here.'
      : 'This is a simulated network error. Your input is still here. Try again when you are ready.',
  },
  storage: {
    tag: 'Browser storage unavailable',
    title: 'Your browser couldn’t save or read this note.',
    body: 'Storage may be full or blocked. Allow site storage or free some space, then try again. Your input is still here.',
  },
  'rate-limited': {
    tag: 'Request paused',
    title: 'Too many attempts. Take a moment.',
    body: usingBackend
      ? 'Wait up to a minute, then try again. The server limits creation, code lookups, and download volume. Browsers sharing a network address share these limits.'
      : 'Wait up to a minute, then try again. Demo limits are 5 creations and 20 lookups per minute in this browser. These are not server abuse protection.',
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
        {mode === 'send' ? 'Building your bridge…' : 'Fetching your content…'}
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
  const [contentKind, setContentKind] = useState<'text' | 'file'>('text')
  const [file, setFile] = useState<File | null>(null)
  const [code, setCode] = useState(() =>
    normalizeCode(window.location.hash.slice(1)),
  )
  const [failure, setFailure] = useState<Failure>('not-found')
  const [simulation, setSimulation] = useState<Simulation>('normal')
  const request = useRef(0)
  const mainRef = useRef<HTMLElement>(null)

  // Invalidate pending demo requests when the user changes screens.
  const navigate = (next: Mode, updateHistory = true) => {
    request.current++
    const path = next === 'receive' ? '/receive' : '/'
    if (
      updateHistory &&
      (window.location.pathname !== path || window.location.hash)
    )
      window.history.pushState({}, '', path)
    setMode(next)
    setView(next)
    setNote(null)
  }
  useEffect(() => {
    const pop = () => {
      setCode(normalizeCode(window.location.hash.slice(1)))
      navigate(
        window.location.pathname.replace(/\/$/, '') === '/receive'
          ? 'receive'
          : 'send',
        false,
      )
    }
    window.addEventListener('popstate', pop)
    window.addEventListener('hashchange', pop)
    return () => {
      window.removeEventListener('popstate', pop)
      window.removeEventListener('hashchange', pop)
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
          void withShareStore((store) => store.cleanup()).catch(() => {})
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
    if (!usingBackend) await new Promise((resolve) => setTimeout(resolve, 550))
    if (id !== request.current) return
    try {
      if (simulatedFailure !== 'normal') throw new ShareError(simulatedFailure)
      const result = await withShareStore((store) =>
        operation === 'send'
          ? contentKind === 'file' && file
            ? store.createFile(file, duration)
            : store.create(text, duration)
          : store.retrieve(code),
      )
      if (id !== request.current) return
      setNote(result)
      setView(operation === 'send' ? 'generated' : 'received')
      if (operation === 'send') {
        setText('')
        setFile(null)
      }
    } catch (error) {
      if (id !== request.current) return
      setNote(null)
      setFailure(error instanceof ShareError ? error.kind : 'storage')
      setView('failure')
    }
  }

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          mainRef.current?.focus()
        }}
      >
        Skip to sharing tool
      </a>
      <Header
        theme={theme}
        activeMode={mode}
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
        {!['send', 'receive'].includes(view) && (
          <ModeTabs
            mode={mode}
            onReceive={() => navigate('receive')}
            onSend={() => navigate('send')}
          />
        )}
        <section id="tool-panel">
          {view === 'send' && (
            <SendView
              contentKind={contentKind}
              setContentKind={setContentKind}
              file={file}
              setFile={setFile}
              text={text}
              setText={setText}
              duration={duration}
              setDuration={setDuration}
              onGenerate={() => run('send')}
              mode={mode}
              onSend={() => navigate('send')}
              onReceive={() => navigate('receive')}
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
              mode={mode}
              onSend={() => navigate('send')}
              onReceive={() => navigate('receive')}
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
          Anyone with an active code or link can access its content until it
          expires.
        </p>
        <HelpSections />
        {!usingBackend && (
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
              Applies once to Generate code or View content. No server is
              connected.
            </p>
          </details>
        )}
      </main>
      <footer>
        <p>
          TextBridge <span>·</span> A little bridge between your devices.
        </p>
      </footer>
    </div>
  )
}
