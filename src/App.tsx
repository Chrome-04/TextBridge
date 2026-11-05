import { useEffect, useRef, useState, type ReactNode } from "react"

type Duration = "10 minutes" | "1 hour"
type View = "send" | "generating" | "generated" | "receive" | "retrieving" | "received" | "not-found" | "error" | "rate-limited"

type SharedNote = {
  code: string
  text: string
  duration: Duration
  expiresAt: number
}

const STORAGE_KEY = "textbridge-prototype-note"
const DEMO_NOTE: SharedNote = {
  code: "K7MP4X",
  text: `Here are the launch notes:

• Final review at 3:30 PM
• Preview: https://textbridge.example/demo

Run this before you push:
npm run build

See you on the other side.`,
  duration: "1 hour",
  expiresAt: Date.now() + 60 * 60 * 1000,
}

function Icon({
  children,
  size = 20,
  className = "",
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
}: {
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
  mode: "send" | "receive"
  onSend: () => void
  onReceive: () => void
}) {
  return (
    <div className="mode-row">
      <div className="mode-tabs" role="tablist" aria-label="TextBridge mode">
        <button
          aria-selected={mode === "send"}
          className={mode === "send" ? "mode-tab active" : "mode-tab"}
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
          aria-selected={mode === "receive"}
          className={mode === "receive" ? "mode-tab active" : "mode-tab"}
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
        <span /> Local prototype · this browser only
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
  onGenerate,
}: {
  onGenerate: (text: string, duration: Duration) => void
}) {
  const [text, setText] = useState("")
  const [duration, setDuration] = useState<Duration>("10 minutes")

  return (
    <>
      <Intro
        title="Move text. Skip the friction."
        description="Paste a note and create a short code. No account, no history."
      />
      <form
        className="card composer"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim()) onGenerate(text, duration)
        }}
      >
        <div className="field-head">
          <label htmlFor="shared-text">Text or link</label>
          <span
            className={text.length > 9500 ? "count count-warning" : "count"}
          >
            {text.length.toLocaleString()} / 10,000
          </span>
        </div>
        <textarea
          autoFocus
          id="shared-text"
          maxLength={10000}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            "Paste anything you want to move…\nLinks, notes, or a code snippet."
          }
          rows={8}
          value={text}
        />
        <div className="form-footer">
          <fieldset>
            <legend>Keep for</legend>
            <div className="duration-group">
              {(["10 minutes", "1 hour"] as Duration[]).map((option) => (
                <label
                  className={
                    duration === option ? "duration active" : "duration"
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
            disabled={!text.trim()}
            type="submit"
          >
            Generate code <ArrowIcon />
          </button>
        </div>
      </form>
      <p className="privacy-note">
        <Icon size={16}>
          <path
            d="M12 3 5.5 5.6v5.3c0 4.2 2.7 8.1 6.5 9.6 3.8-1.5 6.5-5.4 6.5-9.6V5.6L12 3Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            d="m9.5 12 1.6 1.6 3.5-3.7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </Icon>
        Prototype codes stay in this browser and disappear when their timer
        ends.
      </p>
    </>
  )
}

function GeneratedView({
  note,
  onNew,
}: {
  note: SharedNote
  onNew: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.code)
    } catch {
      // Clipboard access can be unavailable in an embedded prototype.
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      <Intro
        eyebrow="Code ready"
        title="Your sharing code is ready."
        description="Use this code to retrieve the text before its timer ends."
      />
      <section className="card code-result" aria-labelledby="code-result-title">
        <div className="code-result-main">
          <span className="mini-label" id="code-result-title">
            Sharing code
          </span>
          <strong className="sharing-code" aria-label={note.code}>
            {note.code}
          </strong>
          <button className="copy-button code-copy" onClick={copy}>
            <CopyIcon /> {copied ? "Copied" : "Copy code"}
          </button>
          <div className="expiry-row">
            <span className="status-dot" />
            <span>Expires in {note.duration}</span>
            <span className="dot-separator">·</span>
            <span>Repeat access allowed</span>
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
            On your other device, open TextBridge, choose Receive, and enter
            this code.
          </p>
          <small>
            Local prototype: cross-device sharing won’t work until a backend is
            connected. Test this code in the current browser.
          </small>
        </div>
        <div className="result-footer">
          <p>Anyone with this code can read the text until it expires.</p>
          <button className="secondary-button" onClick={onNew}>
            Send another
          </button>
        </div>
      </section>
      <div aria-live="polite" className={copied ? "toast show" : "toast"}>
        <span className="check">✓</span> Code copied to clipboard
      </div>
    </>
  )
}

function cleanCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)
}

