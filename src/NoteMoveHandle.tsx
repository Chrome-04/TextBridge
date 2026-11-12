import { useRef, useState } from 'react'

export default function NoteMoveHandle({
  id,
  title,
  disabled,
  canEarlier,
  canLater,
  onMove,
  onStep,
  onDrag,
}: {
  id: string
  title: string
  disabled: boolean
  canEarlier: boolean
  canLater: boolean
  onMove: (source: string, target: string) => void
  onStep: (direction: -1 | 1) => void
  onDrag: (source: string | null, target: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const gesture = useRef<{
    x: number
    y: number
    target: string | null
    moved: boolean
  } | null>(null)
  const skipClick = useRef(false)
  function end(cancel = false) {
    const current = gesture.current
    gesture.current = null
    onDrag(null, null)
    if (!current?.moved) return
    skipClick.current = true
    setOpen(false)
    if (!cancel && current.target) onMove(id, current.target)
  }
  return (
    <div
      className="note-move-control"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false)
          event.stopPropagation()
        }
      }}
    >
      <button
        type="button"
        className="note-move-handle"
        aria-label={`Move ${title}`}
        title="Drag to rearrange, or click for move buttons"
        aria-expanded={open}
        aria-describedby="notes-move-help"
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            const direction = event.key === 'ArrowUp' ? -1 : 1
            if (direction === -1 ? canEarlier : canLater) onStep(direction)
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary || disabled) return
          gesture.current = {
            x: event.clientX,
            y: event.clientY,
            target: null,
            moved: false,
          }
          skipClick.current = false
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const current = gesture.current
          if (!current) return
          if (
            !current.moved &&
            Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8
          )
            return
          current.moved = true
          const card = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>('[data-note-id]')
          const candidate = card?.dataset.noteId
          current.target = candidate && candidate !== id ? candidate : null
          onDrag(id, current.target)
          if (event.clientY < 72) window.scrollBy(0, -16)
          else if (event.clientY > window.innerHeight - 72)
            window.scrollBy(0, 16)
        }}
        onPointerUp={() => end()}
        onPointerCancel={() => end(true)}
        onLostPointerCapture={() => {
          if (gesture.current) end(true)
        }}
        onClick={() => {
          if (skipClick.current) {
            skipClick.current = false
            return
          }
          setOpen(!open)
        }}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          {[5, 10, 15].flatMap((y) =>
            [7, 13].map((x) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />
            )),
          )}
        </svg>
      </button>
      {open && (
        <div
          className="note-move-options"
          role="group"
          aria-label={`Move ${title}`}
        >
          <button
            type="button"
            disabled={disabled || !canEarlier}
            onClick={() => {
              setOpen(false)
              onStep(-1)
            }}
          >
            ← Move earlier
          </button>
          <button
            type="button"
            disabled={disabled || !canLater}
            onClick={() => {
              setOpen(false)
              onStep(1)
            }}
          >
            Move later →
          </button>
        </div>
      )}
    </div>
  )
}