function ReceiveView({
  initialCode,
  onSubmit,
}: {
  initialCode: string
  onSubmit: (code: string) => void
}) {
  const [code, setCode] = useState(initialCode)

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
          if (code.length === 6) onSubmit(code)
        }}
      >
        <label htmlFor="sharing-code">Enter sharing code</label>
        <p>Spaces and hyphens are ignored.</p>
        <input
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          autoFocus
          id="sharing-code"
          inputMode="text"
          onChange={(event) => setCode(cleanCode(event.target.value))}
          placeholder="K7MP4X"
          spellCheck={false}
          value={code}
        />
        <button
          className="primary-button receiver-submit"
          disabled={code.length !== 6}
          type="submit"
        >
          View text <ArrowIcon />
        </button>
        <div className="demo-code">
          <span>Try the demo</span>
          <button onClick={() => setCode(DEMO_NOTE.code)} type="button">
            Use K7MP4X
          </button>
        </div>
      </form>
      <p className="privacy-note">
        Local prototype only — codes are not available on other devices.
      </p>
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
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.text)
    } catch {
      // Clipboard access can be unavailable in an embedded prototype.
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      <Intro
        eyebrow={`Code ${note.code}`}
        title="Text received."
        description={`Available for the remainder of its ${note.duration} timer.`}
      />
      <section className="card note-card" aria-labelledby="note-title">
        <div className="note-head">
          <div>
            <span className="status-dot" />
            <span id="note-title">Ready to copy</span>
          </div>
          <button className="secondary-button copy-text-button" onClick={copy}>
            <CopyIcon /> {copied ? "Copied" : "Copy text"}
          </button>
        </div>
        <pre>{note.text}</pre>
        <div className="note-footer">
          <p>You can open this code again until it expires.</p>
          <button className="secondary-button" onClick={onAnother}>
            Receive another
          </button>
        </div>
      </section>
      <div aria-live="polite" className={copied ? "toast show" : "toast"}>
        <span className="check">✓</span> Text copied to clipboard
      </div>
    </>
  )
}

const stateContent = {
  "not-found": {
    tag: "Code unavailable",
    title: "Code not found or expired.",
    body: "Check the six characters and try again. The sender may also need to generate a new code.",
    action: "Try another code",
  },
  error: {
    tag: "Connection interrupted",
    title: "The bridge is down.",
    body: "We couldn’t retrieve the text. Check your connection, then try once more.",
    action: "Try again",
  },
  "rate-limited": {
    tag: "Request paused",
    title: "Too many attempts—try again later.",
    body: "We’ve paused code lookups for a moment. Wait a little while before trying again.",
    action: "Back to Receive",
  },
} as const

function EmptyState({
  kind,
  onAction,
}: {
  kind: "not-found" | "error" | "rate-limited"
  onAction: () => void
}) {
  const content = stateContent[kind]
  return (
    <section className="state-card" aria-live="polite">
      <div className={`state-icon ${kind}`}>
        {kind === "error" ? (
          <Icon size={28}>
            <path
              d="M4 8.5a12 12 0 0 1 16 0M7 12a7.5 7.5 0 0 1 10 0m-7 3.5a3 3 0 0 1 4 0M3 3l18 18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.7"
            />
          </Icon>
        ) : (
          <Icon size={28}>
            <path
              d="M12 8v4.5m0 3.5h.01M5.1 20h13.8a2 2 0 0 0 1.74-3L13.74 5a2 2 0 0 0-3.48 0L3.36 17a2 2 0 0 0 1.74 3Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </Icon>
        )}
      </div>
      <p className="eyebrow">{content.tag}</p>
      <h1>{content.title}</h1>
      <p>{content.body}</p>
      <button className="primary-button" onClick={onAction}>
        {content.action} <ArrowIcon />
      </button>
    </section>
  )
}

function LoadingView({ mode }: { mode: "send" | "receive" }) {
  return (
    <section aria-live="polite" className="state-card loading-state">
      <div className="loader">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">
        {mode === "send" ? "Generating code" : "Checking code"}
      </p>
      <h1>
        {mode === "send" ? "Building your bridge…" : "Fetching the text…"}
      </h1>
      <p>This should only take a moment.</p>
      <div className="skeleton">
        <i />
        <i />
        <i />
      </div>
    </section>
  )
}

const prototypeViews: { value: View label: string }[] = [
  { value: "send", label: "Send" },
  { value: "generating", label: "Generating" },
  { value: "generated", label: "Code ready" },
  { value: "receive", label: "Receive" },
  { value: "retrieving", label: "Retrieving" },
  { value: "received", label: "Text received" },
  { value: "not-found", label: "Not found / expired" },
  { value: "error", label: "Network error" },
  { value: "rate-limited", label: "Too many attempts" },
]

function PrototypeSwitcher({
  view,
  onChange,
}: {
  view: View
  onChange: (view: View) => void
}) {
  return (
    <aside className="prototype-switcher" aria-label="Prototype state controls">
      <span>Prototype state</span>
      <select
        aria-label="Choose a prototype state"
        onChange={(event) => onChange(event.target.value as View)}
        value={view}
      >
        {prototypeViews.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </aside>
  )
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from(
    { length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("")
}

function getStoredNote(): SharedNote | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY)
    if (!value) return null
    return JSON.parse(value) as SharedNote
  } catch {
    return null
  }
}

export default function App() {
  const initialReceive = window.location.pathname === "/receive"
  const [view, setView] = useState<View>(initialReceive ? "receive" : "send")
  const [note, setNote] = useState<SharedNote>(
    () => getStoredNote() ?? DEMO_NOTE,
  )
  const [receivedNote, setReceivedNote] = useState<SharedNote | null>(null)
  const [enteredCode, setEnteredCode] = useState("")
  const [failedAttempts, setFailedAttempts] = useState(0)
  const mainRef = useRef<HTMLElement>(null)

  const focusMain = () => window.setTimeout(() => mainRef.current?.focus(), 0)

  const setPrototypeView = (nextView: View) => {
    setView(nextView)
    if (nextView === "received" && !receivedNote) setReceivedNote(note)
    focusMain()
  }

  const navigate = (mode: "send" | "receive", replace = false) => {
    const path = mode === "receive" ? "/receive" : "/"
    window.history[replace ? "replaceState" : "pushState"]({}, "", path)
    setView(mode)
    setEnteredCode("")
    focusMain()
  }

  useEffect(() => {
    const handlePopState = () =>
      navigate(
        window.location.pathname === "/receive" ? "receive" : "send",
        true,
      )
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const generate = (text: string, duration: Duration) => {
    setView("generating")
    const generated: SharedNote = {
      code: makeCode(),
      text,
      duration,
      expiresAt:
        Date.now() +
        (duration === "10 minutes" ? 10 * 60 * 1000 : 60 * 60 * 1000),
    }
    window.setTimeout(() => {
      setNote(generated)
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(generated))
      setView("generated")
      focusMain()
    }, 700)
  }

  const retrieve = (code: string) => {
    setEnteredCode(code)
    setView("retrieving")
    window.setTimeout(() => {
      const stored = getStoredNote()
      const candidates = [stored, note, DEMO_NOTE].filter(
        (candidate): candidate is SharedNote => Boolean(candidate),
      )
      const match = candidates.find(
        (candidate) =>
          candidate.code === code && candidate.expiresAt > Date.now(),
      )
      if (match) {
        setReceivedNote(match)
        setFailedAttempts(0)
        setView("received")
      } else {
        const attempts = failedAttempts + 1
        setFailedAttempts(attempts)
        setView(attempts >= 3 ? "rate-limited" : "not-found")
      }
      focusMain()
    }, 700)
  }

  const receiverMode = [
    "receive",
    "retrieving",
    "received",
    "not-found",
    "error",
    "rate-limited",
  ].includes(view)

  return (
    <div className="app-shell">
      <Header
        onReceive={() => navigate("receive")}
        onSend={() => navigate("send")}
      />
      <main className={`page page-${view}`} ref={mainRef} tabIndex={-1}>
        <ModeTabs
          mode={receiverMode ? "receive" : "send"}
          onReceive={() => navigate("receive")}
          onSend={() => navigate("send")}
        />
        {view === "send" && <SendView onGenerate={generate} />}
        {view === "generating" && <LoadingView mode="send" />}
        {view === "generated" && (
          <GeneratedView note={note} onNew={() => navigate("send")} />
        )}
        {view === "receive" && (
          <ReceiveView initialCode={enteredCode} onSubmit={retrieve} />
        )}
        {view === "retrieving" && <LoadingView mode="receive" />}
        {view === "received" && receivedNote && (
          <ReceivedView
            note={receivedNote}
            onAnother={() => {
              setEnteredCode("")
              setView("receive")
              focusMain()
            }}
          />
        )}
        {(view === "not-found" ||
          view === "error" ||
          view === "rate-limited") && (
          <EmptyState
            kind={view}
            onAction={() => {
              setView("receive")
              focusMain()
            }}
          />
        )}
      </main>
      <footer>
        <p>
          TextBridge <span>·</span> Local prototype · no backend connected
        </p>
      </footer>
      <PrototypeSwitcher onChange={setPrototypeView} view={view} />
    </div>
  )
}
